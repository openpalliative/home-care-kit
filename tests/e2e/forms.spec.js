import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "../../opsite/tests/fixtures.js";
import { printText, fillField, gotoStep, deviceAnswer, currentPayload } from "./helpers.js";

const XSS = ["<img src=x onerror=window.__x=1>", "'\"><svg onload=window.__x=1>"];
const STICKY = 73;

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-11T10:00:00+03:00") });
});

async function fillAll(page, value) {
  return page.evaluate((v) => {
    const ids = [];
    for (const input of document.querySelectorAll("[data-hc-field]")) {
      if (input.getAttribute("type") === "date") continue;
      input.value = v;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      ids.push(input.dataset.hcField);
    }
    return ids;
  }, value);
}

async function walkAndPrint(page) {
  for (const step of ["check", "print"]) await gotoStep(page, step);
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator('[data-hc-step="print"] [data-hc-print-btn]:visible').first().click().catch(() => {});
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(100);
  await page.emulateMedia({ media: null });
}

for (const sheet of ["night", "emergency"]) {
  for (const [n, value] of XSS.entries()) {
    test(`${sheet}: HTML в полях остаётся текстом, вариант ${n + 1} @xb`, async ({ page }, info) => {
      test.skip(info.project.name === "nojs");
      await deviceAnswer(page, "yes");
      await page.goto(`${sheet}/`);
      await page.locator("hc-sheet[data-ready]").waitFor({ state: "attached" });
      const ids = await fillAll(page, value);
      expect(ids.length).toBeGreaterThan(5);
      await walkAndPrint(page);
      if (sheet === "emergency") {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
        await page.getByRole("button", { name: "Скопировать текст для медкарты в телефоне" }).click();
        await expect(page.locator("[data-hc-copy-live]")).not.toBeEmpty();
      }
      const shown = await page.locator(`[data-hc-out="${ids[0]}"]`).first().textContent();
      expect(shown).toBe(value);
      expect(await page.locator("[data-hc-preview] img, [data-hc-preview] svg[onload]").count()).toBe(0);
      expect(await page.evaluate(() => window.__x)).toBeUndefined();
    });
  }
}

test("импорт файла с HTML в значениях: текст виден буквально, скрипты не исполняются @xb", async ({ page }, info) => {
  test.skip(info.project.name === "nojs");
  const path = info.outputPath("xss.json");
  const values = { folder_place: XSS[0], address: XSS[1], person_name: XSS[1] };
  writeFileSync(path, JSON.stringify({ format: "hc-export/1", exported_at: "2026-10-11T07:00:00.000Z", records: [{ format: "hc-record/1", sheet_id: "night", values, "<b>": XSS[0] }] }));
  await page.goto("saved/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Открыть файл" }).click();
  await (await chooser).setFiles(path);
  await expect(page.locator("[data-hc-file-live]")).toContainText("Открыто листов: 1");
  await deviceAnswer(page, "yes");
  await page.goto("night/");
  await expect(page.locator('[data-hc-field="folder_place"]')).toHaveValue(XSS[0]);
  await expect(page.locator('#folder [data-hc-out="folder_place"]')).toHaveText(XSS[0]);
  expect(await printText(page, "[data-hc-preview]")).toContain(XSS[1]);
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
});

test("на всех страницах CSP через meta без 'unsafe-eval' и со script-src 'self'", async ({ request }) => {
  const site = join(process.cwd(), "_site");
  const pages = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".html")) pages.push(p);
    }
  };
  walk(site);
  expect(pages.length).toBeGreaterThanOrEqual(8);
  for (const p of pages) {
    const html = readFileSync(p, "utf8");
    const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    expect(meta, p).toBeTruthy();
    const csp = meta[1].replaceAll("&#39;", "'");
    expect(csp, p).not.toContain("unsafe-eval");
    expect(csp, p).not.toContain("unsafe-inline");
    expect(csp, p).toMatch(/script-src 'self'(;|$)/);
  }
  expect((await request.get("night/")).ok()).toBe(true);
});

