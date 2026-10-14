import React, { useCallback, useEffect, useState } from "react";
import ReactFlow, { addEdge, Background, Controls, Handle, Position, useEdgesState, useNodesState } from "reactflow";
import { api } from "./api.js";
import { toDefinition, toGraph } from "./convert.js";

function StepNode({ id, data, selected }) {
  return (
    <div className={`node ${data.type} ${selected ? "sel" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <b>{id}</b>
      <span>{data.type === "approval" ? `approver: ${data.approver || "-"}` : data.type === "task" ? data.action || "task" : "routes by condition"}</span>
      {data.isStart && <em>start</em>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { step: StepNode };

export default function Editor({ tenant }) {
  const [names, setNames] = useState([]);
  const [name, setName] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState("");
  const [amount, setAmount] = useState(5000);

  const load = useCallback(async (n) => {
    const { definition } = await api.get(n);
    const g = toGraph(definition);
    setNodes(g.nodes); setEdges(g.edges); setSel(null); setName(n);
  }, [setNodes, setEdges]);

  useEffect(() => {
    api.list().then((l) => { setNames(l); if (l[0]) load(l[0]); });
  }, [tenant, load]);

  const onConnect = (c) => {
    const src = nodes.find((n) => n.id === c.source);
    let label = "";
    if (src?.data.type === "condition") label = window.prompt("Condition (e.g. amount > 10000), or 'default'", "default") || "default";
    setEdges((e) => addEdge({ ...c, label }, e));
  };

  const addNode = (type) => {
    const id = window.prompt("Step name (letters, numbers, _)")?.trim();
    if (!id || nodes.some((n) => n.id === id)) return;
    setNodes((ns) => [...ns, { id, type: "step", position: { x: 40, y: 40 + ns.length * 20 },
      data: { type, ...(type === "approval" ? { approver: "manager" } : type === "task" ? { action: "do_work" } : {}) } }]);
  };

  const patch = (k, v) => setNodes((ns) => ns.map((n) => (n.id === sel ? { ...n, data: { ...n.data, [k]: v } } : n)));
  const makeStart = () => setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, isStart: n.id === sel } })));
  const selected = nodes.find((n) => n.id === sel);

  const save = async () => {
    try { await api.save(name, toDefinition(name, nodes, edges)); setMsg("Saved"); }
    catch (e) { setMsg(e.message); }
  };
  const run = async () => {
    try { const r = await api.run(name, { amount: Number(amount) }, 1); setMsg(`Started run ${r.run_id}. Watch it on the Live dashboard.`); }
    catch (e) { setMsg(e.message); }
  };

  return (
    <div className="editor">
      <aside>
        <label>Workflow
          <select value={name} onChange={(e) => load(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <div className="row">
          <button onClick={() => addNode("task")}>Add task</button>
          <button onClick={() => addNode("approval")}>Add approval</button>
          <button onClick={() => addNode("condition")}>Add condition</button>
        </div>
        {selected ? (
          <div className="panel">
            <h3>{selected.id}</h3>
            {selected.data.type === "task" && <>
              <label>Action<input value={selected.data.action || ""} onChange={(e) => patch("action", e.target.value)} /></label>
              <label>Retries<input type="number" min="0" value={selected.data.retries || 0} onChange={(e) => patch("retries", +e.target.value)} /></label>
              <label>Failure rate (0-1)<input type="number" step="0.05" min="0" max="1" value={selected.data.fail_rate || 0} onChange={(e) => patch("fail_rate", +e.target.value)} /></label>
            </>}
            {selected.data.type === "approval" && <>
              <label>Approver role<input value={selected.data.approver || ""} onChange={(e) => patch("approver", e.target.value)} /></label>
              <label>Rejection rate (0-1)<input type="number" step="0.05" min="0" max="1" value={selected.data.reject_rate || 0} onChange={(e) => patch("reject_rate", +e.target.value)} /></label>
            </>}
            <button onClick={makeStart}>Set as start step</button>
            <button className="danger" onClick={() => { setNodes((n) => n.filter((x) => x.id !== sel)); setEdges((e) => e.filter((x) => x.source !== sel && x.target !== sel)); setSel(null); }}>Delete step</button>
          </div>
        ) : <p className="hint">Select a step to edit it. Drag from a step's bottom dot to another step to connect them. Select a connection and press Backspace to remove it.</p>}
        <div className="panel">
          <label>Invoice amount for test run<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <div className="row"><button className="primary" onClick={save}>Save workflow</button><button onClick={run}>Run workflow</button></div>
          {msg && <p className="hint" role="status">{msg}</p>}
        </div>
      </aside>
      <div className="canvas">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, n) => setSel(n.id)}
          onPaneClick={() => setSel(null)} fitView>
          <Background gap={20} color="#c9d3d9" /><Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
