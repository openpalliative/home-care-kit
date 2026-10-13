import datetime as dt
import json
import os
import re
from pathlib import Path

from opsite.data import OPSITE, BuildError, coerce, make_envelope, read_yaml, validate

from . import views
from .schema_refs import inline_refs

REPO = "home-care-kit"
SHEETS = ("night", "emergency", "discharge", "conclusion", "ahead")
INTERNAL = ("norm-view", "region-view", "holiday-runs")
PAGES = "https://openpalliative.github.io/"
TEXTS_SOURCE = [{
    "id": "home-care-kit-texts",
    "title": "Тексты листов openpalliative, черновик до проверки юристом и медиком в РФ",
    "url": "https://github.com/openpalliative/home-care-kit/tree/main/data/sheets",
    "license": "CC-BY-SA-4.0",
}]


def schema(root: Path, name: str) -> dict:
    path = root / "data" / "schema" / f"{name}.schema.json"
    return inline_refs(json.loads(path.read_text(encoding="utf-8")))


def item_schema(root: Path, name: str) -> dict:
    return schema(root, name)["properties"]["items"]["items"]


def today() -> dt.date:
    value = os.environ.get("HC_TODAY")
    return dt.date.fromisoformat(value) if value else dt.date.today()


def read_meta(root: Path) -> dict:
    meta = read_yaml(root / "data" / "meta.yaml")
    for key in ("version", "data_date"):
        if not meta.get(key):
            raise BuildError(f"data/meta.yaml: нет поля {key}")
    return meta


def load_sheets(root: Path) -> list[dict]:
    sch = item_schema(root, "sheets")
    out = []
    for sid in SHEETS:
        path = root / "data" / "sheets" / f"{sid}.yaml"
        if not path.is_file():
            raise BuildError(f"нет файла листа data/sheets/{sid}.yaml")
        sheet = coerce(read_yaml(path), sch)
        validate({"items": [sheet]}, {"type": "object", "properties": {"items": {"type": "array", "items": sch}}},
                 f"data/sheets/{sid}.yaml")
        if sheet["id"] != sid:
            raise BuildError(f"data/sheets/{sid}.yaml: id листа {sheet['id']!r}, а файл назван {sid}")
        out.append(sheet)
    return out


def load_entrypoints(root: Path) -> list[dict]:
    sch = item_schema(root, "entrypoints")
    data = read_yaml(root / "data" / "entrypoints.yaml")
    return [coerce(it, sch) for it in data.get("items", [])]


def load_wanted(root: Path) -> dict:
    data = read_yaml(root / "data" / "norm-ids.yaml")
    for q in data.get("quotes", []):
        q["found_in_scan"] = q.get("found_in_scan") == "true"
    return data


def vendor_env(root: Path, repo: str, name: str) -> dict | None:
    path = root / "vendor" / repo / "v1" / f"{name}.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def territories() -> re.Pattern:
    data = read_yaml(OPSITE / "lint" / "territories.yaml")
    return re.compile("|".join(f"(?:{p})" for p in data["patterns"]))


def _ru(iso: str) -> str:
    return ".".join(reversed(str(iso)[:10].split("-")))


def _snapshot_source(repo: str, envs: list[dict]) -> dict:
    env = envs[0]
    return {
        "id": repo,
        "title": f"Снимок {repo}, версия {env['version']}, данные от {_ru(env['data_date'])}",
        "url": f"{PAGES}{repo}/data/v1/index.json",
        "retrieved_at": env.get("generated_at", "")[:10] or env["data_date"],
        "license": env.get("license", ""),
    }


def _internal_meta(meta: dict, envs: list[dict]) -> tuple[dict, int]:
    if not envs:
        return meta, 90
    return ({"version": meta["version"], "data_date": min(e["data_date"] for e in envs)},
            min(int(e.get("stale_after_days", 90)) for e in envs))


def build_norm_view(root: Path, meta: dict, wanted: dict) -> dict:
    envs = {n: vendor_env(root, "pal-norms", n) for n in ("acts", "quotes", "indications")}
    present = [e for e in envs.values() if e]
    items = views.norm_view(envs["acts"], envs["quotes"], envs["indications"], wanted)
    source = [{
        "id": "hc-norm-ids",
        "title": "Список норм, которые ждут листы: реквизиты сверены через API официального портала публикации",
        "url": "http://publication.pravo.gov.ru/",
        "retrieved_at": wanted.get("checked_at", meta["data_date"]),
    }]
    if present:
        source.insert(0, _snapshot_source("pal-norms", present))
    m, stale = _internal_meta(meta, present)
    return make_envelope(dataset="norm-view", repo=REPO, items=items, source=source, meta=m,
                         stale_after_days=stale, license="CC-BY-4.0")


def build_region_view(root: Path, meta: dict, line_days: int) -> dict:
    regions = vendor_env(root, "pal-directory", "regions")
    lines = vendor_env(root, "pal-directory", "region-lines")
    present = [e for e in (regions, lines) if e]
    items, excluded = views.region_view(regions, lines, territories(), today(), line_days)
    excluded += sum(int(e.get("counts", {}).get("excluded", 0)) for e in present)
    source = [_snapshot_source("pal-directory", present)] if present else []
    for env in present:
        for s in env.get("source", []):
            if s.get("id") not in {x["id"] for x in source}:
                source.append({k: v for k, v in s.items() if k in ("id", "title", "url", "retrieved_at", "sha256", "license")})
    m, stale = _internal_meta(meta, present)
    lic = (lines or regions or {}).get("license", "pal-directory")
    return make_envelope(dataset="region-view", repo=REPO, items=items, source=source, meta=m,
                         stale_after_days=stale, license=lic, excluded=excluded)


def build_holiday_runs(root: Path, meta: dict) -> dict:
    cal = vendor_env(root, "pal-norms", "calendar")
    items = views.holiday_runs(cal)
    present = [cal] if cal else []
    source = [_snapshot_source("pal-norms", present)] if present else []
    for s in (cal or {}).get("source", []):
        if s.get("eoNumber"):
            source.append({k: v for k, v in s.items() if k in ("id", "title", "url", "eoNumber", "retrieved_at")})
    m, stale = _internal_meta(meta, present)
    return make_envelope(dataset="holiday-runs", repo=REPO, items=items, source=source, meta=m,
                         stale_after_days=stale, license="CC-BY-4.0")


def fixture(root: Path, name: str) -> dict:
    return json.loads((root / "tests" / "fixtures" / f"{name}.json").read_text(encoding="utf-8"))


def datasets(root) -> list[dict]:
    root = Path(root)
    meta = read_meta(root)
    sheets = load_sheets(root)
    out = [
        make_envelope(dataset="sheets", repo=REPO, items=sheets, source=TEXTS_SOURCE, meta=meta,
                      license="CC-BY-SA-4.0"),
        make_envelope(dataset="entrypoints", repo=REPO, items=load_entrypoints(root), source=TEXTS_SOURCE,
                      meta=meta, license="CC-BY-SA-4.0"),
    ]
    if os.environ.get("HC_FIXTURES") == "1":
        return out + [fixture(root, n) for n in INTERNAL]
    night = next(s for s in sheets if s["id"] == "night")
    line_days = int(night["validity"].get("line_days", 365))
    out.append(build_norm_view(root, meta, load_wanted(root)))
    out.append(build_region_view(root, meta, line_days))
    out.append(build_holiday_runs(root, meta))
    return out
