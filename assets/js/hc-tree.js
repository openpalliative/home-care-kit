import { initCommon, bindPrint, el } from "./hc-common.js";
import { walk } from "../../lib/tree.js";

const root = document.querySelector("hc-tree");

function readTree() {
  const questions = [...root.querySelectorAll("[data-hc-q]")].map((fs) => ({
    id: fs.dataset.hcQ,
    text: fs.querySelector("legend").textContent.trim(),
    options: [...fs.querySelectorAll("[data-hc-answer]")].map((b) => ({
      value: b.dataset.hcAnswer,
      label: b.textContent.trim(),
      next: b.dataset.next || undefined,
      outcomes: (b.dataset.outcomes || "").split(" ").filter(Boolean),
    })),
  }));
  const outcomes = [...root.querySelectorAll("[data-hc-outcome]")].map((li) => ({ id: li.dataset.hcOutcome, always: li.hasAttribute("data-always") }));
  return { start: root.dataset.start, questions, outcomes };
}

function main() {
  initCommon();
  bindPrint(root);
  const tree = readTree();
  const sets = new Map([...root.querySelectorAll("[data-hc-q]")].map((fs) => [fs.dataset.hcQ, fs]));
  const items = [...root.querySelectorAll("[data-hc-outcome]")];
  const count = root.querySelector("[data-hc-qcount]");
  const answersBox = root.querySelector("[data-hc-answers]");
  const answerList = root.querySelector("[data-hc-answer-list]");
  const lead = root.querySelector("[data-hc-result-lead]");
  const leadText = lead.textContent;
  let answers = {};

  function render(focusId) {
    const r = walk(tree, answers);
    for (const [id, fs] of sets) fs.hidden = id !== r.next;
    count.hidden = !r.next;
    count.textContent = r.next ? `Вопрос ${r.path.length + 1}` : "";
    answerList.replaceChildren();
    for (const qid of r.path) {
      const q = tree.questions.find((x) => x.id === qid);
      const o = q.options.find((x) => x.value === answers[qid]);
      const li = el("li");
      const change = el("button", "op-btn op-btn--link", "изменить");
      change.type = "button";
      change.addEventListener("click", () => {
        const keep = {};
        for (const id of r.path) {
          if (id === qid) break;
          keep[id] = answers[id];
        }
        answers = keep;
        render(qid);
      });
      li.append(`${q.text} `, el("strong", "", o.label), " · ", change);
      answerList.append(li);
    }
    answersBox.hidden = !r.path.length;
    const done = !r.next;
    for (const li of items) li.hidden = done && !r.outcomes.includes(li.dataset.hcOutcome);
    lead.textContent = done ? "По вашим ответам. Распечатайте и отмечайте ручкой, что уже сделано" : leadText;
    if (focusId && sets.get(focusId)) sets.get(focusId).querySelector("button")?.focus();
    else if (done && focusId !== false) root.querySelector("#hc-result-title")?.focus();
  }

  for (const [qid, fs] of sets) {
    for (const b of fs.querySelectorAll("[data-hc-answer]")) {
      b.addEventListener("click", () => {
        answers[qid] = b.dataset.hcAnswer;
        const r = walk(tree, answers);
        render(r.next || undefined);
      });
    }
  }
  root.querySelector("[data-hc-restart]")?.addEventListener("click", () => {
    answers = {};
    render(tree.start);
  });
  render(false);
}

if (root) main();
