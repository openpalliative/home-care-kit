import datetime as dt
import json
import os
import re

DATASETS = ("sheets", "entrypoints", "norm-view", "region-view", "holiday-runs")
SHEET_ORDER = ("night", "emergency", "discharge", "conclusion", "ahead")
PERSONAL = ("night", "emergency")
GROUPS = (
    ("dementia", "Деменция"),
    ("stroke", "Последствия инсульта"),
    ("als", "БАС и другие болезни нервной системы"),
    ("chf", "Болезни сердца и сосудов"),
    ("other", "Другое или не знаю"),
)
PAPER = {"a4": "лист A4", "wallet": "карточка в кошелёк"}
REVIEW = {"legal": "юристом", "medical": "медиком", "both": "юристом и медиком"}
ITEM_KINDS = ("indications", "outcomes", "checklist", "not-automatic")
PLACEHOLDER = re.compile(r"\{([a-z0-9_]+)\}")
AGE_FIELDS = ("birth_date",)
STUB_PAGES = 1
NOT_CHECKED = "Пункт ещё не сверен с официальной публикацией"
PLAIN_REASON = "Точный текст нормы ещё не сверен с официальной публикацией"
TECH_PREFIXES = ("Записи нет", "Цитаты нет", "Снимка", "Текста пункта")


def _plain(reason: str) -> str:
    return PLAIN_REASON if reason and reason.startswith(TECH_PREFIXES) else reason


def _fill_from_fixtures(ctx) -> list[str]:
    used = []
    for name in DATASETS:
        if name not in ctx.data:
            path = ctx.root / "tests" / "fixtures" / f"{name}.json"
            ctx.data[name] = json.loads(path.read_text(encoding="utf-8"))
            used.append(name)
    return used


def _norm_state(nv: dict, norm_ids: list, quote_refs: list) -> tuple[bool, str, list]:
    ok, reason, acts = True, "", []
    for nid in norm_ids or []:
        act = nv.get(nid)
        if act is None:
            ok, reason = False, reason or NOT_CHECKED
            acts.append({"id": nid, "title": nid, "url": None, "printable": False})
            continue
        acts.append(act)
        if not act.get("printable"):
            ok, reason = False, reason or act.get("reason") or NOT_CHECKED
    for ref in quote_refs or []:
        q = nv.get(ref["quote_id"])
        if q is None or not q.get("printable"):
            ok, reason = False, reason or (q or {}).get("reason") or "Дословный текст ещё не сверен"
    return ok, reason, acts


def _item(nv: dict, item: dict) -> dict:
    ok, reason, acts = _norm_state(nv, item.get("norm_ids"), item.get("quote_refs"))
    verified = item.get("verified") is True
    item = {"detail": "", "who": "", "when": "", "branch": "all", "links": [], **item}
    full = reason if not ok else ("" if verified else NOT_CHECKED)
    return {**item, "acts": acts, "printable": verified and ok, "reason": _plain(full), "reason_full": full}


def _short_point(title: str, point: str) -> str:
    return re.sub(r"\s+Положения\b", "", point) if title.startswith("Положение") else point


def _quote(nv: dict, quote_id: str) -> dict:
    q = nv.get(quote_id) or {"id": quote_id, "printable": False, "reason": "Дословный текст ещё не сверен"}
    act = nv.get(q.get("norm_id") or "", {})
    title = act.get("title") or q.get("norm_id") or quote_id
    source = {"title": title, "point": _short_point(title, q.get("point") or ""),
              "eoNumber": act.get("eoNumber") or q.get("eoNumber") or "", "url": act.get("url") or q.get("url") or "",
              "verified_at": q.get("verified_at") or "", "verified": q.get("verified") is True}
    full = q.get("reason") or "Дословный текст ещё не сверен"
    return {"point": "", "text_verbatim": "", **q, "source": source, "printable": q.get("printable") is True,
            "reason": _plain(full), "reason_full": full}


def _indications(nv: dict, group: str) -> list:
    rows = [n for n in nv.values() if n.get("kind") == "indication" and n.get("group") == group]
    rows.sort(key=lambda n: (n.get("order") or 0, n["id"]))
    out = []
    for n in rows:
        act = nv.get(n.get("norm_id") or "", {})
        source = {"title": act.get("title") or n.get("norm_id") or "", "point": n.get("point") or "",
                  "eoNumber": n.get("eoNumber") or act.get("eoNumber") or "", "url": n.get("url") or act.get("url") or "",
                  "verified_at": n.get("verified_at") or "", "verified": n.get("verified") is True}
        full = n.get("reason") or "Текст ещё сверяется"
        out.append({**n, "source": source, "printable": n.get("printable") is True,
                    "reason": _plain(full), "reason_full": full})
    return out


