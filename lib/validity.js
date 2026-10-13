import { addDays, parse } from "./dates.js";

export function validUntil({ checkedAt, recheckDays = 183, verifiedYears = [], lineDates = [], lineDays = 365 } = {}) {
  if (!parse(checkedAt)) return null;
  const candidates = [addDays(checkedAt, recheckDays)];
  const years = verifiedYears.map(Number).filter(Number.isFinite);
  const lastYear = years.length ? Math.max(...years) : Number(checkedAt.slice(0, 4));
  candidates.push(`${lastYear}-12-31`);
  for (const d of lineDates) {
    if (parse(d)) candidates.push(addDays(d, lineDays));
  }
  return candidates.sort()[0];
}

export function isExpired(until, today) {
  return Boolean(parse(until) && parse(today)) && today > until;
}

export function needsWatermark(checkedAt, today, days = 90) {
  if (!parse(checkedAt)) return true;
  return today > addDays(checkedAt, days);
}
