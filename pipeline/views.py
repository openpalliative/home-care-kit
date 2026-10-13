import datetime as dt
import re

GROUP_RULES = [
    ("dementia", re.compile(r"деменц", re.I)),
    ("stroke", re.compile(r"мозгового\s+кровообращени|инсульт", re.I)),
    ("als", re.compile(r"амиотрофическ|двигательных\s+нейронов", re.I)),
    ("chf", re.compile(r"органов\s+кровообращени|сердечн", re.I)),
]
GROUP_BY_POINT = {"4": "dementia", "5": "stroke", "6": "chf", "10": "als"}
STATUS_REASON = {
    "not_yet_in_force": "Акт ещё не вступил в силу",
    "repealed": "Акт утратил силу",
    "draft": "Это проект, а не действующий акт",
    "unknown": "Не установлено, действует ли акт",
}
LINE_ROLES = ("pain", "pmp")
FALLBACK_LABEL = "Общая горячая линия минздрава региона"
CITY_PHONE = re.compile(r"^8 \(\d{3,5}\) \d{1,3}-\d{2}-\d{2}$")


def _date(value):
    if not value:
        return None
    try:
        return dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _items(env):
    return env.get("items", []) if env else []


def _act_check(act):
    if act is None:
        return False, None
    status = act.get("status", "unknown")
    if status != "in_force":
        return False, STATUS_REASON.get(status, STATUS_REASON["unknown"])
    if act.get("verified") is not True:
        return False, "Реквизиты и статус акта ещё не сверены"
    return True, None


def _quote_ok(q):
    text = (q.get("text") or "").strip()
    if not text:
        return False, "Текста пункта пока нет"
    if q.get("verified") is not True:
        return False, "Цитата ещё не сверена с официальной публикацией"
    if q.get("text_source") == "official_pdf" and not (q.get("ocr") and q.get("scan_checked")):
        return False, "Текст распознан со скана, но человек его со сканом не сверил"
    if q.get("text_source") not in ("official_pdf", None):
        return False, "Текст взят не из официальной публикации"
    return True, None


def _ocr_verified(q):
    return bool(q.get("ocr") and q.get("scan_checked"))


def _scan_text(q):
    return q.get("text") or None


def map_group(ind):
    if ind.get("section") in ("general", "rule"):
        return "general"
    if ind.get("section") != "group":
        return None
    title = ind.get("group_title") or ind.get("text") or ""
    for group, pat in GROUP_RULES:
        if pat.search(title):
            return group
    m = re.search(r"прил\.\s*1,\s*п\.\s*(\d+)", ind.get("point", ""))
    if m and not ind.get("group_title"):
        return GROUP_BY_POINT.get(m.group(1))
    return None


def _point_key(act_id, point):
    return (act_id, re.sub(r"[\s.,]", "", (point or "").lower()))


