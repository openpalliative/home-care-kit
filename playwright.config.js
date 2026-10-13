import { defineConfig } from "@playwright/test";

const port = 8704;
const repo = "home-care-kit";

export default defineConfig({
  workers: process.env.CI ? undefined : 2,
  testDir: ".",
  testMatch: ["tests/e2e/**/*.spec.js", "opsite/tests/pages.spec.js"],
  testIgnore: ["scripts/**", "node_modules/**", "vendor/**"],
  outputDir: "_reports/pw",
  reporter: [["list"], ["json", { outputFile: "_reports/e2e.json" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}/${repo}/`,
    headless: true,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    serviceWorkers: "block",
  },
  webServer: {
    command: "uv run python -m opsite serve --no-open",
    url: `http://127.0.0.1:${port}/${repo}/`,
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "firefox", timeout: 60000, use: { browserName: "firefox", viewport: { width: 1280, height: 800 } }, grep: /@xb/ },
    { name: "webkit", timeout: 60000, use: { browserName: "webkit", viewport: { width: 390, height: 844 } }, grep: /@xb/ },
    { name: "nojs", use: { browserName: "chromium", viewport: { width: 1280, height: 800 }, javaScriptEnabled: false }, grep: /@nojs/ },
  ],
});
