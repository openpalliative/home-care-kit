const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RU = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

export function parse(value) {
  const m = ISO.exec(String(value || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

export function iso(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value, days) {
  const d = parse(value);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

export function normalizeDate(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (parse(s)) return s;
  const m = RU.exec(s);
  if (!m) return null;
  const value = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return parse(value) ? value : null;
}

export function ru(value) {
  const d = parse(value);
  if (!d) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

export function ageText(birth, today) {
  const b = parse(birth);
  const t = parse(today);
  if (!b || !t || b > t) return "";
  let months = (t.getUTCFullYear() - b.getUTCFullYear()) * 12 + t.getUTCMonth() - b.getUTCMonth();
  if (t.getUTCDate() < b.getUTCDate()) months -= 1;
  const years = Math.floor(months / 12);
  const age = years >= 1
    ? `${years} ${plural(years, "год", "года", "лет")}`
    : months >= 1 ? `${months} ${plural(months, "месяц", "месяца", "месяцев")}` : "меньше месяца";
  return `${age}, дата рождения ${ru(birth)}`;
}
