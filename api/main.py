import os, re, shutil, threading
from pathlib import Path
import yaml
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel
from engine.engine import WorkflowEngine, validate
from pipeline.bus import emit
from pipeline.db import client

app = FastAPI(title="Workflow Orchestrator")
WF_DIR = Path(os.getenv("WORKFLOW_DIR", "./.data/workflows"))
EXAMPLES = Path(os.getenv("EXAMPLES_DIR", "./workflows"))
SAFE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_ch, _lock = None, threading.Lock()


def ch():
    global _ch
    with _lock:
        if _ch is None:
            _ch = client()
        return _ch


def tenant_dir(tenant: str) -> Path:
    if not SAFE.match(tenant):
        raise HTTPException(400, "invalid tenant id")
    d = WF_DIR / tenant
    if not d.exists():  # seed each tenant with the example workflows
        d.mkdir(parents=True)
        for f in EXAMPLES.glob("*.yaml"):
            shutil.copy(f, d / f.name)
    return d


def load(tenant: str, name: str) -> dict:
    if not SAFE.match(name):
        raise HTTPException(400, "invalid workflow name")
    p = tenant_dir(tenant) / f"{name}.yaml"
    if not p.exists():
        raise HTTPException(404, "workflow not found")
    return yaml.safe_load(p.read_text())


class Definition(BaseModel):
    definition: dict


class RunRequest(BaseModel):
    context: dict = {}
    speed: float = 1.0


@app.get("/api/workflows")
def list_workflows(x_tenant_id: str = Header("tenant-a")):
    return sorted(p.stem for p in tenant_dir(x_tenant_id).glob("*.yaml"))


@app.get("/api/workflows/{name}")
def get_workflow(name: str, x_tenant_id: str = Header("tenant-a")):
    return {"definition": load(x_tenant_id, name)}


@app.put("/api/workflows/{name}")
def save_workflow(name: str, body: Definition, x_tenant_id: str = Header("tenant-a")):
    if not SAFE.match(name):
        raise HTTPException(400, "invalid workflow name")
    body.definition["name"] = name
    try:
        validate(body.definition)
    except ValueError as e:
        raise HTTPException(422, str(e))
    (tenant_dir(x_tenant_id) / f"{name}.yaml").write_text(
        yaml.safe_dump(body.definition, sort_keys=False))
    return {"saved": name}


@app.post("/api/workflows/{name}/run")
def run_workflow(name: str, body: RunRequest, tasks: BackgroundTasks,
                 x_tenant_id: str = Header("tenant-a")):
    engine = WorkflowEngine(load(x_tenant_id, name), x_tenant_id, emit, body.speed)
    import uuid
    run_id = uuid.uuid4().hex[:12]
    tasks.add_task(engine.run, body.context, run_id)
    return {"run_id": run_id}


@app.get("/api/analytics/summary")
def summary(x_tenant_id: str = Header("tenant-a")):
    p = {"t": x_tenant_id}
    steps = ch().query(
        """SELECT step, count() runs, round(avg(duration_ms)) avg_ms,
                  round(quantile(0.95)(duration_ms)) p95_ms
           FROM events WHERE tenant_id=%(t)s AND event_type='step_completed'
             AND step_type!='condition' GROUP BY step ORDER BY avg_ms DESC""", p)
    backlog = ch().query(
        """SELECT step, count() waiting FROM (
             SELECT run_id, step, countIf(event_type='step_started') s,
                    countIf(event_type IN ('step_completed','step_failed')) c
             FROM events WHERE tenant_id=%(t)s AND step_type='approval'
             GROUP BY run_id, step HAVING s > c) GROUP BY step""", p)
    status = ch().query(
        """SELECT countIf(event_type='run_started') started,
                  countIf(event_type='run_completed') completed,
                  countIf(event_type='run_failed') failed
           FROM events WHERE tenant_id=%(t)s""", p)
    runs = ch().query(
        """SELECT run_id, any(workflow) wf, min(ts) started,
                  multiIf(countIf(event_type='run_failed')>0,'failed',
                          countIf(event_type='run_completed')>0,'completed','running') status
           FROM events WHERE tenant_id=%(t)s GROUP BY run_id
           ORDER BY started DESC LIMIT 12""", p)
    s = status.named_results().__next__()
    return {"steps": list(steps.named_results()), "backlog": list(backlog.named_results()),
            "totals": s, "runs": [{**r, "started": r["started"].isoformat()} for r in runs.named_results()]}


@app.get("/api/runs/{run_id}/events")
def replay(run_id: str, x_tenant_id: str = Header("tenant-a")):
    """Audit trail: every decision of a run, in order, scoped to the caller's tenant."""
    rows = ch().query(
        """SELECT ts, step, step_type, event_type, duration_ms, attempt, detail
           FROM events WHERE tenant_id=%(t)s AND run_id=%(r)s ORDER BY ts""",
        {"t": x_tenant_id, "r": run_id})
    return [{**r, "ts": r["ts"].isoformat()} for r in rows.named_results()]
