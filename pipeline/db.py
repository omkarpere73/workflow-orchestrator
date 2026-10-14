import os, time
import clickhouse_connect

SCHEMA = """CREATE TABLE IF NOT EXISTS events (
  tenant_id LowCardinality(String), run_id String, workflow LowCardinality(String),
  step String, step_type LowCardinality(String), event_type LowCardinality(String),
  ts DateTime64(3, 'UTC'), duration_ms UInt32, attempt UInt8, detail String
) ENGINE = MergeTree ORDER BY (tenant_id, run_id, ts)"""


def client(retries: int = 30):
    for i in range(retries):
        try:
            c = clickhouse_connect.get_client(host=os.getenv("CLICKHOUSE_HOST", "localhost"), port=8123)
            c.command(SCHEMA)
            return c
        except Exception:
            time.sleep(2)
    raise RuntimeError("ClickHouse not reachable")
