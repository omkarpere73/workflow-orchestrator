# Visual Workflow Orchestrator

Design multi-step approval chains in a drag-and-drop editor, run them on a generic engine, and watch bottlenecks and approval backlogs update live. No business logic is hardcoded: the editor saves YAML, and the engine just executes it.

```
React Flow editor ──save──▶ FastAPI ──YAML per tenant──▶ Python engine
                                                            │ every state change
                                                            ▼
                         React dashboard ◀── FastAPI ◀── ClickHouse ◀── Kafka
```

## Quick start

```bash
docker compose up --build
```

- Editor and dashboard: http://localhost:3000
- API docs: http://localhost:8000/docs

1. Open the **Editor**, pick `invoice_approval`, and click **Run workflow** a few times (try amounts above and below 10000 to see the routing change).
2. Open **Live dashboard** to see step durations, the approval backlog and recent runs.
3. Click a run to see its **audit trail**, the ordered list of every decision.
4. Switch **Tenant** to `tenant-b`: workflows, runs and analytics are fully separate.

## How it works

| Piece | Where | What it does |
|---|---|---|
| Workflow definitions | `workflows/*.yaml` | Steps of type `task`, `approval` and `condition`, with retries, failure rates and routing. |
| Engine | `engine/engine.py` | Validates and executes any definition, retries failed tasks with backoff, and emits a Kafka event for each state change. |
| Event pipeline | `pipeline/` | Kafka producer, plus a consumer that batches events into ClickHouse (at-least-once). |
| API | `api/main.py` | Save and load workflows, trigger runs, query analytics, replay a run. |
| UI | `editor/` | React Flow editor and a polling dashboard. |

## Design decisions

- **Events are the source of truth.** Analytics and run replay are both just queries over one ClickHouse `events` table, so the audit trail can never disagree with the dashboard.
- **Tenant isolation.** The tenant ID is part of every event, every workflow path and every query's `WHERE` clause. The ClickHouse sort key starts with `tenant_id`.
- **Safe routing conditions.** Conditions such as `amount > 10000` use a small parser instead of `eval`.
- **Simulated work.** Tasks and approvals sleep and fail at configurable rates, so the demo needs no external systems. Replace `_execute` handlers with real integrations when you need them.

## Run without Docker (development)

```bash
docker compose up kafka clickhouse        # infrastructure only
pip install -r api/requirements.txt
export KAFKA_BOOTSTRAP=localhost:9092 CLICKHOUSE_HOST=localhost
uvicorn api.main:app --reload &
python -m pipeline.consumer &
cd editor && npm install && npm run dev
```
(For this mode, add `ports: ["9092:9092"]` to Kafka and set `KAFKA_ADVERTISED_LISTENERS` to `localhost:9092`, and expose ClickHouse port 8123.)

## Ideas to extend

Role-based access control on approvals, a real approval inbox, a replay UI that animates the run on the graph, and a scheduler for timed escalations.
