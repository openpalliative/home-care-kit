import { expect } from "../../opsite/tests/fixtures.js";

export async function printText(page, selector) {
  await page.emulateMedia({ media: "print" });
  const text = await page.locator(selector).evaluate((root) => {
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) out.push(child.textContent);
        else if (child.nodeType === 1 && getComputedStyle(child).display !== "none") walk(child);
      }
    };
    walk(root);
    return out.join(" ").replace(/\s+/g, " ");
  });
  await page.emulateMedia({ media: null });
  return text;
}

export async function idbNames(page) {
  return page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
}

export async function gotoStep(page, id) {
  await page.locator(`.op-steps a.op-steps__step[href="#hc-step-${id}"]`).click();
  await expect(page.locator(`[data-hc-step="${id}"]`)).toBeVisible();
}

export async function showField(page, id) {
  await page.locator("hc-sheet[data-ready]").waitFor({ state: "attached" });
  const input = page.locator(`[data-hc-field="${id}"]`);
  if (await input.isVisible()) return input;
  const where = await input.evaluate((i) => ({
    step: i.closest("[data-hc-step]")?.dataset.hcStep,
    part: i.closest("fieldset.hc-group")?.dataset.title,
  }));
  if (where.step && !(await page.locator(`[data-hc-step="${where.step}"]`).isVisible())) await gotoStep(page, where.step);
  if (where.part && !(await input.isVisible())) {
    await page.locator("[data-hc-sub] summary").click();
    await page.locator("[data-hc-sub-list]").getByRole("button", { name: where.part, exact: true }).click();
  }
  await expect(input).toBeVisible();
  return input;
}

export async function fillField(page, id, value) {
  const input = await showField(page, id);
  await input.fill(value);
  await expect(input).toHaveValue(value);
}

export async function deviceAnswer(page, answer = "yes") {
  await page.addInitScript((a) => {
    try { if (!sessionStorage.getItem("hc-test-init")) { localStorage.setItem("hc:device-save", a); sessionStorage.setItem("hc-test-init", "1"); } } catch {}
  }, answer);
}

export async function expectedUntil(page, checkedAt) {
  const { validUntil } = await import("../../lib/validity.js");
  const { verifiedYears } = await import("../../lib/holidays.js");
  const res = await page.request.get("data/v1/holiday-runs.json");
  const runs = (await res.json()).items;
  return validUntil({ checkedAt, verifiedYears: verifiedYears(runs) });
}

export async function regionWith(page, test) {
  const res = await page.request.get("data/v1/region-view.json");
  const data = await res.json();
  return data.items.find((r) => r.lines.some(test))?.id;
}

export const ruDate = (iso) => iso.split("-").reverse().join(".");

export async function decodeSvg(page, markup) {
  const { default: jsQR } = await import("jsqr");
  const img = await page.evaluate(async (xml) => {
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = 300;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, size, size);
    URL.revokeObjectURL(url);
    return { data: Array.from(ctx.getImageData(0, 0, size, size).data), size };
  }, markup);
  const code = jsQR(Uint8ClampedArray.from(img.data), img.size, img.size);
  return code ? new TextDecoder("utf-8").decode(Uint8Array.from(code.binaryData)) : null;
}

export async function stubPrint(page) {
  await page.evaluate(() => {
    window.__snaps = [];
    window.print = () => {
      window.__snaps.push({
        wallet: document.body.classList.contains("hc-paper-wallet"),
        boxes: [...document.querySelectorAll("[data-hc-qr-box]")].map((b) => ({
          size: b.dataset.hcQrBox, hidden: b.hidden, text: b.dataset.text || "", svg: b.querySelector("svg") ? new XMLSerializer().serializeToString(b.querySelector("svg")) : "",
        })),
      });
    };
  });
}

export async function currentPayload(page) {
  return page.evaluate(async () => {
    const { buildPayload } = await import(new URL("../lib/qr-payload.js", location.href).href);
    const fields = [...document.querySelectorAll("[data-hc-field][data-hc-qr-order]")].map((i) => ({
      id: i.dataset.hcField, qr_order: Number(i.dataset.hcQrOrder), qr_key: i.dataset.hcQrKey, type: i.getAttribute("type") || "textarea",
    }));
    const values = {};
    for (const i of document.querySelectorAll("[data-hc-field]")) {
      const v = i.value.trim();
      values[i.dataset.hcField] = i.getAttribute("type") === "date" && /^\d{2}\.\d{2}\.\d{4}$/.test(v) ? v.split(".").reverse().join("-") : v;
    }
    return buildPayload(fields, values, { limit: 400 }).text;
  });
}
