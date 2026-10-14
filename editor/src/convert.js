// Converts between the YAML definition (as JSON) and React Flow nodes/edges.
const X = 260, Y = 130;

export function toGraph(defn) {
  const names = Object.keys(defn.steps);
  const depth = { [defn.start]: 0 };
  const queue = [defn.start];
  const edges = [];
  while (queue.length) {
    const n = queue.shift(), s = defn.steps[n];
    const out = [];
    if (s.next) out.push([s.next, ""]);
    if (s.on_reject) out.push([s.on_reject, "on_reject"]);
    (s.branches || []).forEach((b) => out.push([b.next, b.when]));
    if (s.default) out.push([s.default, "default"]);
    out.forEach(([t, label]) => {
      edges.push({ id: `${n}->${t}:${label}`, source: n, target: t, label, animated: label === "on_reject" });
      if (!(t in depth)) { depth[t] = depth[n] + 1; queue.push(t); }
    });
  }
  const rows = {};
  const nodes = names.map((n) => {
    const d = depth[n] ?? 0;
    rows[d] = (rows[d] || 0) + 1;
    const { next, on_reject, branches, default: dflt, ...props } = defn.steps[n];
    return { id: n, type: "step", position: { x: (rows[d] - 1) * X, y: d * Y }, data: { ...props, isStart: n === defn.start } };
  });
  return { nodes, edges };
}

export function toDefinition(name, nodes, edges) {
  const steps = {};
  nodes.forEach((n) => {
    const { isStart, ...props } = n.data;
    steps[n.id] = { ...props };
  });
  edges.forEach((e) => {
    const s = steps[e.source];
    if (!s) return;
    const label = (e.label || "").trim();
    if (s.type === "condition") {
      if (label === "default" || !label) s.default = e.target;
      else (s.branches ||= []).push({ when: label, next: e.target });
    } else if (label === "on_reject") s.on_reject = e.target;
    else s.next = e.target;
  });
  const start = nodes.find((n) => n.data.isStart)?.id || nodes[0]?.id;
  return { name, start, steps };
}
