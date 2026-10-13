import { initCommon, bindPrint } from "./hc-common.js";

const root = document.querySelector("hc-branch");

function fork() {
  const sections = [...root.querySelectorAll("[data-hc-branch]")];
  const apply = (value) => {
    for (const s of sections) {
      const b = s.dataset.hcBranch;
      s.hidden = b !== "all" && value !== "unknown" && value !== "" && b !== value;
    }
  };
  for (const r of root.querySelectorAll('input[name="hc-fork"]')) r.addEventListener("change", () => apply(r.value));
  apply("");
}

function groups() {
  const blocks = [...root.querySelectorAll("[data-hc-group]")];
  const apply = (value) => {
    for (const b of blocks) {
      b.hidden = Boolean(value) && b.dataset.hcGroup !== value;
      if (b.tagName === "DETAILS" && b.dataset.hcGroup === value) b.open = true;
    }
    const other = root.querySelector('[data-hc-group="other"]');
    if (other) other.hidden = value !== "other";
  };
  for (const r of root.querySelectorAll('input[name="hc-group"]')) r.addEventListener("change", () => apply(r.value));
  apply("");
}

if (root) {
  initCommon();
  if (root.dataset.mode === "branch") fork();
  else groups();
  bindPrint(root);
}
