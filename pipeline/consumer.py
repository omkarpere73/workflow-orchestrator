"""Kafka -> ClickHouse. Batches events and inserts them with at-least-once delivery."""
import json, os, time
from datetime import datetime, timezone
from confluent_kafka import Consumer
from pipeline.bus import TOPIC
from pipeline.db import client

COLS = ["tenant_id", "run_id", "workflow", "step", "step_type", "event_type",
        "ts", "duration_ms", "attempt", "detail"]


def main():
    ch = client()
    c = Consumer({"bootstrap.servers": os.getenv("KAFKA_BOOTSTRAP", "localhost:9092"),
                  "group.id": "clickhouse-sink", "auto.offset.reset": "earliest",
                  "enable.auto.commit": False})
    c.subscribe([TOPIC])
    batch, last = [], time.time()
    print("consumer ready", flush=True)
    while True:
        msg = c.poll(0.5)
        if msg is not None and not msg.error():
            e = json.loads(msg.value())
            e["ts"] = datetime.fromtimestamp(e["ts"] / 1000, tz=timezone.utc)
            batch.append([e[k] for k in COLS])
        if batch and (len(batch) >= 100 or time.time() - last > 1):
            ch.insert("events", batch, column_names=COLS)
            c.commit(asynchronous=False)
            batch, last = [], time.time()


if __name__ == "__main__":
    main()
