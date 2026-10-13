import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { walk, allPaths } from "../../lib/tree.js";

const sheets = JSON.parse(readFileSync(new URL("../fixtures/sheets.json", import.meta.url), "utf8"));
const tree = sheets.items.find((s) => s.id === "ahead").tree;
const always = tree.outcomes.filter((o) => o.always).map((o) => o.id);

test("на каждом пути есть исходы, вопросы кончаются, always всегда в результате", () => {
  const paths = allPaths(tree);
  assert.ok(paths.length >= 3);
  for (const answers of paths) {
    const r = walk(tree, answers);
    assert.equal(r.next, null, JSON.stringify(answers));
    assert.ok(r.outcomes.length > 0);
    for (const id of always) assert.ok(r.outcomes.includes(id));
  }
});

test("без ответов следующий вопрос стартовый", () => {
  const r = walk(tree, {});
  assert.equal(r.next, tree.start);
  assert.deepEqual(r.outcomes, always);
});

test("«Нет» на первом вопросе: суд и опека и доверенность прекращается", () => {
  const first = tree.questions.find((q) => q.id === tree.start);
  const no = first.options.find((o) => o.value === "no");
  const r = walk(tree, { [tree.start]: no.value });
  assert.equal(r.next, null);
  for (const id of no.outcomes) assert.ok(r.outcomes.includes(id));
});
