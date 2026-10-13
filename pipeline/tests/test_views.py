import datetime as dt
import json

from pipeline import export, views
from pipeline.export import load_wanted, territories
from pipeline.schema_refs import inline_refs

from .conftest import ROOT, act, calendar, env, indication, line, quote

TODAY = dt.date(2026, 10, 11)


def by_id(items):
    return {i["id"]: i for i in items}


def test_inline_refs():
    s = {"type": "object", "properties": {"a": {"$ref": "#/$defs/x"}}, "$defs": {"x": {"type": "array", "items": {"$ref": "#/$defs/y"}}, "y": {"type": "string"}}}
    assert inline_refs(s) == {"type": "object", "properties": {"a": {"type": "array", "items": {"type": "string"}}}}


def test_norm_view_without_snapshot():
    items = by_id(views.norm_view(None, None, None, load_wanted(ROOT)))
    assert all(i["printable"] is False and i["reason"] for i in items.values())
    assert items["388n"]["eoNumber"] is None
    assert "Снимка" in items["1094n-p3"]["reason"]
    assert items["1094n-p3"]["pdf_page"] == 7
    assert items["1094n"]["url"].endswith("0001202111300115")


def test_norm_view_printable_rules():
    wanted = {"acts": [{"id": "208n-243n", "title": "П"}, {"id": "424n", "title": "С"}, {"id": "1094n", "title": "Р"}],
              "quotes": [{"id": "208n-243n-p13", "norm_id": "208n-243n", "point": "п. 13", "pdf_page": "6", "found_in_scan": True},
                         {"id": "208n-243n-p17", "norm_id": "208n-243n", "point": "п. 17", "pdf_page": "6", "found_in_scan": True},
                         {"id": "208n-243n-p20", "norm_id": "208n-243n", "point": "п. 20", "pdf_page": "7", "found_in_scan": True},
                         {"id": "424n-p1", "norm_id": "424n", "point": "п. 1", "pdf_page": "1", "found_in_scan": True},
                         {"id": "1094n-p3", "norm_id": "1094n", "point": "п. 3", "pdf_page": "7", "found_in_scan": True}]}
    acts = env("acts", "pal-norms", [act("208n-243n"), act("424n", status="not_yet_in_force"), act("1094n", verified=False)])
    quotes = env("quotes", "pal-norms", [
        quote("208n-243n-p13", "208n-243n", "Медицинское заключение взрослому выдается"),
        quote("208n-243n-p17", "208n-243n", "Копия выдается на руки", scan=False),
        quote("208n-243n-p20", "208n-243n", "Выписка", verified=False),
        quote("424n-p1", "424n", "Изменения"),
        quote("1094n-p3", "1094n", "При выписке пациента"),
    ])
    items = by_id(views.norm_view(acts, quotes, None, wanted))
    assert items["208n-243n"]["printable"] is True
    assert items["424n"]["printable"] is False and "не вступил" in items["424n"]["reason"]
    assert items["208n-243n-p13"]["printable"] is True and items["208n-243n-p13"]["ocr_verified"] is True
    assert items["208n-243n-p17"]["printable"] is False and "со сканом" in items["208n-243n-p17"]["reason"]
    assert items["208n-243n-p20"]["printable"] is False
    assert items["424n-p1"]["printable"] is False
    assert items["1094n-p3"]["printable"] is False and "не сверены" in items["1094n-p3"]["reason"]


def test_indication_groups():
    wanted = {"acts": [{"id": "208n-243n", "title": "П"}], "quotes": []}
    inds = env("indications", "pal-norms", [
        indication("a-gen-1", "general", "ухудшение общего состояния"),
        indication("a-rule", "rule", "При выявлении у пациента 2 и более", point="прил. 1, п. 2"),
        indication("a-dem-1", "group", "прогрессирующее нарушение глотания", "Медицинские показания взрослым при различных формах деменции", "прил. 1, п. 4"),
        indication("a-str-1", "group", "персистирующая кома", "при тяжелых необратимых последствиях нарушений мозгового кровообращения", "прил. 1, п. 5"),
        indication("a-chf-1", "group", "конечные стадии хронической сердечной недостаточности", "при болезнях органов кровообращения", "прил. 1, п. 6"),
        indication("a-als-1", "group", "нуждаемость в респираторной поддержке", "при боковом амиотрофическом склерозе", "прил. 1, п. 10"),
        indication("a-onc-1", "group", "метастатические поражения", "при различных формах злокачественных новообразований", "прил. 1, п. 3"),
        indication("a-scope", "scope", "Паллиативная помощь оказывается", point="п. 4"),
        {**indication("c-gen", "general", "дети"), "audience": "children"},
    ])
    items = by_id(views.norm_view(env("acts", "pal-norms", [act("208n-243n")]), None, inds, wanted))
    groups = {i["id"]: i["group"] for i in items.values() if i["kind"] == "indication"}
    assert groups == {"a-gen-1": "general", "a-rule": "general", "a-dem-1": "dementia", "a-str-1": "stroke",
                      "a-chf-1": "chf", "a-als-1": "als"}
    assert all(items[i]["printable"] for i in groups)


