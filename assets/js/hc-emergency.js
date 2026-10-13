import { createSheet, isDemo } from "./hc-sheet.js";
import { initCommon, status, printWith } from "./hc-common.js";
import { askDevice, describeMode } from "./hc-device.js";
import { needsWatermark } from "../../lib/validity.js";
import { buildPayload } from "../../lib/qr-payload.js";
import { ru, addDays, ageText } from "../../lib/dates.js";
import { copyText } from "../../ui/js/copy.js";

const root = document.querySelector("hc-sheet[data-sheet]");
const REASONS = { link: "в значении ссылка", limit: "не поместилось" };

function main() {
  initCommon();
  const savemode = root.querySelector("[data-hc-savemode]");
  const validityBox = root.querySelector("[data-hc-validity]");
  const qrToggle = root.querySelector("[data-hc-qr-toggle]");
  const qrInfo = root.querySelector("[data-hc-qr-info]");
  const qrBoxes = [...document.querySelectorAll("[data-hc-qr-box]")];
  const days = Number(root.dataset.watermarkDays) || 90;
  const demo = isDemo();
  let sheet;
  let qrTimer = null;
  let qrText = null;
  let qrJob = Promise.resolve();
  let qrLib = null;

  const qrFields = () => [...sheet.inputs.values()].filter((i) => i.dataset.hcQrOrder).map((i) => ({
    id: i.dataset.hcField, qr_order: Number(i.dataset.hcQrOrder), qr_key: i.dataset.hcQrKey, type: i.getAttribute("type") || "textarea",
  }));

  function hideQr() {
    for (const box of qrBoxes) {
      box.hidden = true;
      delete box.dataset.text;
    }
    qrText = null;
  }

  async function renderQr() {
    const on = !qrToggle || qrToggle.checked;
    const payload = buildPayload(qrFields(), sheet.state.values, { limit: 400 });
    qrInfo?.replaceChildren();
    if (!on || !payload.text) {
      hideQr();
      return;
    }
    if (payload.omitted.length) {
      const names = payload.omitted.map((o) => `${sheet.inputs.get(o.id).dataset.hcQrKey} (${REASONS[o.reason]})`).join(", ");
      qrInfo?.append(status("info", `В код вошли не все поля: ${names}. На листе они есть текстом`));
    }
    if (payload.text === qrText && qrBoxes.every((b) => !b.hidden)) return;
    try {
      qrLib ||= await import("./hc-qr.js");
      for (const box of qrBoxes) {
        box.querySelector("[data-hc-qr-code]").replaceChildren(await qrLib.qrSvg(payload.text));
        box.dataset.text = payload.text;
        box.hidden = false;
      }
      qrText = payload.text;
    } catch {
      hideQr();
      qrInfo?.append(status("error", "Код не получилось построить. Лист печатается и без него"));
    }
  }

  function queueQr() {
    clearTimeout(qrTimer);
    qrJob = qrJob.then(renderQr, renderQr);
    return qrJob;
  }

  function scheduleQr() {
    clearTimeout(qrTimer);
    qrTimer = setTimeout(queueQr, 250);
  }

  function onChange(s) {
    const today = sheet.today();
    const checked = s.values.checked_at || "";
    const filled = Object.entries(s.values).some(([k, v]) => v && k !== "checked_at");
    const mark = filled && needsWatermark(checked, today, days);
    document.body.classList.toggle("hc-watermark", mark);
    validityBox.replaceChildren();
    if (checked && !mark) {
      validityBox.append(status("done", `Проверено ${ru(checked)}. Проверьте лист снова до ${ru(addDays(checked, days))}`));
    } else if (checked) {
      validityBox.append(status("deadline", `Лист проверен больше ${days} дней назад. На листе будет знак «Не проверено». Сверьте данные с врачом и поставьте новую дату`));
    } else if (filled) {
      validityBox.append(status("unverified", "Пока нет даты проверки, на листе будет знак «Не проверено»"));
    }
    scheduleQr();
  }

  function copyBody() {
    const lines = ["Лист для скорой", "При угрозе жизни звоните 103 или 112"];
    for (const [id, input] of sheet.inputs) {
      const value = sheet.state.values[id];
      if (!value) continue;
      const label = input.labels[0]?.textContent.replace(" (обязательно)", "").trim();
      const type = input.getAttribute("type");
      lines.push(`${label}: ${id === "birth_date" ? ageText(value, sheet.today()) : type === "date" ? ru(value) : value}`);
      if (id === "wishes") lines.push("Это не юридический отказ от реанимации");
    }
    return lines.join("\n");
  }

  function begin(save, focus) {
    sheet = createSheet(root, {
      canSave: save,
      noFuture: ["birth_date", "checked_at"],
      onChange: (s) => sheet && onChange(s),
      beforePrint: () => queueQr(),
    });
    describeMode(savemode, save, {
      demo,
      onToggle: async (next) => {
        if (next) {
          sheet.state.canSave = true;
          await sheet.saveNow();
        } else {
          await sheet.forget();
        }
      },
    });
    for (const r of root.querySelectorAll('input[name="hc-paper"]')) {
      r.addEventListener("change", () => {
        document.body.classList.toggle("hc-paper-wallet", r.value === "wallet" && r.checked);
        queueQr();
      });
    }
    qrToggle?.addEventListener("change", () => queueQr());
    root.querySelector("[data-hc-today]")?.addEventListener("click", () => sheet.setValue("checked_at", sheet.today()));
    const live = root.querySelector("[data-hc-copy-live]");
    root.querySelector("[data-hc-copy]")?.addEventListener("click", async () => {
      const ok = await copyText(copyBody()).catch(() => false);
      live.textContent = ok ? "Скопировано. Вставьте текст в медкарту или заметки телефона" : "Не получилось скопировать. Выделите текст на листе и скопируйте вручную";
    });
    sheet.start().then(() => {
      onChange(sheet.state);
      queueQr();
    });
    if (focus) root.querySelector("#hc-step-fill-t")?.focus();
  }

  root.querySelector("[data-hc-ask] [data-hc-blank]")?.addEventListener("click", () => { if (!sheet) printWith("hc-blank"); });
  askDevice(root, { demo, onAnswer: begin });
}

if (root) main();
