import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "../../opsite/tests/fixtures.js";

test.use({ serviceWorkers: "allow" });
test.describe.configure({ mode: "serial" });

const SW = join(process.cwd(), "_site/sw.js");

async function controlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
}

test("после первого визита листы открываются без интернета", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("night/");
  await controlled(page);
  await context.setOffline(true);
  for (const path of ["night/", "emergency/", "discharge/", "conclusion/", "ahead/", "./"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
  }
  await context.setOffline(false);
  const keys = await page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) out.push(req.url);
    return out;
  });
  expect(keys.filter((u) => u.includes("?"))).toEqual([]);
});

test("без сети видна плашка «Нет интернета»", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { get: () => false }));
  await page.goto("night/");
  await expect(page.locator("[data-hc-offline]")).toContainText("Нет интернета");
});

test("новая версия показывает плашку «Обновить»", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("night/");
  await controlled(page);
  const original = readFileSync(SW, "utf8");
  try {
    writeFileSync(SW, original.replace(/const VERSION = "([^"]+)"/, 'const VERSION = "$1-next"'));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(page.locator(".op-update")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".op-update button")).toHaveText("Обновить");
  } finally {
    writeFileSync(SW, original);
  }
});
