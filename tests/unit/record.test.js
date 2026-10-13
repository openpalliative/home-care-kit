import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRecord, makeExport, readExport, parseExport, checkFileSize, exportFileName, RecordError } from "../../lib/record.js";

test("неизвестные поля записи сохраняются", () => {
  const r = normalizeRecord({ format: "hc-record/1", sheet_id: "night", values: { address: "ул. Садовая" }, extra: { a: 1 }, checked_at: "2026-10-01" });
  assert.deepEqual(r.extra, { a: 1 });
  assert.equal(r.values.address, "ул. Садовая");
  assert.equal(r.checked_at, "2026-10-01");
  assert.deepEqual(r.confirmed, {});
});

test("мусор в полях отбрасывается", () => {
  const r = normalizeRecord({ sheet_id: "emergency", values: { ok: "да", "<bad>": "x", obj: {} }, confirmed: { region_line: "вчера" }, checked_at: "вчера" });
  assert.deepEqual(r.values, { ok: "да" });
  assert.deepEqual(r.confirmed, {});
  assert.equal(r.checked_at, null);
});

test("мусорный импорт даёт понятную ошибку", () => {
  assert.throws(() => readExport({ hello: 1 }), (e) => e instanceof RecordError && /Это не файл листов/.test(e.message));
  assert.throws(() => readExport(null), RecordError);
  assert.throws(() => readExport({ format: "hc-export/1", records: [{ sheet_id: "nope" }] }), /известного листа/);
});

test("экспорт и обратно", () => {
  const data = makeExport([{ sheet_id: "night", values: { a: "1" } }], new Date("2026-10-11T10:00:00Z"));
  assert.equal(data.format, "hc-export/1");
  assert.equal(readExport(JSON.parse(JSON.stringify(data)))[0].values.a, "1");
  assert.equal(exportFileName(new Date(2026, 9, 11)), "listy-dlya-doma-2026-10-11.json");
});

test("too-big: файл больше 1 МБ отклоняется до разбора", () => {
  const text = JSON.stringify({ format: "hc-export/1", records: [], pad: "x".repeat(2 * 1024 * 1024) });
  assert.throws(() => parseExport(text), (e) => e instanceof RecordError && /слишком большой/.test(e.message));
  assert.throws(() => checkFileSize(2 * 1024 * 1024), RecordError);
  assert.doesNotThrow(() => checkFileSize(1024 * 1024));
});

test("не JSON даёт понятную ошибку", () => {
  assert.throws(() => parseExport("{oops"), (e) => e instanceof RecordError && /не тот формат/.test(e.message));
});

test("junk-extra: лишних полей не больше 20", () => {
  const raw = { sheet_id: "night", values: {} };
  for (let i = 0; i < 21; i += 1) raw[`junk_${i}`] = i;
  const r = normalizeRecord(raw);
  const extra = Object.keys(r).filter((k) => k.startsWith("junk_"));
  assert.equal(extra.length, 20);
});

test("extra-huge: лишнее поле больше 2 КБ отбрасывается", () => {
  const r = normalizeRecord({ sheet_id: "night", values: {}, huge: "я".repeat(2000), small: { a: 1 } });
  assert.equal(r.huge, undefined);
  assert.deepEqual(r.small, { a: 1 });
});

test("значения обрезаются до max_len поля", () => {
  const r = normalizeRecord({ sheet_id: "night", values: { address: "x".repeat(500), other: "y".repeat(500) } }, { limits: { night: { address: 140 } } });
  assert.equal(r.values.address.length, 140);
  assert.equal(r.values.other.length, 400);
});

test("future-date: даты позже сегодня и несуществующие отбрасываются", () => {
  const today = "2026-10-11";
  const r = normalizeRecord({ sheet_id: "night", values: { region_line: "1", hotline: "2", hospice_phone: "3" }, checked_at: "2026-10-12", confirmed: { region_line: "2027-01-01", hotline: "2026-02-31", hospice_phone: "2026-10-11" } }, { today });
  assert.equal(r.checked_at, null);
  assert.deepEqual(r.confirmed, { hospice_phone: "2026-10-11" });
  assert.equal(normalizeRecord({ sheet_id: "night", checked_at: "2026-02-31" }, { today }).checked_at, null);
  assert.equal(normalizeRecord({ sheet_id: "night", checked_at: "2026-10-11" }, { today }).checked_at, "2026-10-11");
});
