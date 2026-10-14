import React, { useEffect, useState } from "react";
import { api } from "./api.js";

const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

export default function Dashboard({ tenant }) {
  const [data, setData] = useState(null);
  const [trail, setTrail] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const tick = () => api.summary().then((d) => { setData(d); setError(""); }).catch((e) => setError(e.message));
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [tenant]);

  if (error) return <p className="hint pad">Can't load analytics: {error}. Run a workflow from the Editor tab first.</p>;
  if (!data) return <p className="hint pad">Loading…</p>;
  const max = Math.max(1, ...data.steps.map((s) => s.avg_ms));
  const t = data.totals;

  return (
    <div className="dash">
      <section className="totals">
        <div><b>{t.started}</b> runs started</div>
        <div><b>{t.completed}</b> completed</div>
        <div><b className={t.failed ? "bad" : ""}>{t.failed}</b> failed</div>
        <div><b>{data.backlog.reduce((a, b) => a + b.waiting, 0)}</b> waiting on approval</div>
      </section>

      <section>
        <h2>Where time goes</h2>
        <p className="hint">Average duration per step. The longest bar is your current bottleneck.</p>
        {data.steps.length === 0 && <p className="hint">No completed steps yet.</p>}
        {data.steps.map((s) => (
          <div className="bar" key={s.step}>
            <span>{s.step}</span>
            <div><i style={{ width: `${(s.avg_ms / max) * 100}%` }} /></div>
            <span>{fmt(s.avg_ms)} avg, {fmt(s.p95_ms)} p95</span>
          </div>
        ))}
      </section>

      <section>
        <h2>Approval backlog</h2>
        {data.backlog.length === 0 ? <p className="hint">Nothing is waiting for approval.</p> :
          data.backlog.map((b) => <div className="bar" key={b.step}><span>{b.step}</span><div><i className="warn" style={{ width: `${Math.min(100, b.waiting * 20)}%` }} /></div><span>{b.waiting} waiting</span></div>)}
      </section>

      <section>
        <h2>Recent runs</h2>
        <table>
          <thead><tr><th>Run</th><th>Workflow</th><th>Status</th><th>Started</th></tr></thead>
          <tbody>
            {data.runs.map((r) => (
              <tr key={r.run_id} onClick={() => api.replay(r.run_id).then((e) => setTrail({ id: r.run_id, events: e }))} tabIndex={0}>
                <td>{r.run_id}</td><td>{r.wf}</td><td className={r.status}>{r.status}</td>
                <td>{new Date(r.started + "Z").toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {trail && (
        <section>
          <h2>Audit trail for run {trail.id}</h2>
          <p className="hint">Every decision in order. This is how a run is replayed and explained.</p>
          <ol className="trail">
            {trail.events.map((e, i) => (
              <li key={i} className={e.event_type}>
                <b>{e.step || "run"}</b> {e.event_type.replace("_", " ")}
                {e.attempt > 0 && ` (attempt ${e.attempt + 1})`}
                {e.detail && <span> - {e.detail}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