def test_indication_group_heads_and_counts():
    by = {e["dataset"]: e for e in export.datasets(ROOT)}
    nv = by["norm-view"]["items"]
    heads = [i for i in nv if i["kind"] == "indication-group"]
    assert [h["order"] for h in heads] == sorted(h["order"] for h in heads)
    assert {h["point"] for h in heads} >= {f"прил. 1, п. {n}" for n in (4, 5, 6, 10)}
    assert all(h["title"].startswith("Медицинские показания") for h in heads if h["printable"])
    counts = {}
    for i in nv:
        if i["kind"] == "indication":
            counts[i["group"]] = counts.get(i["group"], 0) + 1
    raw = json.loads((ROOT / "vendor" / "pal-norms" / "v1" / "indications.json").read_text(encoding="utf-8"))["items"]
    for group, point in (("dementia", "4"), ("stroke", "5"), ("chf", "6"), ("als", "10")):
        want = sum(1 for r in raw if r.get("audience", "adults") == "adults" and r.get("section") == "group" and r.get("point") == f"прил. 1, п. {point}")
        assert counts.get(group) == want, group


def test_tel_display():
    assert views.tel_display("+74012535202") == "+7 401 253-52-02"
    assert views.tel_display("+78005509903") == "8-800-550-99-03"
    assert views.tel_display("88007008436") == "8-800-700-84-36"
    assert views.tel_display("122") == "122"
    assert views.tel_display("12345") is None


def test_region_view_rules():
    regions = env("regions", "pal-directory", [
        {"id": "RU-KGD", "name": "Калининградская область", "verified": True, "verified_at": "2026-10-11"},
        {"id": "RU-MOW", "name": "Москва", "verified": True, "verified_at": "2026-10-11"},
        {"id": "RU-SEV", "name": "Севастополь", "verified": True, "verified_at": "2026-10-11"},
        {"id": "RU-XXX", "name": "Республика Крым", "verified": True, "verified_at": "2026-10-11"},
    ])
    lines = env("region-lines", "pal-directory", [
        line("kgd-1", "RU-KGD", ["pain"], verified=True, verified_at="2026-09-01"),
        line("kgd-2", "RU-KGD", ["pmp"], verified=True, verified_at="2025-09-01", tel="+74012000002"),
        line("kgd-3", "RU-KGD", ["pain"], verified=False, tel="+74012000003"),
        line("kgd-4", "RU-KGD", ["general"], verified=True, verified_at="2026-09-01", tel="+74012000004"),
        line("mow-demo", "RU-MOW", ["pain"], verified=True, verified_at="2026-10-01", origin="synthetic", tel="+70000000001"),
        line("mow-hidden", "RU-MOW", ["pain"], hidden=True, tel="+74950000001"),
        line("sev-1", "RU-SEV", ["pain"], verified=True, verified_at="2026-09-01", tel="+78692000001"),
        line("crimea", "RU-KGD", ["pain"], agency_name="Министерство здравоохранения Республики Крым", tel="+73652000001"),
    ])
    items, excluded = views.region_view(regions, lines, territories(), TODAY, 365)
    regs = by_id(items)
    assert set(regs) == {"RU-KGD", "RU-MOW"}
    assert excluded == 4
    kgd = by_id(regs["RU-KGD"]["lines"])
    assert set(kgd) == {"kgd-1", "kgd-2", "kgd-3"}
    assert kgd["kgd-1"]["printable"] is True and kgd["kgd-1"]["phone"] == "+7 401 200-00-01"
    assert kgd["kgd-2"]["printable"] is False
    assert kgd["kgd-3"]["printable"] is False
    assert kgd["kgd-1"]["hours"] == "круглосуточно"
    assert regs["RU-KGD"]["lines"][0]["id"] == "kgd-1"
    mow = by_id(regs["RU-MOW"]["lines"])
    assert set(mow) == {"mow-demo"} and mow["mow-demo"]["demo"] is True and mow["mow-demo"]["printable"] is False
    assert not territories().search(str(items))


def test_region_view_minzdrav_fallback():
    regions = env("regions", "pal-directory", [
        {"id": "RU-KGD", "name": "Калининградская область", "verified": True, "verified_at": "2026-10-11"},
        {"id": "RU-TUL", "name": "Тульская область", "verified": True, "verified_at": "2026-10-11"},
        {"id": "RU-SEV", "name": "Севастополь", "verified": True, "verified_at": "2026-10-11"},
    ])
    lines = env("region-lines", "pal-directory", [
        line("kgd-pain", "RU-KGD", ["pain"]),
        line("kgd-gen", "RU-KGD", ["general"], tel="+74012000009"),
        line("tul-gen", "RU-TUL", ["general"], verified=True, verified_at="2026-09-01", tel="+74872000001"),
        line("tul-rzn", "RU-TUL", ["general"], agency="rzn", tel="+74872000002"),
        line("sev-gen", "RU-SEV", ["general"], tel="+78692000009"),
    ])
    regs = by_id(views.region_view(regions, lines, territories(), TODAY, 365)[0])
    assert [ln["id"] for ln in regs["RU-KGD"]["lines"]] == ["kgd-pain"]
    tul = regs["RU-TUL"]["lines"]
    assert [ln["id"] for ln in tul] == ["tul-gen"]
    assert tul[0]["role"] == "general" and tul[0]["label"].startswith("Общая горячая линия минздрава региона")
    assert "RU-SEV" not in regs