def _by_point(rows: list) -> list:
    out = []
    for n in rows:
        key = (n.get("norm_id"), n["source"]["point"], n["printable"])
        if out and out[-1]["key"] == key and n["printable"]:
            out[-1]["rows"].append(n)
        else:
            out.append({"key": key, "printable": n["printable"], "source": n["source"], "rows": [n]})
    return out


def _block(nv: dict, sheet: dict, block: dict, fields: dict) -> dict:
    b = {"title": "", "text": "", "lines": [], "links": [], "now_ids": [], "groups": [], "region_roles": [],
         "field_ids": [], "items": [], **block}
    b["field_list"] = [fields[f] for f in block.get("field_ids", []) if f in fields]
    b["item_list"] = [_item(nv, i) for i in block.get("items", [])]
    b["item_runs"] = _runs(b["item_list"])
    b["items_ok"] = any(i["printable"] for i in b["item_list"])
    b["quotes"] = [_quote(nv, r["quote_id"]) for r in block.get("quote_refs", [])]
    ok, reason, acts = _norm_state(nv, block.get("norm_ids"), block.get("quote_refs"))
    b["acts"] = acts
    b["norms_ok"] = ok
    b["reason"] = _plain(reason)
    printed = block.get("print") is True
    if block["kind"] in ITEM_KINDS or block["kind"] == "script":
        b["printable"] = printed
    elif block["kind"] == "quote":
        b["printable"] = printed and block.get("verified") is True and all(q["printable"] for q in b["quotes"])
    else:
        b["printable"] = printed and block.get("verified") is True
    b["groups_view"] = {g: _by_point(_indications(nv, g)) for g in block.get("groups", [])}
    heads = {n.get("point"): n for n in nv.values() if n.get("kind") == "indication-group"}
    b["group_intro"] = {g: heads.get(rows[0]["rows"][0].get("point")) for g, rows in b["groups_view"].items() if rows}
    b["all_groups"] = sorted(heads.values(), key=lambda n: n.get("order") or 0)
    b["line_parts"] = [_parts(line, fields) for line in block.get("lines", [])]
    return b


def _parts(line: str, fields: dict) -> list:
    out = []
    for i, chunk in enumerate(PLACEHOLDER.split(line)):
        if i % 2 == 0:
            if chunk:
                out.append({"text": chunk, "field": None, "fmt": ""})
        elif chunk in fields:
            out.append({"text": "", "field": chunk, "fmt": "age" if chunk in AGE_FIELDS else ""})
    return out


def _runs(items: list) -> list:
    runs = []
    for i in items:
        if runs and runs[-1]["printable"] == i["printable"]:
            runs[-1]["list"].append(i)
        else:
            runs.append({"printable": i["printable"], "list": [i], "after": bool(runs)})
    return runs


def _outcomes(nv: dict, tree: dict) -> list:
    out = []
    for o in tree.get("outcomes", []):
        ok, reason, acts = _norm_state(nv, o.get("norm_ids"), o.get("quote_refs"))
        verified = o.get("verified") is True
        full = reason if not ok else ("" if verified else NOT_CHECKED)
        quotes = [_quote(nv, r["quote_id"]) for r in o.get("quote_refs", [])]
        refs = bool(o.get("norm_ids") or o.get("quote_refs"))
        out.append({"take": [], "always": False, "links": [], **o, "acts": acts, "printable": verified and ok,
                    "quotes": quotes, "what_printable": ok or not refs,
                    "reason": _plain(full), "reason_full": full})
    return out


def _sheet(nv: dict, sheet: dict) -> dict:
    fields = {}
    for f in sheet.get("fields", []):
        fields[f["id"]] = {"hint": "", "print_label": "", "required": False, "autocomplete": "",
                           "blank_lines": 1, "fixed_caption": "", "suggest": "", "suggest_id": "",
                           "confirm": False, "qr_order": None, "qr_key": "", "demo": "", **f}
    s = dict(sheet)
    s["field_map"] = fields
    s["sections_view"] = []
    used = set()
    for sec in sheet["sections"]:
        blocks = [_block(nv, sheet, b, fields) for b in sec["blocks"]]
        for b in blocks:
            used.update(b.get("field_ids", []))
        s["sections_view"].append({"side": None, "anchor": "", "branch": "all", **sec, "blocks": blocks})
    check_block = [b for sec in s["sections_view"] for b in sec["blocks"] if b["id"] == "checked"]
    check_ids = [f for b in check_block for f in b.get("field_ids", [])]
    s["fill_blocks"] = [b for sec in s["sections_view"] for b in sec["blocks"]
                        if b["field_list"] and b["id"] != "checked" and b["kind"] in ("fields", "numbers")]
    s["check_fields"] = [fields[f] for f in check_ids] + [f for k, f in fields.items() if k not in used]
    s["qr_fields"] = sorted((f for f in fields.values() if f.get("qr_order")), key=lambda f: f["qr_order"])
    s["outcomes_view"] = _outcomes(nv, sheet["tree"]) if sheet.get("tree") else []
    s["skipped_quotes"] = sum(1 for o in s["outcomes_view"] for q in o["quotes"] if not q["printable"])
    s["paper_text"] = ", ".join(f"{PAPER[p]}" for p in sheet["paper"])
    review = sheet["review"]
    if review.get("reviewed_by"):
        s["review_text"] = f"Проверено {REVIEW.get(review['needs'], '')} {review.get('reviewed_at') or ''}".strip()
    elif review["needs"] == "none":
        s["review_text"] = "Проверка не нужна"
    else:
        s["review_text"] = f"Ждёт проверки {REVIEW[review['needs']]} в РФ"
    return s


