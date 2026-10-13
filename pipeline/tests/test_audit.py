import datetime as dt
import json

from pipeline import audit

from .conftest import calendar, env, put_vendor


def kinds(root, day):
    return {(i["kind"], i["key"]) for i in audit.audit(root, dt.date.fromisoformat(day))}


def test_calendar_issue_after_november_first(tmp_root):
    put_vendor(tmp_root, "pal-norms", "calendar", env("calendar", "pal-norms", calendar([(2026, True, [], [])])["items"]))
    assert ("calendar-next-year", "2027") in kinds(tmp_root, "2026-11-02")
    assert ("calendar-next-year", "2027") not in kinds(tmp_root, "2026-10-31")


def test_no_calendar_issue_when_next_year_verified(tmp_root):
    cal = calendar([(2026, True, [], []), (2027, True, [], [])])["items"]
    put_vendor(tmp_root, "pal-norms", "calendar", env("calendar", "pal-norms", cal))
    assert ("calendar-next-year", "2027") not in kinds(tmp_root, "2026-11-02")


def test_december_and_snapshots(tmp_root):
    found = kinds(tmp_root, "2026-12-03")
    assert ("december-review", "2027") in found
    assert ("no-snapshot", "pal-norms/acts") in found
    assert ("december-review", "2027") not in kinds(tmp_root, "2026-12-08")
    put_vendor(tmp_root, "pal-directory", "regions", env("regions", "pal-directory", []))
    assert ("stale-snapshot", "pal-directory/regions") not in kinds(tmp_root, "2026-11-01")
    assert ("stale-snapshot", "pal-directory/regions") in kinds(tmp_root, "2027-02-01")


def test_review_expired(tmp_root):
    p = tmp_root / "data" / "sheets" / "ahead.yaml"
    p.write_text(p.read_text(encoding="utf-8").replace(
        "review: {needs: legal, reviewed_by: , reviewed_at: }\nsituations",
        "review: {needs: legal, reviewed_by: юрист, reviewed_at: 2025-01-10}\nsituations", 1), encoding="utf-8")
    assert ("review-expired", "ahead") in kinds(tmp_root, "2026-10-11")


def test_report_and_dedupe_hash(tmp_root, capsys):
    assert audit.main(["--root", str(tmp_root), "--today", "2026-12-02", "--open-issues", "--dry-run"]) == 0
    report = json.loads((tmp_root / "_reports" / "audit.json").read_text(encoding="utf-8"))
    hashes = [i["hash"] for i in report["issues"]]
    assert len(hashes) == len(set(hashes))
    assert all(f"[{i['hash']}]" in i["title"] for i in report["issues"])
    out = capsys.readouterr().out
    assert "gh issue create" in out and "in:title" in out
    assert audit.issue_hash("a", "b") == audit.issue_hash("a", "b") != audit.issue_hash("a", "c")
