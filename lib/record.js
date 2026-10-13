import { parse } from "./dates.js";

export const RECORD = "hc-record/1";
export const EXPORT = "hc-export/1";
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_EXTRA = 20;
export const MAX_EXTRA_BYTES = 2048;
const MAX_VALUE = 400;
const MAX_VALUES = 80;
const SHEETS = new Set(["night", "emergency", "discharge", "conclusion", "ahead"]);
const OWN = new Set(["format", "sheet_id", "sheet_version", "values", "confirmed", "checked_at", "updated_at"]);
const KEY = /^[a-z0-9_]+$/;

export class RecordError extends Error {}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function goodDate(value, today) {
  return typeof value === "string" && Boolean(parse(value)) && value <= today;
}

function strings(obj, limits) {
  const out = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (Object.keys(out).length >= MAX_VALUES) break;
    if (!KEY.test(k) || !(typeof v === "string" || typeof v === "number")) continue;
    out[k] = String(v).slice(0, limits?.[k] ?? MAX_VALUE);
  }
  return out;
}

function extras(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (OWN.has(k) || k === "__proto__" || Object.keys(out).length >= MAX_EXTRA) continue;
    let size;
    try {
      size = new TextEncoder().encode(JSON.stringify(v) ?? "").length;
    } catch {
      continue;
    }
    if (size <= MAX_EXTRA_BYTES) out[k] = v;
  }
  return out;
}

export function normalizeRecord(raw, { today = localToday(), limits = {} } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RecordError("Запись листа пустая или повреждена");
  if (raw.format && raw.format !== RECORD) throw new RecordError("Неизвестный формат записи листа");
  if (!SHEETS.has(raw.sheet_id)) throw new RecordError("В записи нет известного листа");
  const values = strings(raw.values, limits[raw.sheet_id]);
  const confirmed = {};
  for (const [k, v] of Object.entries(strings(raw.confirmed))) if (goodDate(v, today)) confirmed[k] = v;
  return {
    ...extras(raw),
    format: RECORD,
    sheet_id: raw.sheet_id,
    sheet_version: typeof raw.sheet_version === "string" ? raw.sheet_version.slice(0, 40) : "",
    values,
    confirmed,
    checked_at: goodDate(raw.checked_at, today) ? raw.checked_at : null,
    updated_at: typeof raw.updated_at === "string" && !Number.isNaN(Date.parse(raw.updated_at)) ? raw.updated_at.slice(0, 40) : null,
  };
}

export function makeExport(records, now = new Date()) {
  return { format: EXPORT, exported_at: now.toISOString(), records: records.map((r) => normalizeRecord(r)) };
}

export function readExport(data, options = {}) {
  if (!data || typeof data !== "object" || data.format !== EXPORT || !Array.isArray(data.records)) {
    throw new RecordError("Это не файл листов для дома. Выберите файл, который сохранили на странице «Что сохранено»");
  }
  if (data.records.length > SHEETS.size * 4) throw new RecordError("В файле слишком много записей. Выберите файл, который сохранили на странице «Что сохранено»");
  return data.records.map((r) => normalizeRecord(r, options));
}

export function checkFileSize(bytes) {
  if (bytes > MAX_FILE_BYTES) {
    throw new RecordError("Файл слишком большой. Копия листов весит меньше 1 МБ. Выберите файл, который сохранили на странице «Что сохранено»");
  }
}

export function parseExport(text, options = {}) {
  checkFileSize(new TextEncoder().encode(String(text)).length);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RecordError("Это не файл листов для дома: внутри не тот формат. Выберите файл, который сохранили на странице «Что сохранено»");
  }
  return readExport(data, options);
}

export function exportFileName(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `listy-dlya-doma-${y}-${m}-${d}.json`;
}
