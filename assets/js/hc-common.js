import { readParams } from "../../ui/js/xparams.js";

const STATUS = {
  done: ["circle-check", "Готово"],
  deadline: ["clock", "Срок"],
  error: ["triangle-alert", "Ошибка"],
  info: ["info", "Важно"],
  unverified: ["circle-help", "Не проверено"],
};

export function status(kind, ...parts) {
  const [icon, word] = STATUS[kind];
  const box = document.createElement("div");
  box.className = `op-status op-status--${kind}`;
  const tpl = document.getElementById(`op-icon-${icon}`);
  if (tpl) box.append(tpl.content.cloneNode(true));
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.className = "op-status__word";
  strong.textContent = `${word}.`;
  p.append(strong, " ", ...parts);
  box.append(p);
  return box;
}

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initCommon({ allowed = [], validators = {} } = {}) {
  const backs = [...document.querySelectorAll("[data-back]")];
  const ids = new Set(backs.map((a) => a.dataset.back));
  const params = readParams(["back", ...allowed], { back: (v) => ids.has(v), ...validators });
  if (params.back) {
    const link = backs.find((a) => a.dataset.back === params.back);
    link.hidden = false;
    link.parentElement.hidden = false;
  }
  const offline = document.querySelector("[data-hc-offline]");
  if (offline) {
    const sync = () => { offline.hidden = navigator.onLine !== false; };
    addEventListener("online", sync);
    addEventListener("offline", sync);
    sync();
  }
  return params;
}

export function printWith(cls) {
  if (cls) document.body.classList.add(cls);
  const done = () => { if (cls) document.body.classList.remove(cls); };
  addEventListener("afterprint", done, { once: true });
  window.print();
  setTimeout(done, 1000);
}

export function bindPrint(root = document) {
  for (const b of root.querySelectorAll("[data-hc-print-btn]")) b.addEventListener("click", () => printWith());
}
