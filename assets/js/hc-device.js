import { el } from "./hc-common.js";

const KEY = "hc:device-save";
const OLD = "hc:emergency-save";

export function deviceAnswer() {
  try {
    const v = localStorage.getItem(KEY) ?? localStorage.getItem(OLD);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
}

export function setDeviceAnswer(value) {
  try {
    localStorage.setItem(KEY, value);
    localStorage.removeItem(OLD);
  } catch {}
}

export function askDevice(root, { demo, onAnswer }) {
  const ask = root.querySelector("[data-hc-ask]");
  const wizard = root.querySelector("[data-hc-wizard]");
  const answer = demo ? "no" : deviceAnswer();
  if (answer || !ask) {
    onAnswer(answer === "yes", false);
    return;
  }
  ask.hidden = false;
  wizard.hidden = true;
  root.dataset.asking = "";
  for (const b of ask.querySelectorAll("[data-hc-ask-answer]")) {
    b.addEventListener("click", () => {
      const yes = b.dataset.hcAskAnswer === "yes";
      setDeviceAnswer(yes ? "yes" : "no");
      ask.hidden = true;
      wizard.hidden = false;
      delete root.dataset.asking;
      onAnswer(yes, true);
    });
  }
}

export function describeMode(line, save, { demo, onToggle }) {
  if (!line) return;
  line.hidden = demo;
  line.replaceChildren(save ? "Лист сохраняется на этом устройстве. " : "Лист не сохраняется: после закрытия вкладки он пропадёт. ");
  const b = el("button", "op-btn op-btn--link", save ? "Не сохранять здесь" : "Сохранять здесь");
  b.type = "button";
  b.addEventListener("click", async () => {
    setDeviceAnswer(save ? "no" : "yes");
    await onToggle(!save);
    describeMode(line, !save, { demo, onToggle });
  });
  line.append(b);
}
