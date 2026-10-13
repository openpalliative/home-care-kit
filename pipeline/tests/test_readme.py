import re

import pytest

from pipeline.export import datasets

from .conftest import ROOT

PATTERNS = {
    "acts": r"ссылаются на (\d+) акт",
    "acts_printable": r"на лист из них попадают (\d+)",
    "quotes": r"Из (\d+) цитат",
    "quotes_printable": r"цитат\w* на лист попадают (\d+)",
    "indications": r"(\d+) пункт\w* показаний",
    "line_regions": r"есть у (\d+) регион",
    "lines": r"регион\w*, всего (\d+) номер",
    "lines_verified": r"Звонком проверено: (\d+)",
    "general_regions": r"общая горячая линия минздрава есть у (\d+) регион",
}


def act_code(act_id: str) -> str:
    if act_id.startswith("gk-"):
        return act_id[3:].replace("-", ".")
    if act_id.startswith("pp-"):
        return "№ " + act_id[3:]
    act_id = re.sub(r"-fz-\d{4}$", "-fz", act_id)
    return act_id.replace("-fz", "-ФЗ").replace("n-", "н/").replace("n", "н")


@pytest.fixture(scope="module")
def views(monkey_module):
    by = {e["dataset"]: e for e in datasets(ROOT)}
    return by["norm-view"]["items"], by["region-view"]["items"]


@pytest.fixture(scope="module")
def monkey_module():
    mp = pytest.MonkeyPatch()
    mp.delenv("HC_FIXTURES", raising=False)
    yield mp
    mp.undo()


def unverified_section() -> str:
    text = (ROOT / "README.md").read_text(encoding="utf-8")
    m = re.search(r"^## Что сейчас не проверено\n(.*?)^## ", text, re.S | re.M)
    assert m, "в README нет раздела «Что сейчас не проверено»"
    return m.group(1)


def test_readme_numbers_match_norm_view(views):
    nv, rv = views
    acts = [i for i in nv if i["kind"] == "act"]
    quotes = [i for i in nv if i["kind"] == "quote"]
    own = [r for r in rv if any(ln["role"] != "general" for ln in r.get("lines") or [])]
    lines = [ln for r in own for ln in r["lines"]]
    want = {
        "acts": len(acts),
        "acts_printable": sum(1 for a in acts if a["printable"]),
        "quotes": len(quotes),
        "quotes_printable": sum(1 for q in quotes if q["printable"]),
        "indications": sum(1 for i in nv if i["kind"] == "indication"),
        "line_regions": len(own),
        "lines": len(lines),
        "lines_verified": sum(1 for ln in lines if ln.get("verified") is True),
        "general_regions": sum(1 for r in rv if r.get("lines") and r not in own),
    }
    section = unverified_section()
    got = {}
    for key, pattern in PATTERNS.items():
        m = re.search(pattern, section)
        assert m, f"в README не найдено число для {key}"
        got[key] = int(m.group(1))
    assert got == want, "числа в README «Что сейчас не проверено» разошлись с norm-view и region-view"


def test_readme_names_printable_acts(views):
    nv, _ = views
    section = unverified_section()
    for a in nv:
        if a["kind"] == "act" and a["printable"]:
            assert act_code(a["id"]) in section, a["id"]
