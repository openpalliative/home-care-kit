import json

from opsite.build import check_envelope
from opsite.data import content_sha256
from pipeline.export import datasets

from .conftest import ROOT, act, calendar, env, line, put_vendor, quote


def check_all(root, envs):
    for e in envs:
        check_envelope(e, ROOT / "data" / "schema" / f"{e['dataset']}.schema.json", e["dataset"])
        assert e["content_sha256"] == content_sha256(e["source"], e["items"])


def test_datasets_without_vendor(tmp_root):
    envs = datasets(tmp_root)
    assert [e["dataset"] for e in envs] == ["sheets", "entrypoints", "norm-view", "region-view", "holiday-runs"]
    check_all(tmp_root, envs)
    by = {e["dataset"]: e for e in envs}
    assert by["region-view"]["items"] == [] and by["holiday-runs"]["items"] == []
    assert not any(i["printable"] for i in by["norm-view"]["items"])
    assert by["sheets"]["license"] == "CC-BY-SA-4.0"


def test_datasets_with_vendor(tmp_root, monkeypatch):
    monkeypatch.setenv("HC_TODAY", "2026-10-11")
    put_vendor(tmp_root, "pal-norms", "acts", env("acts", "pal-norms", [act("208n-243n")]))
    put_vendor(tmp_root, "pal-norms", "quotes", env("quotes", "pal-norms", [quote("208n-243n-p13", "208n-243n", "Текст")]))
    put_vendor(tmp_root, "pal-norms", "calendar", env("calendar", "pal-norms", calendar([(2026, True, ["2026-11-04"], [])])["items"]))
    put_vendor(tmp_root, "pal-directory", "regions", env("regions", "pal-directory", [
        {"id": "RU-KGD", "name": "Калининградская область", "verified": True, "verified_at": "2026-10-11"}]))
    put_vendor(tmp_root, "pal-directory", "region-lines", env("region-lines", "pal-directory", [
        line("kgd-1", "RU-KGD", ["pain"], verified=True, verified_at="2026-09-01")], license="rzn-source-terms"))
    envs = datasets(tmp_root)
    check_all(tmp_root, envs)
    by = {e["dataset"]: e for e in envs}
    nv = {i["id"]: i for i in by["norm-view"]["items"]}
    assert nv["208n-243n-p13"]["printable"] is True
    assert nv["208n-243n-p20"]["printable"] is False
    assert by["norm-view"]["data_date"] == "2026-10-01"
    rv = by["region-view"]
    assert rv["items"][0]["lines"][0]["printable"] is True and rv["license"] == "rzn-source-terms"
    assert any(r["kind"] == "run" for r in by["holiday-runs"]["items"])


def test_fixture_mode(tmp_root, monkeypatch):
    monkeypatch.setenv("HC_FIXTURES", "1")
    envs = datasets(tmp_root)
    fx = json.loads((ROOT / "tests" / "fixtures" / "region-view.json").read_text(encoding="utf-8"))
    assert {e["dataset"]: e for e in envs}["region-view"] == fx
    check_all(tmp_root, envs[:2])


def test_fixtures_have_no_excluded_territories():
    from pipeline.export import territories
    for name in ("region-view", "sheets", "norm-view"):
        text = (ROOT / "tests" / "fixtures" / f"{name}.json").read_text(encoding="utf-8")
        assert not territories().search(text), name


def test_neighbor_fixtures_compatible(tmp_root, monkeypatch):
    import pytest
    src = ROOT.parent / "pal-norms" / "tests" / "fixtures"
    if not src.is_dir():
        pytest.skip("рядом нет pal-norms")
    monkeypatch.setenv("HC_TODAY", "2026-10-11")
    for name in ("acts", "quotes", "calendar", "indications"):
        f = src / f"{name}.json"
        if f.is_file():
            put_vendor(tmp_root, "pal-norms", name, json.loads(f.read_text(encoding="utf-8")))
    envs = datasets(tmp_root)
    check_all(tmp_root, envs)
    hr = {e["dataset"]: e for e in envs}["holiday-runs"]
    assert any(i["kind"] == "year" for i in hr["items"])
