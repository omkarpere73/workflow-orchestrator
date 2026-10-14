import React, { useState } from "react";
import Editor from "./Editor.jsx";
import Dashboard from "./Dashboard.jsx";
import { setTenant } from "./api.js";

export default function App() {
  const [tab, setTab] = useState("editor");
  const [tenant, setT] = useState("tenant-a");
  const change = (t) => { setTenant(t); setT(t); };
  return (
    <>
      <header>
        <h1>Workflow Orchestrator</h1>
        <nav>
          <button className={tab === "editor" ? "on" : ""} onClick={() => setTab("editor")}>Editor</button>
          <button className={tab === "dash" ? "on" : ""} onClick={() => setTab("dash")}>Live dashboard</button>
        </nav>
        <label className="tenant">Tenant
          <select value={tenant} onChange={(e) => change(e.target.value)}>
            <option>tenant-a</option><option>tenant-b</option>
          </select>
        </label>
      </header>
      <main key={tenant}>{tab === "editor" ? <Editor tenant={tenant} /> : <Dashboard tenant={tenant} />}</main>
    </>
  );
}
