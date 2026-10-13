import { openStore } from "../../ui/js/store.js";
import { todayIso } from "../../ui/js/format.js";
import { normalizeRecord, RECORD } from "../../lib/record.js";
import { normalizeDate, ru, ageText } from "../../lib/dates.js";
import { printWith, el } from "./hc-common.js";

const COUNT_FROM = 20;
const NO_STORE = "Браузер не даёт сохранять на этом устройстве, например в режиме инкогнито. Лист можно заполнить и распечатать, но после закрытия вкладки он пропадёт";

export function isDemo() {
  return new URLSearchParams(location.search).get("demo") === "1";
}

function field(root, row) {
  const d = row.dataset;
  const id = d.hcRow;
  const wrap = el("div", "op-field hc-field");
  const label = el("label", "op-field__label", d.l || row.querySelector(".hc-row__label").textContent);
  label.htmlFor = `hc-${id}`;
  if ("r" in d) label.append(" ", el("span", "op-field__optional", "(обязательно)"));
  wrap.append(label);
  const described = [];
  const notes = [];
  const cap = row.querySelector(".hc-row__cap");
  for (const [text, cls, suffix] of [[cap?.textContent, "hc-caption", "c"], [d.h, "op-field__hint hc-hint", "h"]]) {
    if (!text) continue;
    const p = el("p", cls, text);
    p.id = `hc-${id}-${suffix}`;
    described.push(p.id);
    notes.push(p);
  }
  if (notes[0]?.classList.contains("hc-caption")) wrap.append(notes.shift());
  const area = d.t === "textarea";
  const input = el(area ? "textarea" : "input", area ? "op-input op-input--area" : "op-input");
  if (area) input.rows = Math.max(Number(d.bl) || 1, 2) + 1;
  else input.type = d.t === "tel" || d.t === "date" ? d.t : "text";
  if (d.t === "tel") input.inputMode = "tel";
  input.id = `hc-${id}`;
  input.dataset.hcField = id;
  input.maxLength = Number(d.m);
  input.autocomplete = d.ac || "off";
  if (d.d) input.dataset.hcDemo = d.d;
  if (d.qo) {
    input.dataset.hcQrOrder = d.qo;
    input.dataset.hcQrKey = d.qk;
  }
  if (described.length) input.setAttribute("aria-describedby", described.join(" "));
  wrap.append(input, ...notes);
  if (d.t === "date") {
    const err = root.querySelector("[data-hc-err-tpl]").content.firstElementChild.cloneNode(true);
    err.id = `hc-${id}-e`;
    wrap.append(err);
  }
  const box = el("div", "hc-suggest");
  if (d.s === "now") {
    const tpl = root.querySelector(`[data-hc-sugg-tpl="${id}"]`);
    if (tpl) box.append(tpl.content.cloneNode(true));
  } else if (d.s) {
    Object.assign(box.dataset, { hcSuggest: d.s, hcSuggestId: d.si, hcFor: id });
  }
  if (d.s) wrap.append(box);
  return wrap;
}

