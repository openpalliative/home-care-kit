import { test, expect, pdfPages } from "../../opsite/tests/fixtures.js";
import { printText, fillField, expectedUntil, regionWith, ruDate, gotoStep, deviceAnswer, showField } from "./helpers.js";
import { addDays } from "../../lib/dates.js";

async function nightRecord(page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === "op-home-care-kit")) return null;
    return new Promise((resolve) => {
      const req = indexedDB.open("op-home-care-kit");
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) { db.close(); return resolve(null); }
        const get = db.transaction("kv").objectStore("kv").get("night");
        get.onsuccess = () => { db.close(); resolve(get.result ?? null); };
        get.onerror = () => { db.close(); resolve(null); };
      };
    });
  });
}

async function savedCheckedAt(page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((d) => d.name === "op-home-care-kit")) return null;
    return new Promise((resolve) => {
      const req = indexedDB.open("op-home-care-kit");
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) return resolve(null);
        const get = db.transaction("kv").objectStore("kv").get("night");
        get.onsuccess = () => { db.close(); resolve(get.result?.checked_at ?? null); };
        get.onerror = () => { db.close(); resolve(null); };
      };
    });
  });
}

test.beforeEach(async ({ page }, info) => {
  await page.clock.install({ time: new Date("2026-10-11T10:00:00+03:00") });
  if (!info.title.includes("@ask")) await deviceAnswer(page, "yes");
});

test("заполнить, проверить номера, напечатать 2 страницы с датой и черновиком", async ({ page }) => {
  await page.goto("night/");
  await expect(page.getByText("Шаг 1 из 3")).toBeAttached();
  await fillField(page, "hospice_phone", "+7 000 000-00-11");
  await fillField(page, "address", "ул. Садовая, д. 1");
  await expect(page.locator('#side-1 [data-hc-out="hospice_phone"]')).toHaveText("+7 000 000-00-11");
  await gotoStep(page, "check");
  await expect(page.getByText("Шаг 2 из 3")).toBeAttached();
  await page.getByRole("button", { name: "Номера проверены" }).click();
  await expect(page.locator("[data-hc-validity]")).toContainText("Отметьте каждый номер");
  for (const box of await page.locator("[data-hc-verify] input").all()) await box.check();
  await page.getByRole("button", { name: "Номера проверены" }).click();
  const until = ruDate(await expectedUntil(page, "2026-10-11"));
  await expect(page.locator("[data-hc-validity]")).toContainText(`Данные верны до ${until}`);
  expect(await pdfPages(page)).toBe(2);
  const text = await printText(page, "[data-hc-preview]");
  expect(text).toContain(`Данные верны до: ${until}`);
  expect(text).toContain("Черновик");
  expect(text).toContain("103");
  expect(text).toContain("112");
});

test("строка 103 и 112 на листе без кнопки удаления @xb", async ({ page }) => {
  await page.goto("night/");
  const locked = page.locator('#side-1 [data-hc-print="locked"]');
  await expect(locked).toContainText("103");
  await expect(locked).toContainText("112");
  await expect(locked.locator("button")).toHaveCount(0);
});

test("непроверенная горячая линия попадает на лист только после подтверждения @xb", async ({ page }) => {
  await page.goto("night/");
  const out = page.locator('#side-1 [data-hc-out="hotline"]');
  await expect(out).toHaveText("");
  expect(await printText(page, "#side-1")).not.toContain("8-800-700-84-36");
  await showField(page, "hotline");
  await page.getByRole("button", { name: "Я позвонил, номер работает: вписать" }).first().click();
  await expect(out).toHaveText("8-800-700-84-36");
  expect(await printText(page, "#side-1")).toContain("8-800-700-84-36");
});

