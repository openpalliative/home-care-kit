import { createSheet, buildForm, isDemo } from "./hc-sheet.js";
import { initCommon, status, el, printWith } from "./hc-common.js";
import { askDevice, describeMode } from "./hc-device.js";
import { getRegion, setRegion } from "../../ui/js/region-store.js";
import { xurl, readParams } from "../../ui/js/xparams.js";
import { phoneHref } from "../../ui/js/format.js";
import { validUntil, isExpired } from "../../lib/validity.js";
import { upcomingRuns, inRun, verifiedYears } from "../../lib/holidays.js";
import { ru, addDays } from "../../lib/dates.js";

const root = document.querySelector("hc-sheet[data-sheet]");
const withExt = (line) => (line.ext ? `${line.phone}, доб. ${line.ext}` : line.phone);

async function dataset(name) {
  try {
    const res = await fetch(new URL(`../../data/v1/${name}.json`, import.meta.url));
    return res.ok ? (await res.json()).items || [] : [];
  } catch {
    return [];
  }
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

function buildRegion() {
  buildForm(root);
  const fs = root.querySelector("fieldset[data-hc-numbers]");
  if (!fs) return null;
  const anchor = fs.querySelector('[data-hc-suggest="region"]')?.closest(".op-field");
  const wrap = el("div", "hc-region");
  wrap.dataset.hcRegion = "";
  wrap.hidden = true;
  const label = el("label", "op-field__label", "Ваш регион");
  label.htmlFor = "hc-region";
  const hint = el("p", "op-field__hint", "Покажем номера рядом с вами. Регион запоминается на этом устройстве для всех инструментов");
  hint.id = "hc-region-hint";
  const select = el("select", "op-input");
  select.id = "hc-region";
  select.setAttribute("aria-describedby", hint.id);
  wrap.append(label, hint, select);
  if (anchor) anchor.before(wrap);
  else fs.querySelector("legend").after(wrap);
  const tpl = root.querySelector("[data-hc-numbers-link]");
  if (tpl) fs.append(tpl.content.cloneNode(true));
  return select;
}

async function main(canSave, focus) {
  const [regionsList, runs] = await Promise.all([dataset("region-view"), dataset("holiday-runs")]);
  const regions = new Map(regionsList.map((r) => [r.id, r]));
  const params = initCommon({ allowed: ["region"], validators: { region: (v) => regions.has(v) } });
  if (params.region) setRegion(params.region);
  const years = runs.length ? verifiedYears(runs) : (root.dataset.verifiedYears || "").split(",").filter(Boolean).map(Number);
  const recheckDays = Number(root.dataset.recheckDays) || 183;
  const lineDays = Number(root.dataset.lineDays) || 365;
  const verifyList = root.querySelector("[data-hc-verify]");
  const verifyEmpty = root.querySelector("[data-hc-verify-empty]");
  const validityBox = root.querySelector("[data-hc-validity]");
  const printState = root.querySelector("[data-hc-printstate]");
  const rxBox = root.querySelector("[data-hc-rx-status]");
  const select = buildRegion();
  let regionChoice = getRegion() || "";
  let lastNumbers = "";
  let changed = false;
  let sheet;

  const telIds = () => [...sheet.inputs].filter(([, i]) => i.getAttribute("type") === "tel").map(([id]) => id);
  const numbersKey = (s) => telIds().map((id) => `${id}=${s.values[id] || ""}`).join("|");

  const linksMode = regions.size > 0 && [...regions.values()].every((r) => !r.lines.length);

  function regionLines(role, fallback = true) {
    const region = regions.get(regionChoice);
    if (!region) return [];
    const own = region.lines.filter((l) => l.role === role);
    return own.length || !fallback ? own : region.lines.filter((l) => l.role === "general");
  }

  function suggestRegion(box) {
    const fid = box.dataset.hcFor;
    const lines = regionLines(box.dataset.hcSuggestId);
    box.replaceChildren();
    if (!regions.size) {
      box.append(el("p", "hc-empty", "Номера по регионам появятся, когда будет готов раздел «Куда звонить». Пока впишите номер сами, если знаете его"));
      return;
    }
    if (!regionChoice) {
      box.append(el("p", "hc-empty", "Выберите регион выше, и мы покажем номера рядом с вами"));
      return;
    }
    if (regionChoice !== "none" && linksMode) {
      const more = el("p", "hc-links");
      const a = el("a", "", "Номера вашего региона смотрите в справочнике «Куда звонить»");
      a.href = xurl("pal-directory", `regions/${regionChoice.toLowerCase()}/`);
      more.append(a);
      box.append(more);
      return;
    }
    if (regionChoice !== "none" && !lines.length) {
      box.append(el("p", "", "В таблице Росздравнадзора у вашего региона нет отдельной линии по этому вопросу. При угрозе жизни звоните 103 или 112"));
      const more = el("p", "hc-links");
      const a = el("a", "", "Другие номера региона: минздрав, ТФОМС, Росздравнадзор");
      a.href = xurl("pal-directory", `regions/${regionChoice.toLowerCase()}/`);
      more.append(a);
      box.append(more);
      return;
    }
    if (lines.length && lines.every((l) => l.role === "general")) {
      box.append(el("p", "", "Отдельной линии по этому вопросу у вашего региона в таблице Росздравнадзора нет. Ниже общая горячая линия минздрава региона: спросите там, куда обращаться"));
    }
    if (!lines.some((l) => l.printable)) {
      const p = el("p", "", regionChoice === "none" ? "Звоните на номера, которые работают по всей стране: 112 и 103" : "Проверенных номеров по вашему региону пока нет. На лист номер попадёт, только если вы позвоните и подтвердите, что он работает");
      box.append(p);
    }
    for (const line of lines) {
      const card = el("div", `hc-sugg ${line.printable ? "hc-sugg--ok" : "hc-sugg--unv"}`);
      if (!line.printable) card.append(status("unverified", "Номер взят из справочника и звонком не проверен"));
      const num = el("a", "hc-sugg__num", withExt(line));
      num.href = phoneHref(line.phone);
      const what = [line.label, line.is_24x7 ? "круглосуточно" : line.hours, line.other_org ? "номер другого учреждения" : ""].filter(Boolean).join(", ");
      card.append(num, el("p", "", what));
      if (line.printable) {
        card.append(el("p", "", `Проверено ${ru(line.verified_at)}. Номер будет на листе, если вы не впишете свой`));
      } else {
        card.append(el("p", "", `Источник: ${line.source_title || "справочник"}${line.source_date ? ` от ${ru(line.source_date)}` : ""}`));
        const b = el("button", "op-btn op-btn--secondary", "Я позвонил, номер работает: вписать");
        b.type = "button";
        b.addEventListener("click", () => sheet.setValue(fid, withExt(line), true));
        card.append(b);
      }
      box.append(card);
    }
  }

  function dataNumbers() {
    const data = {};
    for (const box of root.querySelectorAll('[data-hc-suggest="region"]')) {
      const line = regionLines(box.dataset.hcSuggestId, false).find((l) => l.printable);
      if (line) data[box.dataset.hcFor] = { number: withExt(line), verified_at: line.verified_at, src: `Из справочника «Куда звонить», проверено ${ru(line.verified_at)}` };
    }
    for (const card of root.querySelectorAll("[data-hc-data-for][data-number]")) {
      data[card.dataset.hcDataFor] = { number: card.dataset.number, verified_at: card.dataset.verifiedAt, src: card.dataset.src };
    }
    return data;
  }

  function renderVerify(s) {
    const keep = new Set([...verifyList.querySelectorAll("input:checked")].map((i) => i.value));
    verifyList.replaceChildren();
    let any = false;
    for (const id of telIds()) {
      const value = s.values[id];
      if (!value) continue;
      any = true;
      const li = el("li");
      const label = el("label");
      const box = el("input");
      box.type = "checkbox";
      box.value = `${id}=${value}`;
      box.checked = keep.has(box.value) || Boolean(s.checked_at);
      const text = el("span");
      text.append(el("span", "hc-verify__num", value), el("span", "hc-verify__label", sheet.inputs.get(id).labels[0]?.textContent.replace(" (обязательно)", "") || ""));
      label.append(box, text);
      li.append(label);
      verifyList.append(li);
    }
    verifyEmpty.hidden = any;
  }

  function renderHolidays(s, today) {
    const list = upcomingRuns(runs, today);
    for (const ul of document.querySelectorAll("[data-hc-holidays]")) {
      if (!runs.length) continue;
      ul.replaceChildren();
      for (const r of list) {
        if (r.verified) ul.append(el("li", "", `${ru(r.from)} - ${ru(r.to)}, ${r.days} ${plural(r.days, "день", "дня", "дней")}`));
        else ul.append(el("li", "hc-runs__unv", `Календарь на ${r.to.slice(0, 4)} год ещё не утверждён. Даты уточните ближе к праздникам`));
      }
      if (!list.length) ul.append(el("li", "hc-runs__none", "В ближайшие 4 месяца длинных выходных нет"));
    }
    rxBox.replaceChildren();
    const rx = s.values.next_rx;
    if (rx && inRun(rx, runs)) rxBox.append(status("deadline", "Дата рецепта приходится на нерабочие дни. Спросите врача заранее"));
    else if (rx && !years.includes(Number(rx.slice(0, 4)))) rxBox.append(status("info", `Календарь на ${rx.slice(0, 4)} год ещё не утверждён. Дата может сдвинуться на несколько дней`));
    rxBox.hidden = !rxBox.childElementCount;
  }

  function renderValidity(s, today) {
    const lineDates = Object.values(s.data).filter((d) => !s.values[d.id]).map((d) => d.verified_at);
    const until = validUntil({ checkedAt: s.checked_at, recheckDays, verifiedYears: years, lineDates, lineDays });
    const expired = isExpired(until, today);
    document.body.classList.toggle("hc-expired", expired);
    for (const n of document.querySelectorAll("[data-hc-checked]")) n.textContent = s.checked_at ? ru(s.checked_at) : "";
    for (const n of document.querySelectorAll("[data-hc-until]")) n.textContent = until ? ru(until) : "";
    for (const n of document.querySelectorAll("[data-hc-void-date]")) n.textContent = until ? ru(addDays(until, 1)) : "";
    for (const b of root.querySelectorAll("[data-hc-print-btn]")) b.hidden = expired;
    for (const b of root.querySelectorAll("[data-hc-renew]")) b.hidden = !expired;
    validityBox.replaceChildren();
    printState.replaceChildren();
    if (!s.checked_at) {
      const back = el("button", "op-btn op-btn--link", "Вернуться к проверке номеров");
      back.type = "button";
      back.addEventListener("click", () => sheet.go("check"));
      printState.append(status("deadline", "Номера не отмечены как проверенные, поэтому срока годности на листе не будет. Строки «Проверено» и «Данные верны до» останутся пустыми для ручки. ", back));
      return;
    }
    if (expired) {
      const text = `Срок годности листа истёк ${ru(until)}. Обновите страницу и проверьте номера, потом распечатайте заново`;
      validityBox.append(status("deadline", text));
      printState.append(status("deadline", text));
      return;
    }
    const msg = status("done", `Номера проверены ${ru(s.checked_at)}. Данные верны до ${ru(until)}`);
    const capped = until === `${until.slice(0, 4)}-12-31` && addDays(s.checked_at, recheckDays) > until;
    if (capped) msg.querySelector("p").append(`. Дальше срок не продлевается: календарь на ${Number(until.slice(0, 4)) + 1} год ещё не утверждён`);
    validityBox.append(msg);
    printState.append(msg.cloneNode(true));
  }

  function beforeRender(s) {
    const data = dataNumbers();
    for (const [id, d] of Object.entries(data)) d.id = id;
    s.data = Object.fromEntries(Object.entries(data).filter(([id]) => !s.values[id]));
    if (!sheet) return;
    const key = numbersKey(s);
    if (s.checked_at && lastNumbers && key !== lastNumbers) {
      s.checked_at = null;
      changed = true;
    }
    lastNumbers = key;
  }

  function onChange(s) {
    if (!sheet) return;
    const today = sheet.today();
    if (root.dataset.step === "check") renderVerify(s);
    renderHolidays(s, today);
    renderValidity(s, today);
    if (changed) {
      validityBox.replaceChildren(status("info", "Номер изменился. Проверьте номера ещё раз"));
      changed = false;
    }
  }

  sheet = createSheet(root, { canSave, groups: true, noFuture: ["vk_date"], beforeRender, onChange });
  describeMode(root.querySelector("[data-hc-savemode]"), canSave, {
    demo: isDemo(),
    onToggle: async (next) => {
      if (next) {
        sheet.state.canSave = true;
        await sheet.saveNow();
      } else {
        await sheet.forget();
      }
    },
  });

  function renderSuggest() {
    for (const box of root.querySelectorAll('[data-hc-suggest="region"]')) suggestRegion(box);
    const link = root.querySelector("[data-hc-region-link]");
    if (link && regions.has(regionChoice)) {
      link.href = xurl("pal-directory", `regions/${regionChoice.toLowerCase()}/`);
      link.textContent = `Откуда номера: ${regions.get(regionChoice).name}`;
    }
  }

  if (select && regions.size) {
    select.closest("[data-hc-region]").hidden = false;
    const opt = (value, text) => { const o = el("option", "", text); o.value = value; return o; };
    select.append(opt("", "Выберите регион"), ...regionsList.map((r) => opt(r.id, r.name)).sort((a, b) => a.text.localeCompare(b.text, "ru")), opt("none", "Моего региона нет в списке"));
    select.value = regions.has(regionChoice) ? regionChoice : "";
    select.addEventListener("change", () => {
      regionChoice = select.value;
      if (regions.has(regionChoice)) setRegion(regionChoice);
      renderSuggest();
      sheet.render();
    });
  }
  renderSuggest();

  root.querySelector("[data-hc-checked-btn]")?.addEventListener("click", () => {
    const boxes = [...verifyList.querySelectorAll("input")];
    const missing = boxes.filter((b) => !b.checked);
    if (missing.length) {
      validityBox.replaceChildren(status("error", "Отметьте каждый номер, который проверили. Если номер не работает, исправьте его на первом шаге"));
      missing[0].focus();
      return;
    }
    sheet.state.checked_at = sheet.today();
    lastNumbers = numbersKey(sheet.state);
    sheet.render();
    sheet.saveNow();
  });
  for (const b of root.querySelectorAll("[data-hc-renew]")) {
    b.addEventListener("click", () => {
      sheet.state.checked_at = null;
      sheet.go("check");
      sheet.render();
      sheet.save();
    });
  }
  for (const b of root.querySelectorAll('[data-hc-goto="check"], [data-hc-next]')) {
    b.addEventListener("click", () => renderVerify(sheet.state));
  }

  addEventListener("hashchange", () => {
    const p = readParams(["region"], { region: (v) => regions.has(v) });
    if (!p.region || !select) return;
    setRegion(p.region);
    regionChoice = p.region;
    select.value = p.region;
    renderSuggest();
    sheet.render();
  });

  await sheet.start(location.hash === "#folder" ? "check" : undefined);
  lastNumbers = numbersKey(sheet.state);
  renderVerify(sheet.state);
  sheet.render();
  if (location.hash === "#folder") document.getElementById("folder")?.scrollIntoView();
  if (focus) root.querySelector("#hc-step-fill-t")?.focus();
}

if (root) {
  let started = false;
  root.querySelector("[data-hc-ask] [data-hc-blank]")?.addEventListener("click", () => { if (!started) printWith("hc-blank"); });
  askDevice(root, {
    demo: isDemo(),
    onAnswer: (save, focus) => {
      started = true;
      main(save, focus);
    },
  });
}