test("лист для скорой: слова для диспетчера собираются из полей, адреса нет в коде @xb", async ({ page }, info) => {
  test.skip(info.project.name === "nojs");
  await deviceAnswer(page, "no");
  await page.goto("emergency/");
  await fillField(page, "child_name", "Миша");
  await fillField(page, "birth_date", "2018-04-12");
  await fillField(page, "diagnosis", "Спинальная мышечная атрофия");
  await fillField(page, "breathing", "Аппарат ночью");
  await fillField(page, "address", "ул. Садовая, д. 1, кв. 2");
  const block = page.locator('#sheet-a4 [data-hc-block="dispatcher"]');
  await expect(block).toContainText("Звоните 103. Скажите диспетчеру");
  await expect(block).toContainText("его зовут Миша");
  await expect(block).toContainText("Возраст: 8 лет");
  await expect(block).toContainText("Заболевание по выписке: Спинальная мышечная атрофия");
  await expect(block).toContainText("Дыхание и аппарат: Аппарат ночью");
  await expect(block).toContainText("Адрес: ул. Садовая, д. 1, кв. 2");
  await expect(block).toContainText("не проверен медиком");
  expect(await currentPayload(page)).not.toContain("Садовая");
  const text = await printText(page, "#sheet-a4");
  expect(text.split("ул. Садовая").length - 1).toBe(1);
  expect(text).toContain("Возраст: 8 лет");
  await gotoStep(page, "print");
  await page.getByRole("radio", { name: /Карточка в кошелёк/ }).check();
  expect(await printText(page, "#sheet-card")).not.toContain("Садовая");
});

async function firstFieldTop(page) {
  const input = page.locator("[data-hc-field]:visible").first();
  await expect(input).toBeVisible();
  return input.evaluate((i) => {
    const banner = document.querySelector(".hc-fixtures");
    return i.getBoundingClientRect().top + scrollY - (banner ? banner.getBoundingClientRect().height + 16 : 0);
  });
}

for (const sheet of ["night", "emergency"]) {
  test(`телефон 360x640: первое поле ${sheet} на первом экране, шаг в details`, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile");
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`${sheet}/`);
    await page.getByRole("button", { name: "Нет, не сохранять" }).click();
    await page.evaluate(() => scrollTo(0, 0));
    expect(await firstFieldTop(page)).toBeLessThan(640 - STICKY);
    await expect(page.locator('[data-hc-step="fill"] .hc-step__more')).not.toHaveAttribute("open", "");
    const bar = page.locator('[data-hc-step="fill"] .hc-bar');
    const barBox = await bar.boundingBox();
    if (!(await page.locator(".hc-fixtures").count())) expect(barBox.y + barBox.height).toBeLessThanOrEqual(641);
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom));
    expect(pad).toBeGreaterThanOrEqual(barBox.height);
  });

  test(`телефон 360x640, размер A++: первое поле ${sheet} не дальше второго экрана`, async ({ page }, info) => {
    test.skip(info.project.name !== "mobile");
    await page.addInitScript(() => { try { localStorage.setItem("op:prefs", JSON.stringify({ size: "xl" })); } catch {} });
    await deviceAnswer(page, "no");
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`${sheet}/`);
    await expect(page.locator("html")).toHaveAttribute("data-size", "xl");
    expect(await firstFieldTop(page)).toBeLessThan(2 * 640 - STICKY);
  });
}

test("превью в тёмной теме как бумага: белый фон, чёрный текст, подпись копии", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("night/?demo=1");
  await gotoStep(page, "check");
  const colors = await page.locator("#side-1").evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el.querySelector(".hc-paper__title")).color }));
  expect(colors.bg).toBe("rgb(255, 255, 255)");
  const [r, g, b] = colors.fg.match(/\d+/g).map(Number);
  expect(r + g + b).toBeLessThan(150);
  await expect(page.locator("#hc-preview-label")).toContainText("Уменьшенная копия листа");
  await expect(page.locator("[data-hc-preview]")).toHaveAttribute("aria-labelledby", "hc-preview-label");
});

test("на 1024 и 1440 шаги в одну линию, у превью подсказка прокрутки", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("night/?demo=1");
    const tops = await page.locator(".op-steps__item").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, `ширина ${width}`).toBe(1);
    await expect(page.locator(".hc-preview__hint")).toBeVisible();
  }
});
