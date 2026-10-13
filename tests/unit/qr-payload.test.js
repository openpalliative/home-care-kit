import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload, parsePayload, byteLength } from "../../lib/qr-payload.js";

const fields = [
  { id: "child_name", type: "text", qr_order: 1, qr_key: "Имя" },
  { id: "birth_date", type: "date", qr_order: 2, qr_key: "Родился" },
  { id: "allergies", type: "text", qr_order: 6, qr_key: "Аллергии" },
  { id: "diagnosis", type: "textarea", qr_order: 3, qr_key: "Заболевание" },
  { id: "pain_signs", type: "textarea" },
];

test("кириллица занимает 2 байта", () => {
  assert.equal(byteLength("Миша"), 8);
  const p = buildPayload(fields, { child_name: "Миша" });
  assert.equal(p.text, "Имя: Миша");
  assert.equal(p.bytes, byteLength("Имя: Миша"));
});

test("порядок по qr_order, даты ДД.ММ.ГГГГ, без полей вне кода", () => {
  const p = buildPayload(fields, { allergies: "нет", child_name: "Миша", birth_date: "2018-04-12", pain_signs: "морщится", diagnosis: "строка 1\nстрока 2" });
  assert.equal(p.text, "Имя: Миша\nРодился: 12.04.2018\nЗаболевание: строка 1; строка 2\nАллергии: нет");
  assert.deepEqual(p.included, ["child_name", "birth_date", "diagnosis", "allergies"]);
});

test("предел 400 байт соблюдается, лишние поля в omitted", () => {
  const long = "д".repeat(150);
  const p = buildPayload(fields, { child_name: long, diagnosis: long, allergies: "нет" });
  assert.ok(p.bytes <= 400);
  assert.deepEqual(p.included, ["child_name"]);
  assert.deepEqual(p.omitted.map((o) => o.id), ["diagnosis", "allergies"]);
  assert.ok(p.omitted.every((o) => o.reason === "limit"));
});

test("значения со ссылками не попадают в код", () => {
  const p = buildPayload(fields, { child_name: "Миша", allergies: "см. www.example.org" });
  assert.deepEqual(p.omitted, [{ id: "allergies", reason: "link" }]);
  assert.ok(!p.text.includes("www"));
});

test("обратный разбор даёт исходные значения", () => {
  const values = { child_name: "Миша Иванов", allergies: "Нет известных", diagnosis: "Пример: СМА" };
  const parsed = parsePayload(buildPayload(fields, values).text);
  assert.deepEqual(parsed, { "Имя": values.child_name, "Заболевание": values.diagnosis, "Аллергии": values.allergies });
});