def norm_view(acts_env, quotes_env, indications_env, wanted):
    acts = {a["id"]: a for a in _items(acts_env)}
    quotes = {q["id"]: q for q in _items(quotes_env)}
    by_point = {_point_key(q.get("act_id"), q.get("point")): q for q in _items(quotes_env)}
    have_snapshot = acts_env is not None
    out = []
    act_state = {}
    for w in wanted["acts"]:
        a = acts.get(w["id"])
        if a is None:
            reason = "Записи нет в снимке справочника норм" if have_snapshot else "Снимка справочника норм пока нет"
            if w.get("note"):
                reason += ". " + w["note"][0].upper() + w["note"][1:]
            act_state[w["id"]] = (False, reason, None)
            out.append({
                "id": w["id"], "kind": "act", "norm_id": w["id"], "title": w["title"],
                "status": w.get("expect_status") or "unknown", "in_force_from": None,
                "eoNumber": w.get("eoNumber") or None, "url": w.get("url") or None,
                "printable": False, "reason": reason,
                "verified": False, "verified_at": None, "source_ref": "hc-norm-ids",
            })
            continue
        ok, reason = _act_check(a)
        act_state[w["id"]] = (ok, reason, a)
        item = {
            "id": a["id"], "kind": "act", "norm_id": a["id"],
            "title": a.get("short_title") or a.get("title") or w["title"],
            "status": a.get("status", "unknown"), "in_force_from": a.get("in_force_from"),
            "eoNumber": a.get("eoNumber"), "url": a.get("url"),
            "printable": ok, "verified": a.get("verified") is True, "verified_at": a.get("verified_at"),
            "source_ref": "pal-norms",
        }
        if reason:
            item["reason"] = reason
        out.append(item)
    for w in wanted["quotes"]:
        q = quotes.get(w["id"]) or by_point.get(_point_key(w["norm_id"], w["point"]))
        a_ok, a_reason, a = act_state.get(w["norm_id"], (False, "Акта нет в списке листов", None))
        url = (a or {}).get("url") or next((x.get("url") for x in wanted["acts"] if x["id"] == w["norm_id"]), None)
        if q is None:
            reason = "Цитаты нет в снимке справочника норм" if have_snapshot else "Снимка справочника норм пока нет"
            if not w.get("found_in_scan"):
                reason += ", пункт ещё не найден в официальной публикации"
            out.append({
                "id": w["id"], "kind": "quote", "norm_id": w["norm_id"], "point": w["point"],
                "text_verbatim": None, "pdf_page": int(w["pdf_page"]) or None, "ocr_verified": False,
                "url": url, "printable": False, "reason": reason,
                "verified": False, "verified_at": None, "source_ref": "hc-norm-ids",
            })
            continue
        ok, reason = _quote_ok(q)
        if ok and not a_ok:
            ok, reason = False, a_reason or "Акт не прошёл проверку"
        item = {
            "id": w["id"], "kind": "quote", "norm_id": q.get("act_id", w["norm_id"]),
            "point": q.get("point") or w["point"], "text_verbatim": _scan_text(q),
            "pdf_page": q.get("page"), "ocr_verified": _ocr_verified(q), "url": url,
            "printable": ok, "verified": q.get("verified") is True, "verified_at": q.get("verified_at"),
            "source_ref": "pal-norms",
        }
        if reason:
            item["reason"] = reason
        out.append(item)
    for ind in _items(indications_env):
        if ind.get("audience", "adults") != "adults":
            continue
        group = map_group(ind)
        if group is None:
            continue
        a_ok, a_reason, a = act_state.get(ind.get("act_id"), (False, None, acts.get(ind.get("act_id"))))
        if a is not None and ind.get("act_id") not in act_state:
            a_ok, a_reason = _act_check(a)
        ok, reason = _quote_ok(ind)
        if ok and not a_ok:
            ok, reason = False, a_reason or "Акт не прошёл проверку"
        item = {
            "id": ind["id"], "kind": "indication", "norm_id": ind.get("act_id"), "group": group,
            "order": int(ind.get("order") or 0), "point": ind.get("point"),
            "text_verbatim": _scan_text(ind), "pdf_page": ind.get("page"),
            "ocr_verified": _ocr_verified(ind), "url": (a or {}).get("url"),
            "eoNumber": (a or {}).get("eoNumber"),
            "printable": ok, "verified": ind.get("verified") is True, "verified_at": ind.get("verified_at"),
            "source_ref": "pal-norms",
        }
        if ind.get("group_title"):
            item["title"] = ind["group_title"]
        if reason:
            item["reason"] = reason
        out.append(item)
    out.extend(indication_groups(indications_env, acts, act_state))
    return out


