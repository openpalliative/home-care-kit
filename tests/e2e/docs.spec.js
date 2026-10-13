import { test, expect, pdfPages } from "../../opsite/tests/fixtures.js";
import { printText, idbNames } from "./helpers.js";

test("заключение: выбор группы не меняет адрес и ничего не хранит, печать только выбранной группы @xb", async ({ page }) => {
  await page.goto("conclusion/");
  test.skip(!(await page.locator("details[data-hc-group]").count()), "сборка для Pages: показания закрыты воротами");
  const before = await page.evaluate(() => [location.href, history.length]);
  await page.getByLabel(/^БАС/).check();
  expect(await page.evaluate(() => [location.href, history.length])).toEqual(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => !k.startsWith("op:")))).toEqual([]);
  expect(await idbNames(page)).not.toContain("op-home-care-kit");
  await expect(page.locator('details[data-hc-group="als"]')).toBeVisible();
  await expect(page.locator('details[data-hc-group="dementia"]')).toBeHidden();
  const text = await printText(page, ".hc-doc");
  expect(text).toContain("БАС");
  expect(text).not.toContain("Деменция");
});

test("заключение без JS: все группы в details @nojs", async ({ page }, info) => {
  test.skip(info.project.name !== "nojs");
  await page.goto("conclusion/");
  test.skip(!(await page.locator("details[data-hc-group]").count()), "сборка для Pages: показания закрыты воротами");
  for (const g of ["dementia", "stroke", "als", "chf"]) await expect(page.locator(`details[data-hc-group="${g}"]`)).toBeVisible();
});

