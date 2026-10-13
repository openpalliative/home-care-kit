import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, noHorizontalScroll } from "../../opsite/tests/fixtures.js";

const pages = JSON.parse(readFileSync(join(process.cwd(), "tests/e2e/pages.json"), "utf8"));

for (const p of pages) {
  test(`${p.name}: открывается, один h1, без горизонтальной прокрутки, печать без ошибок @xb`, async ({ page }, info) => {
    test.skip(info.project.name === "nojs");
    await page.addInitScript(() => { try { localStorage.setItem("hc:device-save", "no"); } catch {} });
    const res = await page.goto(p.path);
    expect(res.status()).toBeLessThan(400);
    await expect(page.locator("h1")).toHaveCount(1);
    await noHorizontalScroll(page);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("main")).not.toBeEmpty();
    await page.emulateMedia({ media: null });
  });
}