def _unverified(sheets: dict, nv: dict) -> list:
    out = []
    for s in sheets.values():
        for sec in s["sections_view"]:
            for b in sec["blocks"]:
                if b["kind"] == "quote":
                    for q in b["quotes"]:
                        if not q["printable"]:
                            out.append({"sheet": s["title"], "text": b.get("title") or q["id"], "reason": q["reason_full"]})
                for i in b["item_list"]:
                    if not i["printable"]:
                        out.append({"sheet": s["title"], "text": i["text"], "reason": i["reason_full"]})
        for o in s["outcomes_view"]:
            if not o["printable"]:
                out.append({"sheet": s["title"], "text": o["title"], "reason": o["reason_full"]})
    return out


def context(ctx) -> dict:
    used = _fill_from_fixtures(ctx)
    nv = {n["id"]: n for n in ctx.data["norm-view"]["items"]}
    sheets = {s["id"]: _sheet(nv, s) for s in ctx.data["sheets"]["items"]}
    order = [sheets[i] for i in SHEET_ORDER if i in sheets]
    entries = {e["id"]: e for e in ctx.data["entrypoints"]["items"]}
    runs = ctx.data["holiday-runs"]["items"]
    regions = sorted(ctx.data["region-view"]["items"], key=lambda r: r["name"])
    today = dt.date.fromisoformat(ctx.built_at[:10])
    horizon = (today + dt.timedelta(days=120)).isoformat()
    upcoming = [r for r in runs if r["kind"] == "run" and r.get("to", "") >= today.isoformat()
                and r.get("from", "") <= horizon]
    years = sorted(r["year"] for r in runs if r["kind"] == "year" and r.get("verified"))
    acts = sorted((n for n in nv.values() if n.get("kind") == "act"), key=lambda n: n["id"])
    neighbours = [ctx.data[n] for n in ("norm-view", "region-view", "holiday-runs")]
    fixtures = bool(used) or os.environ.get("HC_FIXTURES") == "1"
    gates = ctx.content.get("gates") or {}
    stub = os.environ.get("OP_TARGET") == "pages" and gates.get("indications_public") not in (True, "true")
    return {"hc": {
        "sheets": sheets, "order": order, "entries": entries, "regions": regions, "runs": runs,
        "upcoming": upcoming, "verified_years": years, "acts": acts, "neighbours": neighbours,
        "region_lines": {"all": sum(1 for r in regions for ln in r.get("lines") or [] if ln.get("role") != "general"),
                         "checked": sum(1 for r in regions for ln in r.get("lines") or []
                                        if ln.get("role") != "general" and ln.get("verified") is True),
                         "general": sum(1 for r in regions if (r.get("lines") or [])
                                        and all(ln.get("role") == "general" for ln in r["lines"]))},
        "unverified": _unverified(sheets, nv), "groups": GROUPS, "fixtures": fixtures,
        "limits": {sid: {f["id"]: int(f["max_len"]) for f in s.get("fields", [])} for sid, s in sheets.items()},
        "indications_stub": stub, "stub_pages": STUB_PAGES,
        "now": {line["id"]: line for line in ctx.now["lines"]},
        "data_date": ctx.data["sheets"]["data_date"], "built": today.isoformat(),
    }}


def pages(ctx):
    sheets = ctx.site.get("hc", {}).get("sheets", {})
    for sid in SHEET_ORDER:
        draft = (sheets.get(sid) or {}).get("draft") or "none"
        yield f"{sid}/", f"sheets/{sid}.html.j2", {"draft": draft, "sheet_id": sid, "noindex": sid in PERSONAL}
    yield "", "hc/index.html.j2", {"draft": "none"}
    yield "data/", "hc/data.html.j2", {"draft": "none"}
    yield "saved/", "hc/saved.html.j2", {"draft": "none", "noindex": True}
