import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "../../opsite/tests/fixtures.js";

const pages = JSON.parse(readFileSync(join(process.cwd(), "tests/e2e/pages.json"), "utf8"));

test("число страниц в pages.json совпадает с print_pages листов", async ({ request }) => {
  const sheets = (await (await request.get("data/v1/sheets.json")).json()).items;
  for (const p of pages) {
    if (typeof p.print_pages !== "number") continue;
    const sheet = sheets.find((s) => p.path.startsWith(s.path));
    expect(sheet, p.name).toBeTruthy();
    expect(p.print_pages, p.name).toBe(sheet.print_pages.a4);
  }
});

test("корень: 5 карточек листов, ссылки на сохранённое и данные @nojs", async ({ page }) => {
  await page.goto("");
  await expect(page.locator(".hc-card")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "Что сохранено на этом устройстве" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Откуда данные/ })).toBeVisible();
});

test("ссылка «Вернуться» по параметру back", async ({ page }) => {
  await page.goto("discharge/#back=discharge");
  await expect(page.getByRole("link", { name: /^Вернуться:/ })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await page.goto("ahead/#back=nope");
  await expect(page.getByRole("link", { name: /^Вернуться:/ })).toHaveCount(0);
});
