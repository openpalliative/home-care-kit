import argparse
import datetime as dt
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from opsite.data import read_yaml

from . import views
from .export import SHEETS, vendor_env

LABEL = "audit"


def issue_hash(kind: str, key: str) -> str:
    return hashlib.sha256(f"{kind}{key}".encode("utf-8")).hexdigest()[:12]


def _issue(kind: str, key: str, title: str, body: str) -> dict:
    h = issue_hash(kind, key)
    return {"kind": kind, "key": key, "hash": h, "title": f"{title} [{h}]", "body": body}


def stale_snapshots(root: Path, today: dt.date) -> list[dict]:
    out = []
    deps = read_yaml(root / "deps.yaml") or {}
    for repo, spec in deps.items():
        for name in (spec or {}).get("datasets", []):
            env = vendor_env(root, repo, name)
            if env is None:
                out.append(_issue("no-snapshot", f"{repo}/{name}", f"Нет снимка {repo}/{name}",
                                  f"В vendor/{repo}/v1/ нет {name}.json. Листы показывают зависящие пункты "
                                  f"как непроверенные. Запустите sync-data или проверьте, публикует ли {repo} этот датасет"))
                continue
            age = (today - dt.date.fromisoformat(env["data_date"])).days
            limit = int(env.get("stale_after_days", 90))
            if age > limit:
                out.append(_issue("stale-snapshot", f"{repo}/{name}", f"Снимок {repo}/{name} устарел",
                                  f"Данные от {env['data_date']}, это {age} дн. при пределе {limit}. "
                                  f"Проверьте, обновляет ли {repo} свои данные"))
    return out


def calendar_issues(root: Path, today: dt.date) -> list[dict]:
    out = []
    year = today.year
    if today >= dt.date(year, 11, 1):
        runs = views.holiday_runs(vendor_env(root, "pal-norms", "calendar"))
        verified = {r["year"] for r in runs if r["kind"] == "year" and r["verified"]}
        if year + 1 not in verified:
            out.append(_issue("calendar-next-year", str(year + 1),
                              f"Календарь на {year + 1} не утверждён: листы истекут 31.12.{year}",
                              f"В снимке pal-norms нет проверенного календаря на {year + 1}. "
                              f"Карта на ночь считает срок годности не дальше 31.12 последнего проверенного года. "
                              f"Проверьте, внёс ли pal-norms постановление о переносе выходных на {year + 1}"))
    if today.month == 12 and today.day <= 7:
        out.append(_issue("december-review", str(year + 1),
                          f"Сверить листы на {year + 1} и выпустить релиз",
                          "Проверьте тексты листов, нормы и номера, обновите data/meta.yaml и выпустите тег"))
    return out


def review_issues(root: Path, today: dt.date) -> list[dict]:
    out = []
    for sid in SHEETS:
        sheet = read_yaml(root / "data" / "sheets" / f"{sid}.yaml")
        review = sheet.get("review") or {}
        at = review.get("reviewed_at")
        if review.get("reviewed_by") and at and (today - dt.date.fromisoformat(at)).days > 365:
            out.append(_issue("review-expired", sid, f"Ревью листа {sid} старше года",
                              f"Последняя проверка {at} ({review['reviewed_by']}). Нужна новая проверка в РФ"))
    return out


def audit(root: Path, today: dt.date) -> list[dict]:
    return stale_snapshots(root, today) + calendar_issues(root, today) + review_issues(root, today)


def open_issues(issues: list[dict], dry_run: bool) -> int:
    def gh(*args, check=True):
        if dry_run:
            print("gh " + " ".join(args))
            return ""
        return subprocess.run(["gh", *args], check=check, capture_output=True, text=True).stdout
    gh("label", "create", LABEL, "--color", "C9A15A", "--description", "Найдено проверкой данных", "--force",
       check=False)
    created = 0
    for it in issues:
        found = gh("issue", "list", "--state", "open", "--search", f"{it['hash']} in:title", "--json", "number")
        if found.strip() not in ("", "[]"):
            continue
        gh("issue", "create", "--title", it["title"], "--body", it["body"], "--label", LABEL)
        created += 1
    return created


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="pipeline.audit")
    p.add_argument("--root", default=".")
    p.add_argument("--today")
    p.add_argument("--open-issues", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args(argv)
    root = Path(a.root).resolve()
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    issues = audit(root, today)
    reports = root / "_reports"
    reports.mkdir(exist_ok=True)
    (reports / "audit.json").write_text(json.dumps({"checked_at": today.isoformat(), "issues": issues},
                                                   ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for it in issues:
        print(f"{it['kind']}: {it['title']}")
    if not issues:
        print("Проверка данных: замечаний нет")
    if a.open_issues:
        n = open_issues(issues, a.dry_run)
        print(f"Новых issue: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