test("номер региона: непроверенный не на листе, после звонка на листе; #region выбирает регион", async ({ page }) => {
  await page.goto("night/");
  const region = await regionWith(page, (l) => !l.printable);
  test.skip(!region, "в region-view нет непроверенных номеров");
  await page.goto("./");
  await page.goto(`night/#region=${region}`);
  await showField(page, "region_line");
  await expect(page.locator("#hc-region")).toHaveValue(region);
  expect(new URL(page.url()).hash).toBe("");
  const out = page.locator('#side-1 [data-hc-out="region_line"]');
  await expect(out).toHaveText("");
  const box = page.locator('[data-hc-suggest="region"]');
  await expect(box).toContainText("Не проверено");
  await box.getByRole("button", { name: /Я позвонил/ }).first().click();
  await expect(out).not.toHaveText("");
  expect(await printText(page, "#side-1")).toContain(await out.textContent());
});

test("регион без отдельной линии: подсказка общей линии минздрава, на лист только после звонка", async ({ page }) => {
  await page.goto("night/");
  const res = await page.request.get("data/v1/region-view.json");
  const regions = (await res.json()).items;
  const region = regions.find((r) => r.lines.length && r.lines.every((l) => l.role === "general"))?.id;
  test.skip(!region, "в region-view нет регионов только с общей линией");
  await showField(page, "region_line");
  await page.locator("#hc-region").selectOption(region);
  const box = page.locator('[data-hc-suggest="region"]');
  await expect(box).toContainText("общая горячая линия минздрава региона");
  await expect(box).toContainText("Не проверено");
  const out = page.locator('#side-1 [data-hc-out="region_line"]');
  await expect(out).toHaveText("");
  await box.getByRole("button", { name: /Я позвонил/ }).first().click();
  await expect(out).not.toHaveText("");
});

test("проверенный номер региона печатается сам, со ссылкой на источник", async ({ page }) => {
  await page.goto("night/");
  const region = await regionWith(page, (l) => l.printable);
  test.skip(!region, "в region-view пока нет проверенных номеров");
  await showField(page, "region_line");
  await page.locator("#hc-region").selectOption(region);
  const row = page.locator('#side-1 [data-hc-row="region_line"]');
  await expect(row.locator("[data-hc-out]")).not.toHaveText("");
  await expect(row).toContainText("проверено");
});

test("после срока годности печать заменена на «Проверить и продлить», на листе «Не действителен»", async ({ page }) => {
  await page.goto("night/");
  await fillField(page, "cabinet_phone", "+7 000 000-00-12");
  await gotoStep(page, "check");
  for (const box of await page.locator("[data-hc-verify] input").all()) await box.check();
  await page.getByRole("button", { name: "Номера проверены" }).click();
  await expect(page.locator("[data-hc-validity]")).toContainText("Данные верны до");
  await expect.poll(() => savedCheckedAt(page)).toBe("2026-10-11");
  await page.clock.setSystemTime(new Date("2027-06-01T10:00:00+03:00"));
  await page.reload();
  await gotoStep(page, "print");
  await expect(page.locator("[data-hc-printstate]")).toContainText("Срок годности листа истёк");
  await expect(page.locator('[data-hc-step="print"] [data-hc-print-btn]')).toBeHidden();
  await expect(page.getByRole("button", { name: "Проверить и продлить" })).toBeVisible();
  const text = await printText(page, "[data-hc-preview]");
  const until = await expectedUntil(page, "2026-10-11");
  expect(text).toContain(`Не действителен с ${ruDate(addDays(until, 1))}`);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator('#side-1 [data-hc-print="data"]').first()).toBeHidden();
  await page.emulateMedia({ media: null });
  await page.getByRole("button", { name: "Проверить и продлить" }).click();
  await expect(page.locator('[data-hc-step="check"]')).toBeVisible();
});

test("пустой бланк печатается без JS ровно на 2 страницах @nojs", async ({ page }, info) => {
  test.skip(info.project.name !== "nojs");
  await page.goto("night/");
  await expect(page.locator("#side-1")).toBeVisible();
  await expect(page.locator("#folder")).toBeVisible();
  expect(await pdfPages(page)).toBe(2);
});

