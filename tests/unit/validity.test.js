import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validUntil, isExpired, needsWatermark } from "../../lib/validity.js";
import { normalizeDate, addDays } from "../../lib/dates.js";

const golden = JSON.parse(readFileSync(new URL("../golden/validity.json", import.meta.url), "utf8"));

for (const g of golden.valid_until) {
  test(`срок годности: ${g.name}`, () => {
    assert.equal(validUntil(g.in), g.out);
  });
}

test("водяной знак: 90 дней без него, 91 с ним, пустая дата с ним", () => {
  for (const g of golden.watermark) assert.equal(needsWatermark(g.checkedAt, g.today, 90), g.out, JSON.stringify(g));
  assert.equal(addDays("2026-07-01", 90), "2026-09-29");
});

test("срок истёк только на следующий день", () => {
  for (const g of golden.expired) assert.equal(isExpired(g.until, g.today), g.out);
});

test("дата текстом ДД.ММ.ГГГГ", () => {
  assert.equal(normalizeDate("1.2.2026"), "2026-02-01");
  assert.equal(normalizeDate("2026-02-01"), "2026-02-01");
  assert.equal(normalizeDate("31.02.2026"), null);
  assert.equal(normalizeDate(""), "");
});
