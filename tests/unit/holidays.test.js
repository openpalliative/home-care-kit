import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingRuns, inRun, verifiedYears } from "../../lib/holidays.js";

const runs = [
  { id: "year-2026", kind: "year", year: 2026, verified: true },
  { id: "year-2027", kind: "year", year: 2027, verified: false },
  { id: "run-2026-11-01", kind: "run", year: 2026, from: "2026-11-01", to: "2026-11-04", days: 4, verified: true },
  { id: "run-2026-12-31", kind: "run", year: 2026, from: "2026-12-31", to: "2027-01-11", days: 12, verified: false },
];

test("период через Новый год виден в декабре и в январе", () => {
  assert.deepEqual(upcomingRuns(runs, "2026-12-20").map((r) => r.from), ["2026-12-31"]);
  assert.deepEqual(upcomingRuns(runs, "2027-01-05").map((r) => r.from), ["2026-12-31"]);
  assert.deepEqual(upcomingRuns(runs, "2027-01-12"), []);
});

test("горизонт 120 дней", () => {
  assert.deepEqual(upcomingRuns(runs, "2026-10-11").map((r) => r.from), ["2026-11-01", "2026-12-31"]);
  assert.deepEqual(upcomingRuns(runs, "2026-06-01"), []);
});

test("inRun на границах", () => {
  assert.equal(inRun("2026-10-31", runs), false);
  assert.equal(inRun("2026-11-01", runs), true);
  assert.equal(inRun("2026-11-04", runs), true);
  assert.equal(inRun("2026-11-05", runs), false);
  assert.equal(inRun("2027-01-11", runs), true);
  assert.equal(inRun("", runs), false);
});

test("проверенные годы", () => {
  assert.deepEqual(verifiedYears(runs), [2026]);
});
