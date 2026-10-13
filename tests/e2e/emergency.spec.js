import { test, expect, pdfPages } from "../../opsite/tests/fixtures.js";
import { printText, idbNames, fillField, gotoStep, decodeSvg } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T10:00:00+03:00") });
});

async function decodeQr(page, selector) {
  const svg = await page.locator(selector).evaluate((el) => new XMLSerializer().serializeToString(el));
  return decodeSvg(page, svg);
}

test("первый вход спрашивает про устройство, «Нет» ничего не пишет в IndexedDB", async ({ page }) => {
  await page.goto("emergency/");
  await expect(page.getByRole("heading", { name: "Это ваше устройство?" })).toBeVisible();
  await page.getByRole("button", { name: "Нет, не сохранять" }).click();
  await fillField(page, "child_name", "Миша");
  await page.waitForTimeout(600);
  expect(await idbNames(page)).not.toContain("op-home-care-kit");
  await page.reload();
  await expect(page.locator('[data-hc-field="child_name"]')).toHaveValue("");
  await expect(page.getByText("Лист не сохраняется")).toBeVisible();
});

test("«Да» сохраняет лист на устройстве", async ({ page }) => {
  await page.goto("emergency/");
  await page.getByRole("button", { name: "Да, сохранять здесь" }).click();
  await fillField(page, "child_name", "Миша");
  await expect(page.locator("[data-hc-saved]")).toContainText("Сохранено");
  await page.reload();
  await expect(page.locator('[data-hc-field="child_name"]')).toHaveValue("Миша");
});

test("A4 и карточка печатаются на одной странице каждая, код декодируется в исходный текст", async ({ page }) => {
  await page.goto("emergency/?demo=1");
  await gotoStep(page, "print");
  const box = page.locator('[data-hc-qr-box="a4"]');
  await expect(box).toBeVisible();
  const expected = await box.getAttribute("data-text");
  expect(expected.length).toBeGreaterThan(10);
  expect(new TextEncoder().encode(expected).length).toBeLessThanOrEqual(400);
  expect(await decodeQr(page, '[data-hc-qr-box="a4"] svg')).toBe(expected);
  expect(await pdfPages(page)).toBe(1);
  expect(await printText(page, "[data-hc-preview]")).toContain("Это не юридический отказ от реанимации");
  await page.getByRole("radio", { name: /Карточка в кошелёк/ }).check();
  expect(await pdfPages(page)).toBe(1);
  expect(await printText(page, "[data-hc-preview]")).toContain("Отрежьте по линии");
  await page.getByLabel(/Добавить код на лист/).uncheck();
  await expect(box).toBeHidden();
});

test("через 91 день после проверки на листе водяной знак «Не проверено»", async ({ page }) => {
  await page.goto("emergency/?demo=1");
  await expect(page.locator("body")).not.toHaveClass(/hc-watermark/);
  await page.clock.setSystemTime(new Date("2026-12-31T10:00:00+03:00"));
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/hc-watermark/);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#sheet-a4 .hc-wmark")).toBeVisible();
});

test("водяной знак не расширяет страницу на телефоне", async ({ page }) => {
  await page.goto("emergency/");
  await page.getByRole("button", { name: "Нет, не сохранять" }).click();
  await fillField(page, "child_name", "Миша");
  await gotoStep(page, "check");
  await expect(page.locator("body")).toHaveClass(/hc-watermark/);
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(0);
});

test("нет кнопок пересылки в мессенджеры, есть копирование текста", async ({ page }) => {
  await page.goto("emergency/?demo=1");
  await expect(page.locator("main op-share, main [data-share], main a[href^='sms:']")).toHaveCount(0);
  await gotoStep(page, "print");
  await expect(page.getByRole("button", { name: "Скопировать текст для медкарты в телефоне" })).toBeVisible();
});

test("без JS печатается пустой A4 и карточка @nojs", async ({ page }, info) => {
  test.skip(info.project.name !== "nojs");
  await page.goto("emergency/");
  await expect(page.locator("#sheet-a4")).toBeVisible();
  await expect(page.locator("#sheet-card")).toBeVisible();
  expect(await pdfPages(page)).toBe(2);
});

test("пустой бланк печатается и до ответа про устройство", async ({ page }) => {
  await page.goto("emergency/");
  await page.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push(document.body.classList.contains("hc-blank")); });
  await page.locator("[data-hc-ask]").getByRole("button", { name: "Распечатать пустой бланк" }).click();
  expect(await page.evaluate(() => window.__printed)).toEqual([true]);
  expect(await idbNames(page)).not.toContain("op-home-care-kit");
});
