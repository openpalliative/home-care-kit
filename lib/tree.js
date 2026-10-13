export function walk(tree, answers = {}) {
  const questions = new Map(tree.questions.map((q) => [q.id, q]));
  const outcomes = [];
  const add = (id) => { if (!outcomes.includes(id)) outcomes.push(id); };
  const path = [];
  let id = tree.start;
  let next = null;
  const seen = new Set();
  while (id && questions.has(id) && !seen.has(id)) {
    seen.add(id);
    const q = questions.get(id);
    const option = q.options.find((o) => o.value === answers[id]);
    if (!option) {
      next = id;
      break;
    }
    path.push(id);
    for (const o of option.outcomes || []) add(o);
    id = option.next || null;
  }
  for (const o of tree.outcomes) if (o.always) add(o.id);
  return { next, outcomes, path };
}

export function allPaths(tree) {
  const questions = new Map(tree.questions.map((q) => [q.id, q]));
  const out = [];
  const go = (id, answers) => {
    const q = questions.get(id);
    for (const o of q.options) {
      const a = { ...answers, [id]: o.value };
      if (o.next && questions.has(o.next)) go(o.next, a);
      else out.push(a);
    }
  };
  go(tree.start, {});
  return out;
}
