import { test } from "node:test";
import assert from "node:assert/strict";
import { ageText } from "../../lib/dates.js";

test("возраст по дате рождения", () => {
  assert.equal(ageText("2018-04-12", "2026-10-11"), "8 лет, дата рождения 12.04.2018");
  assert.equal(ageText("2018-10-12", "2026-10-11"), "7 лет, дата рождения 12.10.2018");
  assert.equal(ageText("2025-10-11", "2026-10-11"), "1 год, дата рождения 11.10.2025");
  assert.equal(ageText("2024-10-11", "2026-10-11"), "2 года, дата рождения 11.10.2024");
  assert.equal(ageText("2026-05-20", "2026-10-11"), "4 месяца, дата рождения 20.05.2026");
  assert.equal(ageText("2026-10-01", "2026-10-11"), "меньше месяца, дата рождения 01.10.2026");
  assert.equal(ageText("2027-01-01", "2026-10-11"), "");
  assert.equal(ageText("", "2026-10-11"), "");
});
