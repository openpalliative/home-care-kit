import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, shot } from "../../opsite/tests/fixtures.js";

const pages = JSON.parse(readFileSync(join(process.cwd(), "tests/e2e/pages.json"), "utf8"));

for (const p of pages) {
  test(`скриншоты ${p.name} @shots`, async ({ page }, info) => {
    if (info.project.name === "nojs") test.skip();
    await page.goto(p.path);
    await page.evaluate(() => document.fonts.ready);
    await shot(page, p.name, { print: typeof p.print_pages === "number" });
  });
}
