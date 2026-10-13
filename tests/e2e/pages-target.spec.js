import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, pdfPages } from "../../opsite/tests/fixtures.js";

const ROOT = process.cwd();
const COPY = ["site.yaml", "deps.yaml", "site_hooks.py", "templates", "assets", "content", "lib", "data", "vendor", "pipeline", "tests/fixtures", "opsite"];
let site = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "hc-pages-"));
  for (const name of COPY) {
    if (existsSync(join(ROOT, name))) cpSync(join(ROOT, name), join(dir, name), { recursive: true, filter: (src) => !src.includes("__pycache__") });
  }
  execFileSync("uv", ["run", "python", "-m", "opsite", "--root", dir, "build"], { cwd: ROOT, env: { ...process.env, OP_TARGET: "pages", HC_FIXTURES: "" }, stdio: "pipe" });
  site = join(dir, "_site");
});

async function servePages(page) {
  await page.route("**/home-care-kit/**", (route) => {
    const url = new URL(route.request().url());
    let file = join(site, decodeURIComponent(url.pathname.replace(/^\/home-care-kit\//, "")));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ path: file });
  });
}

test("Pages: conclusion без пустого раздела и заглушки, со ссылкой на публикацию", async ({ page }, info) => {
  test.skip(info.project.name === "nojs");
  const html = readFileSync(join(site, "conclusion/index.html"), "utf8");
  const gates = readFileSync(join(ROOT, "content/gates.yaml"), "utf8");
  test.skip(/indications_public:\s*true/.test(gates), "показания открыты решением");
  expect(html).not.toContain("Показания по заболеванию");
  expect(html).not.toContain("появится здесь после проверки");
  expect(html).not.toContain("hc-print-hint");
  expect(html).not.toContain("data-hc-group=");
  await servePages(page);
  await page.goto("conclusion/");
  const line = page.locator("[data-hc-ind-link]");
  await expect(line).toContainText("Текст показаний смотрите в официальной публикации");
  await expect(line.locator("a")).toHaveAttribute("href", /publication\.pravo\.gov\.ru\/document\/\d+/);
  await expect(page.getByRole("heading", { level: 2, name: "Показания по заболеванию" })).toHaveCount(0);
  const pages = await pdfPages(page);
  await page.goto("./");
  const card = page.locator(".hc-card", { hasText: "Что даёт заключение" });
  await expect(card).not.toContainText("на одно заболевание");
  const n = Number((await card.locator(".hc-card__meta").textContent()).match(/(\d+) лист/)[1]);
  expect(n).toBe(pages);
});