export function buildForm(root) {
  if (root.querySelector("[data-hc-field]")) return;
  const fill = root.querySelector("[data-hc-fill]");
  const check = root.querySelector("[data-hc-checkfields]");
  const seen = new Set();
  let last = null;
  for (const block of document.querySelectorAll("[data-hc-form]")) {
    const rows = [...block.querySelectorAll(".hc-row[data-t]")].filter((r) => !seen.has(r.dataset.hcRow));
    if (!rows.length) continue;
    let target = check;
    if (block.dataset.hcForm !== "check") {
      const title = block.querySelector(".hc-pblock__title")?.textContent || "";
      if (last && last.dataset.title === title) {
        target = last;
      } else {
        target = el("fieldset", "hc-group");
        target.dataset.title = title;
        target.append(el("legend", "hc-group__title", title));
        if (block.hasAttribute("data-hc-numbers")) target.dataset.hcNumbers = "";
        fill.append(target);
        last = target;
      }
    }
    for (const row of rows) {
      seen.add(row.dataset.hcRow);
      target.append(field(root, row));
    }
  }
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

export function createSheet(root, { canSave = false, noFuture = [], groups = false, beforeRender = () => {}, beforePrint = async () => {}, onChange = () => {} } = {}) {
  const sheetId = root.dataset.sheet;
  buildForm(root);
  const inputs = new Map([...root.querySelectorAll("[data-hc-field]")].map((i) => [i.dataset.hcField, i]));
  const outs = [...document.querySelectorAll("[data-hc-out]")];
  const steps = [...root.querySelectorAll("[data-hc-step]")];
  const stepLinks = [...root.querySelectorAll('.op-steps a.op-steps__step[href^="#hc-step-"]')];
  const doneIcon = root.querySelector("[data-hc-done-icon]");
  const savedLine = root.querySelector("[data-hc-saved]");
  const sub = root.querySelector("[data-hc-sub]");
  const subCount = root.querySelector("[data-hc-sub-count]");
  const found = groups && sub && subCount ? [...root.querySelectorAll("[data-hc-fill] > fieldset.hc-group")] : [];
  const parts = found.length > 1 ? found : [];
  const demo = isDemo();
  const state = { sheetId, values: {}, confirmed: {}, checked_at: null, extra: {}, data: {}, demo, canSave: canSave && !demo };
  let store = null;
  let timer = null;
  let part = 0;

  const today = () => todayIso();

  function fieldValue(id) {
    const input = inputs.get(id);
    const raw = input.value.trim();
    if (input.getAttribute("type") !== "date") return raw;
    const norm = normalizeDate(raw);
    let error = norm === null ? "Дата в виде ДД.ММ.ГГГГ, например 01.09.2026" : "";
    if (!error && norm && noFuture.includes(id) && norm > today()) error = "Дата не может быть позже сегодняшней";
    showError(input, error);
    return error ? "" : norm;
  }

  function showError(input, text) {
    const box = document.getElementById(`${input.id}-e`);
    if (!box) return;
    box.hidden = !text;
    box.querySelector("[data-hc-error-text]").textContent = text;
    input.closest(".op-field").classList.toggle("op-field--error", Boolean(text));
    const ids = (input.getAttribute("aria-describedby") || "").split(" ").filter((x) => x && x !== box.id);
    if (text) {
      ids.push(box.id);
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
    if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
    else input.removeAttribute("aria-describedby");
  }

  function count(input) {
    const max = Number(input.getAttribute("maxlength"));
    const left = max - input.value.length;
    let line = input.parentElement.querySelector(".hc-count");
    if (!line) {
      line = el("p", "hc-count");
      input.after(line);
    }
    const from = Math.min(COUNT_FROM, Math.floor(max / 4));
    line.textContent = !["date", "tel"].includes(input.getAttribute("type")) && left <= from ? `Осталось ${left} ${plural(left, "знак", "знака", "знаков")}` : "";
  }

  function shown(out, value) {
    if (out.dataset.hcFmt === "age") return ageText(value, today());
    return inputs.get(out.dataset.hcOut)?.getAttribute("type") === "date" ? ru(value) || value : value;
  }

  function render() {
    beforeRender(state);
    for (const out of outs) {
      const id = out.dataset.hcOut;
      let value = state.values[id] || "";
      let src = "";
      if (!value && state.data[id]) {
        value = state.data[id].number;
        src = state.data[id].src;
      }
      out.textContent = value ? shown(out, value) : "";
      const row = out.closest(".hc-row");
      if (row) {
        row.classList.toggle("is-filled", Boolean(value));
        row.classList.toggle("is-data", Boolean(src));
        let srcLine = row.querySelector(".hc-row__src");
        if (src && !srcLine) {
          srcLine = el("span", "hc-row__src");
          row.append(srcLine);
        }
        if (srcLine) srcLine.textContent = src;
      }
    }
    onChange(state);
  }

  function collect() {
    for (const id of inputs.keys()) state.values[id] = fieldValue(id);
    for (const id of Object.keys(state.confirmed)) {
      if (state.values[id] !== state.confirmed[id].number) delete state.confirmed[id];
    }
  }

  function record() {
    const confirmed = {};
    for (const [id, c] of Object.entries(state.confirmed)) confirmed[id] = c.date;
    return {
      ...state.extra,
      format: RECORD,
      sheet_id: sheetId,
      sheet_version: root.dataset.version || "",
      values: Object.fromEntries(Object.entries(state.values).filter(([, v]) => v)),
      confirmed,
      checked_at: state.checked_at,
      updated_at: new Date().toISOString(),
    };
  }

  function say(text) {
    if (savedLine) savedLine.textContent = text;
  }

  async function saveNow() {
    clearTimeout(timer);
    if (!state.canSave) return;
    try {
      store ||= openStore("home-care-kit");
      await store.set(sheetId, record());
      say(`Сохранено на этом устройстве в ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`);
    } catch {
      state.canSave = false;
      say(NO_STORE);
    }
  }

  function save() {
    clearTimeout(timer);
    timer = setTimeout(saveNow, 300);
  }

  async function forget() {
    clearTimeout(timer);
    state.canSave = false;
    say("");
    try {
      store ||= openStore("home-care-kit");
      await store.delete(sheetId);
    } catch {}
  }

  function update() {
    collect();
    render();
    save();
  }

  function setValue(id, value, confirm = false) {
    const input = inputs.get(id);
    if (!input) return;
    input.value = value;
    if (confirm) state.confirmed[id] = { number: value, date: today() };
    update();
  }

  function apply(rec) {
    for (const [id, v] of Object.entries(rec.values || {})) {
      const input = inputs.get(id);
      if (input) input.value = v.slice(0, Number(input.getAttribute("maxlength")) || v.length);
    }
    state.checked_at = rec.checked_at || null;
    const { values, confirmed, checked_at, format, sheet_id, sheet_version, updated_at, ...extra } = rec;
    state.extra = extra;
    for (const [id, date] of Object.entries(confirmed || {})) {
      if (values?.[id]) state.confirmed[id] = { number: values[id], date };
    }
  }

  async function load() {
    if (demo) {
      for (const input of inputs.values()) if (input.dataset.hcDemo) input.value = input.dataset.hcDemo;
      const banner = document.querySelector("[data-hc-demo-banner]");
      if (banner) banner.hidden = false;
      return;
    }
    if (!state.canSave) return;
    try {
      store ||= openStore("home-care-kit");
      const raw = await store.get(sheetId);
      if (raw) apply(normalizeRecord(raw, { today: today() }));
    } catch {
      say(NO_STORE);
      state.canSave = false;
    }
  }

  function showPart(index, focus = true) {
    if (!parts.length) return;
    part = Math.max(0, Math.min(parts.length - 1, index));
    parts.forEach((p, i) => { p.hidden = i !== part; });
    const title = parts[part].dataset.title;
    subCount.textContent = `Часть ${part + 1} из ${parts.length}. ${title}`;
    for (const b of sub.querySelectorAll("[data-hc-sub-goto]")) {
      const current = Number(b.dataset.hcSubGoto) === part;
      b.classList.toggle("is-current", current);
      if (current) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    }
    const skip = sub.querySelector("[data-hc-sub-skip]");
    if (skip) skip.hidden = part === parts.length - 1;
    for (const b of root.querySelectorAll('[data-hc-step="fill"] [data-hc-prev]')) b.hidden = part === 0;
    if (focus) {
      subCount.focus({ preventScroll: true });
      root.querySelector(".op-steps")?.scrollIntoView({ block: "start" });
    }
  }

  function buildParts() {
    if (!parts.length) return;
    sub.hidden = false;
    subCount.hidden = false;
    subCount.tabIndex = -1;
    root.querySelector("[data-hc-fill]").classList.add("hc-parts");
    const list = sub.querySelector("[data-hc-sub-list]");
    parts.forEach((p, i) => {
      const li = el("li");
      const b = el("button", "op-btn op-btn--link hc-sub__btn", p.dataset.title);
      b.type = "button";
      b.dataset.hcSubGoto = String(i);
      b.addEventListener("click", () => {
        sub.querySelector("details")?.removeAttribute("open");
        showPart(i);
      });
      li.append(b);
      list.append(li);
    });
    sub.querySelector("[data-hc-sub-skip]")?.addEventListener("click", () => showPart(part + 1));
  }

  function showField(id) {
    const input = inputs.get(id);
    if (!input) return;
    const step = input.closest("[data-hc-step]");
    if (step && step.hidden) go(step.dataset.hcStep, false);
    const i = parts.findIndex((p) => p.contains(input));
    if (i >= 0 && i !== part) showPart(i, false);
  }

  function go(id, focus = true) {
    const ids = steps.map((s) => s.dataset.hcStep);
    const index = Math.max(0, ids.indexOf(id));
    steps.forEach((s, i) => { s.hidden = i !== index; });
    root.dataset.step = ids[index];
    const count = root.querySelector(".op-steps__count");
    if (count) count.textContent = `Шаг ${index + 1} из ${ids.length}`;
    for (const a of stepLinks) {
      const i = ids.indexOf(a.getAttribute("href").slice("#hc-step-".length));
      const item = a.closest(".op-steps__item");
      item.classList.toggle("is-current", i === index);
      item.classList.toggle("is-done", i < index);
      if (i === index) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
      const mark = a.querySelector(".op-steps__mark");
      if (i < index && doneIcon) mark.replaceChildren(doneIcon.content.cloneNode(true));
      else mark.textContent = String(i + 1);
    }
    if (focus) {
      const title = steps[index].querySelector(".hc-step__title");
      title?.focus({ preventScroll: true });
      root.querySelector(".op-steps")?.scrollIntoView({ block: "start" });
    }
    onChange(state);
  }

  function step(delta) {
    const ids = steps.map((s) => s.dataset.hcStep);
    if (root.dataset.step === "fill" && parts.length) {
      const next = part + delta;
      if (next >= 0 && next < parts.length) {
        showPart(next);
        return;
      }
    }
    go(ids[Math.min(ids.length - 1, Math.max(0, ids.indexOf(root.dataset.step) + delta))]);
    if (root.dataset.step === "fill" && delta < 0 && parts.length) showPart(parts.length - 1, false);
  }

  async function print(cls) {
    if (!cls) {
      clearTimeout(timer);
      collect();
      render();
      await beforePrint(state);
    }
    printWith(cls);
  }

  for (const input of inputs.values()) {
    input.addEventListener("input", () => {
      count(input);
      update();
    });
    input.addEventListener("change", update);
  }
  for (const a of stepLinks) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      go(a.getAttribute("href").slice("#hc-step-".length));
    });
  }
  for (const b of root.querySelectorAll("[data-hc-next]")) b.addEventListener("click", () => step(1));
  for (const b of root.querySelectorAll("[data-hc-prev]")) b.addEventListener("click", () => step(-1));
  for (const b of root.querySelectorAll("[data-hc-print-btn]")) b.addEventListener("click", () => print());
  for (const b of root.querySelectorAll("[data-hc-blank]")) b.addEventListener("click", () => print("hc-blank"));
  for (const b of root.querySelectorAll("[data-hc-confirm]")) {
    b.addEventListener("click", () => setValue(b.dataset.hcConfirm, b.dataset.number, true));
  }
  buildParts();

  async function start(firstStep) {
    if (matchMedia("(min-width: 960px)").matches) for (const d of root.querySelectorAll(".hc-step__more")) d.open = true;
    await load();
    collect();
    for (const input of inputs.values()) if (input.value) count(input);
    go(firstStep || steps[0]?.dataset.hcStep, false);
    showPart(0, false);
    render();
    root.dataset.ready = "";
  }

  return { state, inputs, start, go, update, render, save, saveNow, forget, setValue, record, today, print, showField };
}