test("на телефоне превью скрыто на первом шаге и видно на втором", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await page.goto("night/");
  await expect(page.locator("[data-hc-preview]")).toBeHidden();
  await gotoStep(page, "check");
  await expect(page.locator("[data-hc-preview]")).toBeVisible();
});

test("#folder открывает вторую сторону", async ({ page }) => {
  await page.goto("night/#folder");
  await expect(page.locator("#folder")).toBeInViewport();
});

test("печать: «Первые 48 часов» одной строкой с адресом страницы", async ({ page }) => {
  await page.goto("night/");
  await page.locator("hc-sheet[data-ready]").waitFor({ state: "attached" });
  await page.emulateMedia({ media: "print" });
  const lines = await page.locator("#folder .hc-skipped").evaluateAll((els) => els.filter((e) => e.checkVisibility()).map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  await page.emulateMedia({ media: null });
  const block = page.locator('#folder [data-hc-block="first-48"]');
  const ok = await block.locator(".hc-check--paper li:not(.hc-skipped)").count();
  if (ok === 0) {
    expect(lines.filter((l) => l.startsWith("Первые 48 часов"))).toHaveLength(1);
    expect(lines.join(" ")).toContain("home-care-kit/night/");
  }
  expect(await printText(page, "#folder")).not.toContain("Пункт не проверен и в лист не включён");
});

test("печать: адрес один раз, «кто проверял» в строке «Проверено» @xb", async ({ page }) => {
  await page.goto("night/");
  await fillField(page, "address", "ул. Тестовая, д. 7");
  await fillField(page, "person_name", "Анна");
  await fillField(page, "checked_by", "Пётр Иванов");
  await gotoStep(page, "print");
  await expect(page.locator("[data-hc-printstate]")).toContainText("срока годности на листе не будет");
  const text = (await printText(page, "[data-hc-preview]")).replace(/\s+([.,])/g, "$1");
  expect(text.split("ул. Тестовая, д. 7").length - 1).toBe(1);
  expect(text).toMatch(/Проверено:[^.]*кто проверял: Пётр Иванов\. Данные верны до:/);
  expect(await printText(page, '#side-1 [data-hc-block="who"]')).not.toContain("Пётр");
});

test("первый визит спрашивает про устройство; «Нет» ничего не сохраняет @ask", async ({ page }) => {
  await page.goto("night/");
  await expect(page.getByRole("heading", { name: "Это ваше устройство?" })).toBeVisible();
  await page.getByRole("button", { name: "Нет, не сохранять" }).click();
  await fillField(page, "hospice_name", "Служба");
  await fillField(page, "hospice_phone", "+7 000 000-00-01");
  await fillField(page, "folder_place", "Шкаф");
  await page.waitForTimeout(600);
  expect(await nightRecord(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("hc:device-save"))).toBe("no");
  await page.goto("emergency/");
  await expect(page.getByRole("heading", { name: "Это ваше устройство?" })).toBeHidden();
  await expect(page.getByText("Лист не сохраняется")).toBeVisible();
});

test("«Да» сохраняет запись, второй раз не спрашивает @ask", async ({ page }) => {
  await page.goto("night/");
  await page.getByRole("button", { name: "Да, сохранять здесь" }).click();
  await fillField(page, "hospice_name", "Служба");
  await expect(page.locator("[data-hc-saved]")).toContainText("Сохранено");
  expect(await nightRecord(page)).not.toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Это ваше устройство?" })).toBeHidden();
  await expect(page.locator('[data-hc-field="hospice_name"]')).toHaveValue("Служба");
});

test("?demo=1 не спрашивает и ничего не сохраняет @ask", async ({ page }) => {
  await page.goto("night/?demo=1");
  await expect(page.getByRole("heading", { name: "Это ваше устройство?" })).toBeHidden();
  await page.locator("hc-sheet[data-ready]").waitFor({ state: "attached" });
  await fillField(page, "folder_place", "Шкаф у окна");
  await page.waitForTimeout(600);
  expect(await nightRecord(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("hc:device-save"))).toBeNull();
});
