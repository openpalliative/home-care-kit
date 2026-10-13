import { ru } from "./dates.js";

const LINK = /(https?:|www\.)/i;

export function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function clean(field, raw) {
  let value = String(raw ?? "").trim();
  if (!value) return "";
  if (field.type === "date") value = ru(value) || value;
  return value.replace(/\s*\r?\n\s*/g, "; ").replace(/\s{2,}/g, " ");
}

export function buildPayload(fields, values, { limit = 400 } = {}) {
  const ordered = fields
    .filter((f) => Number.isInteger(f.qr_order) && f.qr_key)
    .sort((a, b) => a.qr_order - b.qr_order);
  const lines = [];
  const included = [];
  const omitted = [];
  let full = false;
  for (const f of ordered) {
    const value = clean(f, values?.[f.id]);
    if (!value) continue;
    if (LINK.test(value)) {
      omitted.push({ id: f.id, reason: "link" });
      continue;
    }
    const line = `${f.qr_key}: ${value}`;
    if (full || byteLength([...lines, line].join("\n")) > limit) {
      full = true;
      omitted.push({ id: f.id, reason: "limit" });
      continue;
    }
    lines.push(line);
    included.push(f.id);
  }
  const text = lines.join("\n");
  return { text, bytes: byteLength(text), included, omitted };
}

export function parsePayload(text) {
  const out = {};
  for (const line of String(text || "").split("\n")) {
    const i = line.indexOf(": ");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 2);
  }
  return out;
}
