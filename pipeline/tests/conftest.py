import json
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def env(dataset, repo, items, **extra):
    from opsite.data import make_envelope
    e = make_envelope(dataset=dataset, repo=repo, items=items, meta={"version": "2026.10.01", "data_date": "2026-10-01"},
                      source=[{"id": f"{repo}-test", "title": "Пример на выдуманных данных"}], **extra)
    return e


def quote(qid, act_id, text, verified=True, scan=True, page=7, point="п. 3"):
    return {
        "id": qid, "verified": verified, "verified_at": "2026-10-01" if verified else None, "source_ref": "x",
        "act_id": act_id, "point": point, "anchor": "p-3", "page": page, "text": text,
        "text_source": "official_pdf", "ocr": {"passes": 2, "diff_lines": 0} if scan else None,
        "scan_checked": {"at": "2026-10-01", "method": "visual-crop"} if scan else None,
    }


def act(aid, status="in_force", verified=True):
    return {"id": aid, "verified": verified, "verified_at": "2026-10-01" if verified else None, "source_ref": "x",
            "short_title": f"Акт {aid}", "title": f"Акт {aid}", "status": status, "in_force_from": None,
            "eoNumber": "0001202505290031", "url": "http://publication.pravo.gov.ru/document/0001202505290031"}


def indication(iid, section, text, group_title=None, point="прил. 1, п. 1", order=1, verified=True):
    q = quote(iid, "208n-243n", text, verified=verified, point=point)
    q.pop("anchor")
    return {**q, "audience": "adults", "section": section, "group_id": None, "group_title": group_title,
            "order": order, "anchor": "p-a1-1"}


def calendar(years):
    items = [{"id": "baseline", "verified": True, "verified_at": "2026-10-01", "source_ref": "tk-112", "kind": "baseline",
              "holidays_mmdd": ["01-01", "01-02", "01-03", "01-04", "01-05", "01-06", "01-07", "01-08", "02-23",
                                "03-08", "05-01", "05-09", "06-12", "11-04"],
              "carry_over": True, "carry_exclude_mmdd": ["01-01", "01-02", "01-03", "01-04", "01-05", "01-06", "01-07",
                                                         "01-08"], "quote_ids": []}]
    for y, verified, off, work in years:
        items.append({"id": str(y), "verified": verified, "verified_at": "2026-10-01" if verified else None,
                      "source_ref": f"pp-{y}", "kind": "year", "year": y, "decree_act_id": None,
                      "decree_eoNumber": None, "transfers": [], "off": off, "work": work, "quote_ids": []})
    return {"dataset": "calendar", "items": items, "source": []}


def line(lid, region, roles, verified=False, verified_at=None, origin="rzn", tel="+74012000001", **kw):
    base = {"id": lid, "region_id": region, "agency": "minzdrav", "agency_name": "Министерство здравоохранения",
            "number_raw": "", "number_display": "", "tel": tel, "ext_text": "", "kind": "landline",
            "topic_text": "по вопросам обезболивания", "hours_text": "", "is_24x7": True, "topics": roles,
            "topics_checked": False, "audience": "all", "roles": ["minzdrav", *roles], "shared_with": [],
            "foreign_number": False, "hidden": False, "origin": origin, "source_row": 1,
            "source_text": "8 (4012) 00-00-01 по вопросам обезболивания", "assured_date": "2026-03-03",
            "source_ref": "rzn-hotlines", "verified": verified, "verified_at": verified_at}
    base.update(kw)
    return base


@pytest.fixture
def tmp_root(tmp_path):
    for name in ("data", "opsite", "tests"):
        shutil.copytree(ROOT / name, tmp_path / name, ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(ROOT / "deps.yaml", tmp_path / "deps.yaml")
    return tmp_path


def put_vendor(root, repo, name, envelope):
    d = root / "vendor" / repo / "v1"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{name}.json").write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
