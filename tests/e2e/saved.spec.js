import { readFileSync } from "node:fs";
import { test, expect } from "../../opsite/tests/fixtures.js";
import { fillField, deviceAnswer } from "./helpers.js";

test("экспорт, удаление и импорт листов @xb", async ({ page }, info) => {
  await deviceAnswer(page, "yes");
  await page.goto("night/");
  await fillField(page, "folder_place", "Шкаф в прихожей");
  await expect(page.locator("[data-hc-saved]")).toContainText("Сохранено");
  await page.goto("saved/");
  await expect(page.locator("[data-hc-saved-list] li")).toHaveCount(1);
  await expect(page.locator("[data-hc-saved-list]")).toContainText("Карта на ночь");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Сохранить файлом" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^listy-dlya-doma-\d{4}-\d{2}-\d{2}\.json$/);
  const path = info.outputPath("backup.json");
  await file.saveAs(path);
  const backup = JSON.parse(readFileSync(path, "utf8"));
  expect(backup.format).toBe("hc-export/1");
  expect(backup.records[0].values.folder_place).toBe("Шкаф в прихожей");
  await expect(page.getByText("Файл не зашифрован")).toBeVisible();

  await page.getByRole("button", { name: "Удалить листы с этого устройства" }).click();
  await page.getByRole("button", { name: "Да, удалить листы" }).click();
  await expect(page.locator("[data-hc-wipe-live]")).toContainText("Листы удалены");
  await expect(page.locator("[data-hc-saved-empty]")).toBeVisible();
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain("op-home-care-kit");

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Открыть файл" }).click();
  await (await chooser).setFiles(path);
  await expect(page.locator("[data-hc-file-live]")).toContainText("Открыто листов: 1");
  await expect(page.locator("[data-hc-saved-list] li")).toHaveCount(1);
  await page.evaluate(() => localStorage.setItem("hc:device-save", "yes"));
  await page.goto("night/");
  await expect(page.locator('[data-hc-field="folder_place"]')).toHaveValue("Шкаф в прихожей");
});

test("мусорный файл даёт понятную ошибку", async ({ page }, info) => {
  await page.goto("saved/");
  const path = info.outputPath("bad.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, JSON.stringify({ hello: 1 }));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Открыть файл" }).click();
  await (await chooser).setFiles(path);
  await expect(page.locator("[data-hc-file-live]")).toContainText("Это не файл листов для дома");
});

async function openFile(page, path) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Открыть файл" }).click();
  await (await chooser).setFiles(path);
}

test("файл больше 1 МБ отклоняется до разбора", async ({ page }, info) => {
  const { writeFileSync } = await import("node:fs");
  await page.goto("saved/");
  const path = info.outputPath("big.json");
  writeFileSync(path, JSON.stringify({ format: "hc-export/1", records: [], pad: "x".repeat(2 * 1024 * 1024) }));
  await page.evaluate(() => {
    window.__parsed = 0;
    const orig = JSON.parse;
    JSON.parse = (...a) => { window.__parsed += 1; return orig(...a); };
  });
  await openFile(page, path);
  await expect(page.locator("[data-hc-file-live]")).toContainText("Файл слишком большой");
  expect(await page.evaluate(() => window.__parsed)).toBe(0);
});

test("замена листа из файла спрашивает, «Отмена» оставляет старое", async ({ page }, info) => {
  const { writeFileSync } = await import("node:fs");
  await deviceAnswer(page, "yes");
  await page.goto("night/");
  await fillField(page, "folder_place", "Шкаф в прихожей");
  await expect(page.locator("[data-hc-saved]")).toContainText("Сохранено");
  await page.goto("saved/");
  const path = info.outputPath("other.json");
  const record = { format: "hc-record/1", sheet_id: "night", values: { folder_place: "Комод" }, checked_at: "2026-02-31", confirmed: { hotline: "2099-01-01" }, updated_at: "2026-01-05T10:00:00.000Z" };
  for (let i = 0; i < 25; i += 1) record[`junk_${i}`] = "x";
  writeFileSync(path, JSON.stringify({ format: "hc-export/1", exported_at: "2026-01-05T10:00:00.000Z", records: [record] }));
  await openFile(page, path);
  const dialog = page.locator("[data-hc-replace-dialog]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-hc-replace-file]")).toContainText("05.01.2026");
  await expect(dialog.locator("[data-hc-replace-here]")).not.toBeEmpty();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(page.locator("[data-hc-file-live]")).toContainText("Ничего не изменилось");
  await page.goto("night/");
  await expect(page.locator('[data-hc-field="folder_place"]')).toHaveValue("Шкаф в прихожей");
  await page.goto("saved/");
  await openFile(page, path);
  await dialog.getByRole("button", { name: "Заменить" }).click();
  await expect(page.locator("[data-hc-file-live]")).toContainText("Открыто листов: 1");
  const saved = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open("op-home-care-kit");
    req.onsuccess = () => {
      const get = req.result.transaction("kv").objectStore("kv").get("night");
      get.onsuccess = () => { req.result.close(); resolve(get.result); };
    };
  }));
  expect(saved.values.folder_place).toBe("Комод");
  expect(saved.checked_at).toBeNull();
  expect(saved.confirmed).toEqual({});
  expect(Object.keys(saved).filter((k) => k.startsWith("junk_")).length).toBeLessThanOrEqual(20);
});

test("дата изменения листа по местному времени, а не по UTC", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-12T22:30:00Z") });
  await deviceAnswer(page, "yes");
  await page.goto("night/");
  await fillField(page, "folder_place", "Шкаф в прихожей");
  await expect(page.locator("[data-hc-saved]")).toContainText("Сохранено");
  await page.goto("saved/");
  await expect(page.locator("[data-hc-saved-list]")).toContainText("Изменён 13.10.2026");
});
