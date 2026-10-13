import { addDays } from "./dates.js";

export function upcomingRuns(runs, today, horizonDays = 120) {
  const end = addDays(today, horizonDays);
  return runs
    .filter((r) => r.kind === "run" && r.from && r.to && r.to >= today && r.from <= end)
    .sort((a, b) => (a.from < b.from ? -1 : 1))
    .map((r) => ({ from: r.from, to: r.to, days: r.days, year: r.year, verified: r.verified === true }));
}

export function inRun(date, runs) {
  if (!date) return false;
  return runs.some((r) => r.kind !== "year" && r.from && r.to && date >= r.from && date <= r.to);
}

export function verifiedYears(runs) {
  return runs.filter((r) => r.kind === "year" && r.verified === true).map((r) => r.year);
}