test("что подписать: «Нет» на первом вопросе ведёт к исходам ветки и исходу always @xb", async ({ page }) => {
  await page.goto("ahead/");
  const first = page.locator("[data-hc-q]:visible");
  await expect(first).toHaveCount(1);
  const no = first.locator('[data-hc-answer="no"]');
  const ids = ((await no.getAttribute("data-outcomes")) || "").split(" ").filter(Boolean);
  expect(ids.length).toBeGreaterThan(0);
  await no.click();
  for (const id of ids) await expect(page.locator(`[data-hc-outcome="${id}"]`)).toBeVisible();
  for (const id of await page.locator("[data-hc-outcome][data-always]").evaluateAll((els) => els.map((e) => e.dataset.hcOutcome))) {
    await expect(page.locator(`[data-hc-outcome="${id}"]`)).toBeVisible();
  }
  const visible = await page.locator("[data-hc-outcome]:visible").count();
  expect(visible).toBeLessThan(await page.locator("[data-hc-outcome]").count());
  await expect(page.locator("[data-hc-q]:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "Ответить заново" }).click();
  await expect(page.locator("[data-hc-q]:visible")).toHaveCount(1);
});

test("что подписать без JS: видны все вопросы и исходы @nojs", async ({ page }, info) => {
  test.skip(info.project.name !== "nojs");
  await page.goto("ahead/");
  const q = await page.locator("[data-hc-q]").count();
  expect(q).toBeGreaterThanOrEqual(3);
  await expect(page.locator("[data-hc-q]:visible")).toHaveCount(q);
  const o = await page.locator("[data-hc-outcome]").count();
  await expect(page.locator("[data-hc-outcome]:visible")).toHaveCount(o);
});

test("выписка: «Есть заключение» прячет ветку без заключения на экране и в печати, «Не знаю» показывает обе @xb", async ({ page }) => {
  await page.goto("discharge/");
  const novk = page.locator('[data-hc-branch="no-vk"]').first();
  const hasvk = page.locator('[data-hc-branch="has-vk"]').first();
  await page.getByLabel("Да, есть").check();
  await expect(novk).toBeHidden();
  await expect(hasvk).toBeVisible();
  const novkTitle = (await novk.locator("h2").textContent()).trim();
  expect(await printText(page, ".hc-doc")).not.toContain(novkTitle);
  await page.getByLabel(/Не знаю/).check();
  await expect(novk).toBeVisible();
  await expect(hasvk).toBeVisible();
});

async function printView(page, root) {
  await page.emulateMedia({ media: "print" });
  const out = await page.locator(root).evaluate((el) => {
    const visible = (n) => n.checkVisibility();
    const outcomes = [...el.querySelectorAll("[data-hc-outcome]")].filter(visible).map((li) => ({
      id: li.dataset.hcOutcome,
      title: li.querySelector(".hc-outcome__title").textContent.trim(),
      take: [...li.querySelectorAll(".hc-outcome__take li")].map((x) => x.textContent.trim()),
      unvQuotes: Number(li.dataset.hcUnvQuotes || 0),
    }));
    const skipped = [...el.querySelectorAll(".hc-skipped")].filter(visible).map((x) => x.textContent.replace(/\s+/g, " ").trim());
    const text = el.innerText.replace(/\s+/g, " ");
    return { outcomes, skipped, text };
  });
  await page.emulateMedia({ media: null });
  return out;
}

async function answer(page, labels) {
  for (const label of labels) {
    await page.locator("[data-hc-q]:visible").getByRole("button", { name: label, exact: true }).click();
  }
}

test("что подписать: путь «Нет» печатает заголовки исходов под плашкой юриста", async ({ page }) => {
  await page.goto("ahead/");
  await answer(page, ["Нет"]);
  const v = await printView(page, "main");
  expect(v.outcomes.length).toBeGreaterThanOrEqual(2);
  for (const o of v.outcomes) {
    expect(v.text).toContain(o.title);
    for (const t of o.take) expect(v.text).toContain(t);
  }
  expect(v.text).toContain("Текст не проверен юристом в РФ");
  const notChecked = (v.text.match(/Пункт не проверен/g) || []).length;
  expect(notChecked).toBeLessThanOrEqual(v.outcomes.reduce((n, o) => n + o.unvQuotes, 0));
});

test("что подписать: нотариус на дом печатается целиком с тем, что взять", async ({ page }) => {
  await page.goto("ahead/");
  await answer(page, ["Да", "Да", "Дома", "Нет", "Нет", "Нет", "Нет"]);
  const v = await printView(page, "main");
  const notary = v.outcomes.find((o) => o.id === "notary-home");
  test.skip(!notary, "в дереве нет исхода нотариуса на дом");
  expect(v.text).toContain(notary.title);
  expect(v.text).toContain("Паспорт человека");
});

test("что подписать: «Нет» ведёт к опеке без «оформить нельзя», «Не всегда» и подпись за человека к нотариусу", async ({ page }) => {
  await page.goto("ahead/");
  await answer(page, ["Нет"]);
  await expect(page.locator('[data-hc-outcome="guardianship"]')).toBeVisible();
  await expect(page.locator('[data-hc-outcome="guardianship"] .hc-outcome__title')).toHaveText("Если человек уже не понимает, что подписывает");
  await expect(page.locator("main")).not.toContainText("оформить нельзя");
  await expect(page.locator('[data-hc-outcome="sign-for"]')).toBeHidden();
  await page.getByRole("button", { name: "Ответить заново" }).click();
  await answer(page, ["Не всегда", "Нет", "Дома", "Да", "Нет", "Нет", "Нет"]);
  await expect(page.locator('[data-hc-outcome="sign-for"]')).toBeVisible();
  await expect(page.locator('[data-hc-outcome="guardianship"]')).toBeHidden();
  const v = await printView(page, "main");
  const sign = v.outcomes.find((o) => o.id === "sign-for");
  expect(v.text).toContain(sign.title);
  expect(v.text).not.toContain("удостоверяет нотариус");
  expect(v.text).toContain("Пункт не проверен: пояснение смотрите на экране");
});

test("печать: непроверенные пункты схлопнуты в одну строку", async ({ page }) => {
  await page.goto("conclusion/");
  const c = await printView(page, ".hc-doc");
  expect(c.text).not.toContain("Пункт не проверен и в лист не включён");
  const unv = await page.locator(".hc-check .hc-item.is-unverified, .hc-ind.is-unverified, .hc-qblock .op-status--unverified").count();
  if (unv) expect(c.skipped.length).toBeGreaterThan(0);
  for (const line of c.skipped) expect(line).toMatch(/не проверен|смотрите их на экране/);
  expect(c.skipped.length).toBeLessThan(Math.max(unv, 2));
  for (const sel of ["discharge/", "night/"]) {
    await page.goto(sel);
    const v = await printView(page, "main");
    expect(v.text, sel).not.toContain("Пункт не проверен и в лист не включён");
  }
});

test("что подписать: печать занимает столько листов, сколько обещает карточка", async ({ page, request }, info) => {
  test.skip(info.project.name === "nojs");
  const sheets = (await (await request.get("data/v1/sheets.json")).json()).items;
  const want = sheets.find((s) => s.id === "ahead").print_pages.a4;
  await page.goto("ahead/");
  const got = await pdfPages(page);
  if (process.env.HC_FIXTURES === "1") expect(got).toBeLessThanOrEqual(want);
  else expect(got).toBe(want);
});