def test_holiday_runs_new_year_and_verification():
    off26 = ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
             "2026-02-23", "2026-03-09", "2026-05-01", "2026-05-11", "2026-06-12", "2026-11-04", "2026-12-31"]
    off27 = ["2027-01-01", "2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"]
    runs = views.holiday_runs(calendar([(2026, True, off26, []), (2027, False, off27, [])]))
    years = {r["year"]: r["verified"] for r in runs if r["kind"] == "year"}
    assert years == {2026: True, 2027: False}
    r = {x["from"]: x for x in runs if x["kind"] == "run"}
    ny = r["2026-12-31"]
    assert ny["to"] == "2027-01-10" and ny["days"] == 11 and ny["verified"] is False
    assert r["2026-01-01"]["to"] == "2026-01-11" and r["2026-01-01"]["verified"] is True
    assert r["2026-05-09"]["to"] == "2026-05-11" and r["2026-05-09"]["days"] == 3
    assert "2026-11-04" not in r
    assert all(x["days"] >= 3 for x in runs if x["kind"] == "run")


def test_holiday_runs_baseline_for_missing_year():
    runs = views.holiday_runs(calendar([(2026, True, ["2026-11-04"], [])]))
    assert {r["year"] for r in runs if r["kind"] == "year"} == {2026}
    jan = next(r for r in runs if r["kind"] == "run" and r["from"].startswith("2027-01"))
    assert jan["verified"] is False and jan["from"] == "2027-01-01"


def test_holiday_runs_empty():
    assert views.holiday_runs(None) == []


def test_quote_found_by_point_when_id_differs():
    wanted = {"acts": [{"id": "1094n", "title": "Р"}],
              "quotes": [{"id": "1094n-p3", "norm_id": "1094n", "point": "прил. 1, п. 3", "pdf_page": "7", "found_in_scan": True}]}
    quotes = env("quotes", "pal-norms", [quote("1094n-a1-p3", "1094n", "При выписке пациента", point="прил. 1,  п. 3")])
    items = by_id(views.norm_view(env("acts", "pal-norms", [act("1094n")]), quotes, None, wanted))
    assert items["1094n-p3"]["printable"] is True
    assert items["1094n-p3"]["text_verbatim"] == "При выписке пациента"


def test_region_line_number_as_written_and_agency_label():
    regions = env("regions", "pal-directory", [{"id": "RU-PER", "name": "Пермский край", "verified": True, "verified_at": "2026-10-11"}])
    lines = env("region-lines", "pal-directory", [
        line("per-1", "RU-PER", ["pain"], tel="+73422414444", number_display="8 (342) 241-44-44",
             agency_name="Министерство здравоохранения Пермского края", topic_text="по вопросам обезболивания"),
        line("per-2", "RU-PER", ["pain"], tel="+73422414445", number_display="8 (342) 241-44-44"),
    ])
    items, _ = views.region_view(regions, lines, territories(), TODAY, 365)
    got = by_id(items[0]["lines"])
    assert got["per-1"]["phone"] == "8 (342) 241-44-44"
    assert got["per-1"]["label"] == "Министерство здравоохранения Пермского края, по вопросам обезболивания"
    assert got["per-2"]["phone"] == "+7 342 241-44-45"


def test_region_line_extension_kept_separately():
    regions = env("regions", "pal-directory", [{"id": "RU-BEL", "name": "Белгородская область", "verified": True, "verified_at": "2026-10-11"}])
    lines = env("region-lines", "pal-directory", [
        line("bel-1", "RU-BEL", ["pain"], tel="+74722732003", number_display="8 (4722) 73-20-03",
             agency_name="Министерство здравоохранения Белгородской области", topic_text="по вопросам обезболивания",
             ext_text="добавочный-31-00-1"),
        line("bel-2", "RU-BEL", ["pain"], tel="+74722732004"),
    ])
    items, _ = views.region_view(regions, lines, territories(), TODAY, 365)
    got = by_id(items[0]["lines"])
    assert got["bel-1"]["ext"] == "31-00-1"
    assert "добавочный" not in got["bel-1"]["label"]
    assert got["bel-2"]["ext"] is None


def test_scan_text_verbatim_without_long_dash():
    assert views._scan_text({"text": "(далее – консилиум врачей)", "text_source": "official_pdf"}) == "(далее – консилиум врачей)"
    nv = {e["dataset"]: e for e in export.datasets(ROOT)}["norm-view"]["items"]
    assert not [i["id"] for i in nv if "\u2014" in (i.get("text_verbatim") or "") + (i.get("title") or "")]
