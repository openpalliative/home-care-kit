import { initCommon } from "./hc-common.js";
import { openStore } from "../../ui/js/store.js";
import { downloadJson, pickFile } from "../../ui/js/files.js";
import { makeExport, parseExport, checkFileSize, exportFileName, normalizeRecord, RecordError } from "../../lib/record.js";
import { ru } from "../../lib/dates.js";
import { todayIso } from "../../ui/js/format.js";

const localDay = (stamp) => (Number.isNaN(Date.parse(stamp)) ? stamp.slice(0, 10) : todayIso(new Date(stamp)));

const root = document.querySelector("hc-saved");
const FAILED = "Файл не получилось прочитать. Выберите файл, который сохранили на этой странице";

function limits() {
  try {
    return JSON.parse(root.dataset.limits || "{}");
  } catch {
    return {};
  }
}

function when(rec) {
  const parts = [];
  if (rec?.updated_at) parts.push(`изменён ${ru(localDay(rec.updated_at))}`);
  if (rec?.checked_at) parts.push(`проверен ${ru(rec.checked_at)}`);
  return parts.join(", ") || "дата не указана";
}

async function main() {
  initCommon();
  const store = openStore("home-care-kit");
  const options = { limits: limits() };
  const list = root.querySelector("[data-hc-saved-list]");
  const empty = root.querySelector("[data-hc-saved-empty]");
  const tpl = root.querySelector("#hc-saved-item");
  const fileLive = root.querySelector("[data-hc-file-live]");
  const wipeLive = root.querySelector("[data-hc-wipe-live]");
  const replaceDialog = root.querySelector("[data-hc-replace-dialog]");
  const sheetName = (id) => root.querySelector(`[data-hc-sheet-link="${id}"]`)?.textContent || id;

  async function records() {
    const out = [];
    for (const { value } of await store.list()) {
      try { out.push(normalizeRecord(value, options)); } catch {}
    }
    return out;
  }

  async function render(skip = false) {
    let recs = [];
    if (!skip) {
      try {
        recs = await records();
      } catch {
        empty.textContent = "Браузер не даёт сохранять на этом устройстве, например в режиме инкогнито";
      }
    }
    list.replaceChildren();
    for (const r of recs) {
      const node = tpl.content.cloneNode(true);
      const a = node.querySelector("a");
      const link = root.querySelector(`[data-hc-sheet-link="${r.sheet_id}"]`);
      a.href = link?.getAttribute("href") || "../";
      a.textContent = sheetName(r.sheet_id);
      const parts = [];
      if (r.updated_at) parts.push(`Изменён ${ru(localDay(r.updated_at))}`);
      if (r.checked_at) parts.push(`номера проверены ${ru(r.checked_at)}`);
      parts.push(`заполнено полей: ${Object.keys(r.values).length}`);
      node.querySelector(".hc-savedlist__meta").textContent = parts.join(", ");
      list.append(node);
    }
    list.hidden = !recs.length;
    empty.hidden = Boolean(recs.length);
    return recs;
  }

  function confirmReplace(here, incoming) {
    return new Promise((resolve) => {
      replaceDialog.querySelector("[data-hc-replace-name]").textContent = sheetName(incoming.sheet_id);
      replaceDialog.querySelector("[data-hc-replace-here]").textContent = when(here);
      replaceDialog.querySelector("[data-hc-replace-file]").textContent = when(incoming);
      replaceDialog.returnValue = "";
      replaceDialog.addEventListener("close", () => resolve(replaceDialog.returnValue === "replace"), { once: true });
      replaceDialog.showModal();
    });
  }

  root.querySelector("[data-hc-export]").addEventListener("click", async () => {
    const recs = await records().catch(() => []);
    if (!recs.length) {
      fileLive.textContent = "Сохранять нечего: на этом устройстве нет листов";
      return;
    }
    downloadJson(makeExport(recs), exportFileName());
    fileLive.textContent = `Файл ${exportFileName()} сохранён в загрузки`;
  });

  root.querySelector("[data-hc-import]").addEventListener("click", async () => {
    const file = await pickFile();
    if (!file) return;
    let incoming;
    try {
      checkFileSize(file.size);
      incoming = parseExport(await file.text(), options);
    } catch (e) {
      fileLive.textContent = e instanceof RecordError ? e.message : FAILED;
      return;
    }
    const bySheet = new Map();
    for (const r of incoming) bySheet.set(r.sheet_id, r);
    let opened = 0;
    let kept = 0;
    try {
      for (const r of bySheet.values()) {
        const raw = await store.get(r.sheet_id);
        let here = null;
        try { here = raw ? normalizeRecord(raw, options) : null; } catch {}
        if (raw && !(await confirmReplace(here, r))) {
          kept += 1;
          continue;
        }
        await store.set(r.sheet_id, r);
        opened += 1;
      }
    } catch {
      fileLive.textContent = "Браузер не даёт сохранять на этом устройстве, например в режиме инкогнито";
      return;
    }
    fileLive.textContent = opened
      ? `Готово. Открыто листов: ${opened}${kept ? `. Оставлено как было: ${kept}` : ""}`
      : "Ничего не изменилось: листы на устройстве оставлены как были";
    await render();
  });

  const dialog = root.querySelector("[data-hc-wipe-dialog]");
  root.querySelector("[data-hc-wipe-open]").addEventListener("click", () => dialog.showModal());
  dialog.addEventListener("close", async () => {
    if (dialog.returnValue !== "wipe") return;
    wipeLive.textContent = "";
    try {
      await store.wipe();
    } catch (e) {
      wipeLive.textContent = `Не получилось удалить. ${e?.message || "Закройте другие вкладки с листами и нажмите ещё раз"}`;
      await render();
      return;
    }
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith("hc:")) localStorage.removeItem(key);
    } catch {}
    wipeLive.textContent = "Готово. Листы удалены с этого устройства";
    await render(true);
  });

  await render();
}

if (root) main();
