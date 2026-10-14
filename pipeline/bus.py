import json, os, time
from confluent_kafka import Producer

TOPIC = "workflow-events"
_producer = None


def producer() -> Producer:
    global _producer
    if _producer is None:
        _producer = Producer({"bootstrap.servers": os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")})
    return _producer


def emit(event: dict) -> None:
    p = producer()
    p.produce(TOPIC, key=event["run_id"], value=json.dumps(event))
    p.poll(0)
    if event["event_type"] in ("run_completed", "run_failed"):
        p.flush(5)
