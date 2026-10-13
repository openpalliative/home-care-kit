import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "../../opsite/tests/fixtures.js";
import { fillField, gotoStep, regionWith, showField } from "./helpers.js";

const DIR = process.env.HC_SHOTS_DIR || join(process.cwd(), "..", "_reports", "shots", "home-care-kit");
const WIDTHS = [360, 390, 768, 1024, 1440];
const THEMES = ["light", "dark"];
const pages = [
  ["home", ""], ["night-demo", "night/?demo=1"], ["night-blank", "night/"], ["emergency-demo", "emergency/?demo=1"],
  ["emergency-blank", "emergency/"], ["discharge", "discharge/"], ["conclusion", "conclusion/"], ["ahead", "ahead/"],
  ["data", "data/"], ["saved", "saved/"],
];

test.describe.configure({ mode: "parallel" });
test.setTimeout(240000);

async function device(page, answer) {
  await page.addInitScript((a) => {
    try { if (a) localStorage.setItem("hc:device-save", a); else localStorage.removeItem("hc:device-save"); } catch {}
  }, answer);
}

async function snap(page, name, open) {
  mkdirSync(DIR, { recursive: true });
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: theme, media: "screen" });
      await open(page);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${name}-${width}-${theme}.png`), fullPage: true });
    }
  }
}

async function snapXl(page, name, open) {
  await page.addInitScript(() => { try { localStorage.setItem("op:prefs", JSON.stringify({ size: "xl" })); } catch {} });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.emulateMedia({ colorScheme: "light", media: "screen" });
  await open(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(DIR, `${name}-360-xl.png`), fullPage: true });
}

async function ready(page) {
  const sheet = page.locator("hc-sheet");
  if (await sheet.count()) await page.locator("hc-sheet[data-ready], hc-sheet[data-asking]").first().waitFor({ state: "attached" });
}

const states = [
  ...pages.map(([name, path]) => [name, async (page) => { await page.goto(path); await ready(page); }, "no"]),
  ["night-ask", async (page) => { await page.goto("night/"); await expect(page.locator("[data-hc-ask]")).toBeVisible(); }, null],
  ["emergency-ask", async (page) => { await page.goto("emergency/"); await expect(page.locator("[data-hc-ask]")).toBeVisible(); }, null],
  ["night-step2", async (page) => { await page.goto("night/?demo=1"); await ready(page); await gotoStep(page, "check"); }, "no"],
  ["night-step3", async (page) => { await page.goto("night/?demo=1"); await ready(page); await gotoStep(page, "print"); }, "no"],
  ["emergency-step2", async (page) => { await page.goto("emergency/?demo=1"); await ready(page); await gotoStep(page, "check"); }, "no"],
  ["emergency-step3", async (page) => { await page.goto("emergency/?demo=1"); await ready(page); await gotoStep(page, "print"); }, "no"],
  ["emergency-watermark", async (page) => {
    await page.clock.setSystemTime(new Date("2026-12-31T10:00:00+03:00"));
    await page.goto("emergency/?demo=1"); await ready(page); await gotoStep(page, "check");
    await expect(page.locator("body")).toHaveClass(/hc-watermark/);
  }, "no"],
  ["night-region", async (page) => {
    await page.goto("night/?demo=1"); await ready(page);
    const region = await regionWith(page, () => true);
    await showField(page, "region_line");
    if (region) await page.locator("#hc-region").selectOption(region);
    await page.locator('[data-hc-suggest="region"]').scrollIntoViewIfNeeded();
  }, "no"],
];

for (const [name, open, answer] of states) {
  test(`P6 ${name} @p6`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-11T10:00:00+03:00") });
    await device(page, answer);
    await snap(page, name, open);
    await snapXl(page, name, open);
  });
}

test("P6 срок годности истёк @p6", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T10:00:00+03:00") });
  await device(page, "yes");
  await page.goto("night/");
  await fillField(page, "cabinet_phone", "+7 000 000-00-12");
  await gotoStep(page, "check");
  for (const box of await page.locator("[data-hc-verify] input").all()) await box.check();
  await page.getByRole("button", { name: "Номера проверены" }).click();
  await expect(page.locator("[data-hc-validity]")).toContainText("Данные верны до");
  await page.waitForTimeout(600);
  await page.clock.setSystemTime(new Date("2027-06-01T10:00:00+03:00"));
  await snap(page, "night-expired", async (p) => { await p.goto("night/"); await ready(p); await gotoStep(p, "print"); });
});

const pdfs = [
  ["night-demo", "night/?demo=1", 2, null],
  ["night-blank", "night/", 2, "blank"],
  ["emergency-a4", "emergency/?demo=1", 1, null],
  ["emergency-card", "emergency/?demo=1", 1, "wallet"],
  ["emergency-blank", "emergency/", 1, "blank"],
  ["discharge", "discharge/", 2, null],
  ["conclusion", "conclusion/", 2, null],
  ["ahead", "ahead/", 2, null],
];

for (const [name, path, count, mode] of pdfs) {
  test(`P6 PDF ${name} @p6`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-11T10:00:00+03:00") });
    await device(page, "no");
    await page.goto(path);
    await ready(page);
    if (mode === "blank") await page.evaluate(() => document.body.classList.add("hc-blank"));
    if (path.startsWith("emergency/?")) {
      await gotoStep(page, "print");
      if (mode === "wallet") await page.getByRole("radio", { name: /Карточка в кошелёк/ }).check();
      await expect(page.locator(`[data-hc-qr-box="${mode === "wallet" ? "card" : "a4"}"] svg`)).toBeAttached();
    }
    mkdirSync(DIR, { recursive: true });
    await page.emulateMedia({ colorScheme: "light", media: "print" });
    const buf = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: false });
    writeFileSync(join(DIR, `print-${name}.pdf`), buf);
    await page.emulateMedia({ media: null });
    const n = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (name === "conclusion") expect(n).toBeLessThanOrEqual(count + 1);
    else expect(n).toBe(count);
  });
}
