import { test, expect } from "../../opsite/tests/fixtures.js";
import { gotoStep, decodeSvg, stubPrint, currentPayload } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T10:00:00+03:00") });
});

async function renameAndPrint(page, name) {
  await page.evaluate((n) => {
    const input = document.querySelector('[data-hc-field="child_name"]');
    input.value = n;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector('[data-hc-step="print"] [data-hc-print-btn]').click();
  }, name);
  await page.waitForFunction(() => window.__snaps.length > 0);
  return page.evaluate(() => window.__snaps.at(-1));
}

test("печать ждёт код: новое имя сразу попадает в QR на A4 @xb", async ({ page }) => {
  await page.goto("emergency/?demo=1");
  await page.locator("hc-sheet[data-ready]").waitFor({ state: "attached" });
  await gotoStep(page, "print");
  await expect(page.locator('[data-hc-qr-box="a4"]')).toBeVisible();
  await stubPrint(page);
  const snap = await renameAndPrint(page, "Даниил Сергеевич");
  const expected = await currentPayload(page);
  expect(expected).toContain("Имя: Даниил Сергеевич");
  expect(snap.wallet).toBe(false);
  const a4 = snap.boxes.find((b) => b.size === "a4");
  expect(a4.hidden).toBe(false);
  expect(a4.text).toBe(expected);
  expect(await decodeSvg(page, a4.svg)).toBe(expected);
});

test("смена A4 на карточку и сразу печать: в карточке текущий код @xb", async ({ page }) => {
  await page.goto("emergency/?demo=1");
  await page.locator("hc-sheet[data-ready]").waitFor({ state: "attached" });
  await gotoStep(page, "print");
  await expect(page.locator('[data-hc-qr-box="a4"]')).toBeVisible();
  await page.getByRole("radio", { name: /Карточка в кошелёк/ }).check();
  await stubPrint(page);
  const snap = await renameAndPrint(page, "Варвара");
  const expected = await currentPayload(page);
  expect(snap.wallet).toBe(true);
  const card = snap.boxes.find((b) => b.size === "card");
  expect(card.hidden).toBe(false);
  expect(card.text).toBe(expected);
  expect(await decodeSvg(page, card.svg)).toBe(expected);
});