def indication_groups(indications_env, acts, act_state):
    out = {}
    for ind in _items(indications_env):
        if ind.get("audience", "adults") != "adults" or ind.get("section") != "group" or not ind.get("group_title"):
            continue
        m = re.search(r"п\.\s*(\d+)", ind.get("point") or "")
        if not m or m.group(1) in out:
            continue
        a_ok, a_reason, a = act_state.get(ind.get("act_id"), (False, None, acts.get(ind.get("act_id"))))
        if a is not None and ind.get("act_id") not in act_state:
            a_ok, a_reason = _act_check(a)
        ok, reason = _quote_ok({**ind, "text": ind["group_title"]})
        if ok and not a_ok:
            ok, reason = False, a_reason or "Акт не прошёл проверку"
        item = {
            "id": f"ind-group-a1-p{m.group(1)}", "kind": "indication-group", "norm_id": ind.get("act_id"),
            "order": int(m.group(1)), "point": ind.get("point"), "title": _scan_text({**ind, "text": ind["group_title"]}),
            "url": (a or {}).get("url"), "eoNumber": (a or {}).get("eoNumber"),
            "printable": ok, "verified": ind.get("verified") is True, "verified_at": ind.get("verified_at"),
            "source_ref": "pal-norms",
        }
        if reason:
            item["reason"] = reason
        out[m.group(1)] = item
    return sorted(out.values(), key=lambda i: i["order"])


def tel_display(tel):
    digits = re.sub(r"\D", "", str(tel or ""))
    if len(digits) == 3:
        return digits
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if len(digits) != 10:
        return None
    if digits.startswith("800"):
        return f"8-800-{digits[3:6]}-{digits[6:8]}-{digits[8:]}"
    return f"+7 {digits[:3]} {digits[3:6]}-{digits[6:8]}-{digits[8:]}"


def _role(line):
    roles = set(line.get("roles") or []) | set(line.get("topics") or [])
    if line.get("role"):
        roles.add(line["role"])
    for r in LINE_ROLES:
        if r in roles:
            return r
    return None


def _fallback(line):
    roles = set(line.get("roles") or []) | set(line.get("topics") or [])
    return line.get("agency") == "minzdrav" and "minzdrav" in roles and "general" in roles


def _label(line):
    topic = (line.get("topic_text") or "").strip()
    agency = (line.get("agency_name") or "").strip()
    base = (line.get("label") or "").strip()
    if not base:
        base = f"{agency}, {topic}" if agency and topic else topic or agency
    return base[:1].upper() + base[1:] if base else "Номер региона"


def _ext(line):
    m = re.search(r"\d(?:[\d-]*\d)?", str(line.get("ext_text") or ""))
    return m.group(0) if m else None


def region_view(regions_env, lines_env, territories, today, line_days):
    by_region = {}
    excluded = 0
    source_titles = {s["id"]: s.get("title", "") for s in (lines_env or {}).get("source", [])}
    for line in _items(lines_env):
        text = " ".join(str(line.get(k) or "") for k in ("region_id", "agency_name", "topic_text", "source_text", "label"))
        if territories.search(text):
            excluded += 1
            continue
        if line.get("hidden") is True:
            continue
        role = _role(line)
        if role is None and _fallback(line):
            role = "general"
        if role is None:
            continue
        phone = tel_display(line.get("tel") or line.get("phone"))
        if phone is None:
            continue
        shown = (line.get("number_display") or "").strip()
        if CITY_PHONE.match(shown) and re.sub(r"\D", "", shown)[1:] == re.sub(r"\D", "", phone)[-10:]:
            phone = shown
        demo = line.get("origin") == "synthetic" or line.get("demo") is True
        verified = line.get("verified") is True
        vdate = _date(line.get("verified_at"))
        fresh = vdate is not None and (today - vdate).days <= line_days
        hours = (line.get("hours_text") or line.get("hours") or "").strip() or None
        is_24 = line.get("is_24x7")
        if hours is None and is_24 is True:
            hours = "круглосуточно"
        by_region.setdefault(line.get("region_id"), []).append({
            "id": line["id"], "role": role, "phone": phone, "ext": _ext(line),
            "label": f"{FALLBACK_LABEL}, {_label(line)}" if role == "general" else _label(line),
            "hours": hours, "is_24x7": is_24 if isinstance(is_24, bool) else None,
            "other_org": bool(line.get("foreign_number") or line.get("other_org")),
            "printable": verified and fresh and not demo,
            "demo": demo, "verified": verified, "verified_at": line.get("verified_at") or None,
            "source_ref": line.get("source_ref") or "pal-directory",
            "source_title": source_titles.get(line.get("source_ref"), "") or "Снимок справочника номеров",
            "source_date": line.get("assured_date") or line.get("source_date") or None,
        })
    out = []
    for reg in _items(regions_env):
        if reg.get("excluded") or territories.search(f"{reg.get('id', '')} {reg.get('name', '')}"):
            excluded += 1
            continue
        lines = by_region.get(reg["id"], [])
        if any(x["role"] in LINE_ROLES for x in lines):
            lines = [x for x in lines if x["role"] != "general"]
        lines = sorted(lines, key=lambda x: (x["role"] != "pain", not x["printable"], x["id"]))
        out.append({
            "id": reg["id"], "name": reg.get("name") or reg["id"],
            "verified": reg.get("verified") is True, "verified_at": reg.get("verified_at") or None,
            "lines": lines,
        })
    out.sort(key=lambda r: r["name"])
    return out, excluded


