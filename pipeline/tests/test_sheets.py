import json
import re

import pytest

from opsite.build import check_envelope
from opsite.data import OPSITE, read_yaml
from opsite.lint import check_text
from pipeline.export import SHEETS, load_entrypoints, load_sheets, load_wanted

from .conftest import ROOT

STRONG = re.compile(r"обязан|имеете право|(?<![А-Яа-яЁё])должн", re.I)
BANNED = re.compile(r"положено", re.I)
UNITS = re.compile(r"\d+(?:[.,]\d+)?\s?(?:мг|мкг|мл|ЕД|таб|мм рт|%)", re.I)
PLACEHOLDER = re.compile(r"\{([a-z0-9_]+)\}")


@pytest.fixture(scope="module")
def sheets():
    return {s["id"]: s for s in load_sheets(ROOT)}


def texts(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("id", "kind", "path", "repo", "params", "quote_id", "norm_ids", "field_ids", "now_ids",
                     "region_roles", "groups", "suggest_id", "autocomplete", "value", "next", "outcomes", "start",
                     "source_ref", "version", "verified_at", "reviewed_at", "anchor", "branch", "type", "storage"):
                continue
            yield from texts(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from texts(v, f"{path}[{i}]")
    elif isinstance(node, str):
        yield path, node


def claim_nodes(sheet):
    for sec in sheet["sections"]:
        for b in sec["blocks"]:
            yield b, [b.get("title", ""), b.get("text", ""), *b.get("lines", [])]
            for it in b.get("items", []):
                yield it, [it["text"], it.get("detail", "")]
    for o in (sheet.get("tree") or {}).get("outcomes", []):
        yield o, [o["title"], o["what"], *o.get("take", [])]
    for q in (sheet.get("tree") or {}).get("questions", []):
        yield q, [q["text"], q.get("help", "")]
    for f in sheet["fields"]:
        yield f, [f["label"], f.get("hint", ""), f.get("print_label", ""), f.get("fixed_caption", "")]


def test_five_sheets_pass_schema(sheets):
    assert list(sheets) == list(SHEETS)


def test_fixtures_pass_schemas():
    for name in ("sheets", "entrypoints", "norm-view", "region-view", "holiday-runs"):
        env = json.loads((ROOT / "tests" / "fixtures" / f"{name}.json").read_text(encoding="utf-8"))
        check_envelope(env, ROOT / "data" / "schema" / f"{name}.schema.json", f"fixture {name}")


@pytest.mark.parametrize("sid", ["night", "emergency"])
def test_locked_line_first(sheets, sid):
    first = sheets[sid]["sections"][0]
    assert first["side"] in (1, None)
    block = first["blocks"][0]
    assert block["kind"] == "locked"
    assert block["print"] is True
    assert sorted(block["now_ids"]) == ["ambulance", "emergency"]
    assert "103" in block["text"] and "112" in block["text"]


def test_wishes_caption(sheets):
    wishes = next(f for f in sheets["emergency"]["fields"] if f["id"] == "wishes")
    assert wishes["fixed_caption"] == "Это не юридический отказ от реанимации"


def test_emergency_fields_and_qr(sheets):
    fields = sheets["emergency"]["fields"]
    assert 15 <= len(fields) <= 19
    qr = [f for f in fields if f.get("qr_order") is not None]
    assert all(f.get("qr_key") for f in qr)
    orders = [f["qr_order"] for f in qr]
    assert len(orders) == len(set(orders))
    assert sorted(orders) == list(range(1, len(orders) + 1))
    skip = {"wishes", "pain_signs", "seizures", "pain_relief"}
    assert not skip & {f["id"] for f in qr}


def test_pain_relief_and_usual_values(sheets):
    fields = {f["id"]: f for f in sheets["emergency"]["fields"]}
    pr = fields["pain_relief"]
    assert pr.get("autocomplete") == "off" and "suggest" not in pr and "demo" not in pr
    assert "Мы не подсказываем значения" in fields["usual_values"]["hint"]
    assert "demo" not in fields["usual_values"]


def test_no_banned_words(sheets):
    for sid, sheet in sheets.items():
        for path, text in texts(sheet):
            assert not BANNED.search(text), f"{sid}{path}: «положено»"


def test_strong_words_need_norms(sheets):
    for sid, sheet in sheets.items():
        for node, strings in claim_nodes(sheet):
            if any(STRONG.search(s) for s in strings):
                assert node.get("norm_ids") and node.get("quote_refs"), f"{sid}/{node.get('id')}: сильная формулировка без нормы и цитаты"


def test_text_lint(sheets):
    for sid, sheet in sheets.items():
        for path, text in texts(sheet):
            found = [f for f in check_text(text, sid, 0, prose=False) if f.level == "error"]
            assert not found, f"{sid}{path}: {found[0].text}"
            assert "!" not in text, f"{sid}{path}: восклицательный знак"
            assert not UNITS.search(text), f"{sid}{path}: единицы или пороги"


def test_field_refs(sheets):
    for sid, sheet in sheets.items():
        ids = {f["id"] for f in sheet["fields"]}
        used = set()
        for sec in sheet["sections"]:
            for b in sec["blocks"]:
                assert set(b.get("field_ids", [])) <= ids, f"{sid}/{b['id']}: неизвестное поле"
                used |= set(b.get("field_ids", []))
                for line in b.get("lines", []):
                    for name in PLACEHOLDER.findall(line):
                        assert name in b.get("field_ids", []), f"{sid}/{b['id']}: подстановка {name}"
        assert ids <= used | {"checked_by"} or sid == "emergency", f"{sid}: поля без блока {ids - used}"
        if sid == "emergency":
            assert ids <= used


def test_unique_ids(sheets):
    for sid, sheet in sheets.items():
        blocks = [b["id"] for s in sheet["sections"] for b in s["blocks"]]
        assert len(blocks) == len(set(blocks)), sid
        items = [i["id"] for s in sheet["sections"] for b in s["blocks"] for i in b.get("items", [])]
        assert len(items) == len(set(items)), sid
        assert len({s["id"] for s in sheet["sections"]}) == len(sheet["sections"])


def test_print_pages_match_paper(sheets):
    for sid, sheet in sheets.items():
        assert set(sheet["print_pages"]) == set(sheet["paper"]), sid


def test_validity_rules(sheets):
    assert sheets["night"]["validity"] == {"rule": "recheck", "recheck_days": 183, "line_days": 365}
    assert sheets["emergency"]["validity"] == {"rule": "watermark", "watermark_days": 90}
    assert sheets["night"]["storage"] == "save" and sheets["emergency"]["storage"] == "ask"
    for sid in ("discharge", "conclusion", "ahead"):
        assert sheets[sid]["storage"] == "none"


def test_drafts_and_review(sheets):
    expected = {"night": "both", "emergency": "medical", "discharge": "both", "conclusion": "both", "ahead": "legal"}
    for sid, sheet in sheets.items():
        assert sheet["draft"] == expected[sid]
        if sheet["review"]["needs"] != "none" and sheet["review"]["reviewed_by"] is None:
            assert sheet["draft"] != "none"


def test_no_placeholders(sheets):
    for sid, sheet in sheets.items():
        ph = [b["id"] for s in sheet["sections"] for b in s["blocks"] if b["kind"] == "placeholder"]
        assert not ph, f"{sid}: заглушки {ph}"


def test_emergency_dispatcher_script(sheets):
    sheet = sheets["emergency"]
    fields = {f["id"]: f for f in sheet["fields"]}
    blocks = {b["id"]: b for s in sheet["sections"] for b in s["blocks"]}
    script = blocks["dispatcher"]
    assert script["kind"] == "script" and script["print"] is True
    assert script["review"]["needs"] == "medical"
    assert set(script["field_ids"]) == {"child_name", "birth_date", "diagnosis", "breathing", "address"}
    assert fields["address"].get("qr_order") is None and fields["address"]["type"] == "textarea"
    form_only = [b for b in blocks.values() if "address" in b.get("field_ids", []) and b["kind"] == "fields"]
    assert form_only and all(b["print"] is False for b in form_only)


def test_address_printed_once(sheets):
    for sid in ("night", "emergency"):
        printed = [b["id"] for s in sheets[sid]["sections"] for b in s["blocks"]
                   if "address" in b.get("field_ids", []) and b.get("print") is not False]
        assert len(printed) == 1, f"{sid}: адрес на листе в блоках {printed}"


def test_verified_claims_have_scan_source(sheets):
    quotes = {q["id"]: q for q in load_wanted(ROOT)["quotes"]}
    for sid, sheet in sheets.items():
        for node, _ in claim_nodes(sheet):
            refs = [r["quote_id"] for r in node.get("quote_refs", [])]
            if not refs or node.get("verified") is not True:
                continue
            src = node.get("source_ref", "")
            assert src.startswith("raw/") and (ROOT / src).is_file(), f"{sid}/{node['id']}: нет выдержки из скана"
            for r in refs:
                assert quotes[r]["found_in_scan"], f"{sid}/{node['id']}: {r} не найден в публикации"


def test_norm_ids_registered(sheets):
    wanted = load_wanted(ROOT)
    acts = {a["id"] for a in wanted["acts"]}
    quotes = {q["id"]: q for q in wanted["quotes"]}
    for q in quotes.values():
        assert q["norm_id"] in acts
    vendor_acts = ROOT / "vendor" / "pal-norms" / "v1" / "acts.json"
    vendor_ids = set()
    if vendor_acts.is_file():
        vendor_ids = {a["id"] for a in json.loads(vendor_acts.read_text(encoding="utf-8"))["items"]}
    for sid, sheet in sheets.items():
        for node, _ in claim_nodes(sheet):
            for n in node.get("norm_ids", []):
                assert n in acts, f"{sid}/{node['id']}: норма {n} не в data/norm-ids.yaml"
                if vendor_ids and n not in vendor_ids:
                    import warnings
                    warnings.warn(f"{n} нет в снимке pal-norms")
            for ref in node.get("quote_refs", []):
                assert ref["quote_id"] in quotes, f"{sid}/{node['id']}: цитата {ref['quote_id']}"
                assert quotes[ref["quote_id"]]["norm_id"] in node.get("norm_ids", []), f"{sid}/{node['id']}"


def test_tree(sheets):
    tree = sheets["ahead"]["tree"]
    qs = {q["id"]: q for q in tree["questions"]}
    outs = {o["id"]: o for o in tree["outcomes"]}
    assert 3 <= len(qs) <= 7
    assert tree["start"] in qs
    for q in qs.values():
        for opt in q["options"]:
            assert opt.get("next") or opt.get("outcomes"), f"{q['id']}/{opt['value']}"
            if opt.get("next"):
                assert opt["next"] in qs
            for o in opt.get("outcomes", []):
                assert o in outs
    always = {o for o, v in outs.items() if v.get("always")}
    assert always == {"poa-ends"}

    def walk(qid, seen):
        assert qid not in seen, f"цикл через {qid}"
        for opt in qs[qid]["options"]:
            got = set(opt.get("outcomes", []))
            if opt.get("next"):
                yield from ((got | g) for g in walk(opt["next"], seen | {qid}))
            else:
                yield got
    for result in walk(tree["start"], frozenset()):
        assert result | always
    reachable = set().union(*walk(tree["start"], frozenset()))
    assert set(outs) - always <= reachable
    for o in outs.values():
        assert o["review"]["reviewed_by"] is None and o["review"]["needs"] == "legal"


def test_entrypoints():
    items = load_entrypoints(ROOT)
    assert [i["id"] for i in items] == list(SHEETS)
    known = {s["id"] for s in json.loads((OPSITE / "situations.json").read_text(encoding="utf-8"))}
    sheets = {s["id"]: s for s in load_sheets(ROOT)}
    for it in items:
        assert set(it["situations"]) <= known, it["id"]
        assert it["path"] == sheets[it["id"]]["path"]
        assert it["title"] == sheets[it["id"]]["title"]
        assert it["situations"] == sheets[it["id"]]["situations"]


def test_raw_sources_listed():
    rows = (ROOT / "raw" / "SOURCES.tsv").read_text(encoding="utf-8").splitlines()[1:]
    for row in rows:
        cols = row.split("\t")
        assert re.fullmatch(r"\d{16}", cols[0]) and re.fullmatch(r"[0-9a-f]{64}", cols[2])
        for f in cols[5].split():
            assert (ROOT / f).is_file(), f


def test_meta():
    meta = read_yaml(ROOT / "data" / "meta.yaml")
    assert re.fullmatch(r"\d{4}\.\d{2}\.\d{2}(\.\d+)?", meta["version"])
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["data_date"])