def _weekends(year):
    d = dt.date(year, 1, 1)
    out = set()
    while d.year == year:
        if d.weekday() >= 5:
            out.add(d)
        d += dt.timedelta(days=1)
    return out


def _baseline_days(baseline, year):
    days = _weekends(year)
    exclude = set(baseline.get("carry_exclude_mmdd") or [])
    for mmdd in baseline.get("holidays_mmdd") or []:
        m, d = map(int, mmdd.split("-"))
        hol = dt.date(year, m, d)
        if hol in days and baseline.get("carry_over") and mmdd not in exclude:
            nxt = hol + dt.timedelta(days=1)
            while nxt in days or nxt.weekday() >= 5:
                nxt += dt.timedelta(days=1)
            if nxt.year == year:
                days.add(nxt)
        days.add(hol)
    return days


def nonworking_days(calendar_env):
    items = _items(calendar_env)
    baseline = next((i for i in items if i.get("kind") == "baseline"), None)
    years = {int(i["year"]): i for i in items if i.get("kind") == "year" and i.get("year")}
    if not years:
        return {}, {}
    days = {}
    status = {}
    for y in range(min(years), max(years) + 2):
        item = years.get(y)
        if item is not None:
            s = _weekends(y) - {_date(x) for x in item.get("work") or []}
            s |= {_date(x) for x in item.get("off") or []}
            days[y] = s
            status[y] = (item.get("verified") is True, item.get("verified_at") or None, item.get("source_ref") or "pal-norms")
        elif baseline is not None:
            days[y] = _baseline_days(baseline, y)
            status[y] = (False, None, baseline.get("source_ref") or "pal-norms")
    return days, status


def holiday_runs(calendar_env, min_days=3):
    days, status = nonworking_days(calendar_env)
    out = []
    for y in sorted(status):
        verified, at, ref = status[y]
        if y in {int(i["year"]) for i in _items(calendar_env) if i.get("kind") == "year" and i.get("year")}:
            out.append({"id": f"year-{y}", "kind": "year", "year": y, "verified": verified,
                        "verified_at": at if verified else None, "source_ref": ref})
    all_days = sorted(d for s in days.values() for d in s if d is not None)
    run = []
    for d in all_days + [None]:
        if run and (d is None or d != run[-1] + dt.timedelta(days=1)):
            if len(run) >= min_days:
                covered = sorted({x.year for x in run})
                ok = all(status[y][0] for y in covered)
                dates = [status[y][1] for y in covered if status[y][1]]
                out.append({
                    "id": f"run-{run[0].isoformat()}", "kind": "run", "year": run[0].year,
                    "from": run[0].isoformat(), "to": run[-1].isoformat(), "days": len(run),
                    "verified": ok, "verified_at": max(dates) if ok and dates else None,
                    "source_ref": status[covered[0]][2],
                })
            run = []
        if d is not None:
            run.append(d)
    return out
