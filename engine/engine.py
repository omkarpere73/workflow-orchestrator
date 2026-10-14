"""Generic workflow engine. All business logic lives in the YAML definition."""
import random, re, time, uuid
from typing import Callable

OPS = {">": lambda a, b: a > b, "<": lambda a, b: a < b, ">=": lambda a, b: a >= b,
       "<=": lambda a, b: a <= b, "==": lambda a, b: a == b, "!=": lambda a, b: a != b}
COND = re.compile(r"^\s*(\w+)\s*(>=|<=|==|!=|>|<)\s*(.+?)\s*$")
MAX_STEPS = 50


def validate(defn: dict) -> None:
    steps = defn.get("steps") or {}
    if defn.get("start") not in steps:
        raise ValueError("'start' must reference an existing step")
    for name, s in steps.items():
        if s.get("type") not in ("task", "approval", "condition"):
            raise ValueError(f"step '{name}': type must be task, approval or condition")
        targets = [s.get("next"), s.get("on_reject"), s.get("default")]
        targets += [b.get("next") for b in s.get("branches", [])]
        for t in filter(None, targets):
            if t not in steps:
                raise ValueError(f"step '{name}' points to unknown step '{t}'")
        for b in s.get("branches", []):
            if not COND.match(b.get("when", "")):
                raise ValueError(f"step '{name}': bad condition '{b.get('when')}'")


def evaluate(expr: str, ctx: dict) -> bool:
    field, op, raw = COND.match(expr).groups()
    raw = raw.strip("'\"")
    left = ctx.get(field)
    try:
        right = float(raw); left = float(left)
    except (TypeError, ValueError):
        right = raw
    return OPS[op](left, right)


class WorkflowEngine:
    def __init__(self, defn: dict, tenant_id: str, emit: Callable[[dict], None], speed: float = 1.0):
        validate(defn)
        self.defn, self.tenant, self.emit, self.speed = defn, tenant_id, emit, speed

    def _event(self, run_id, step, step_type, event_type, duration_ms=0, attempt=0, detail=""):
        self.emit({"tenant_id": self.tenant, "run_id": run_id, "workflow": self.defn["name"],
                   "step": step, "step_type": step_type, "event_type": event_type,
                   "ts": time.time() * 1000, "duration_ms": int(duration_ms),
                   "attempt": attempt, "detail": detail})

    def run(self, context: dict, run_id: str | None = None) -> str:
        run_id = run_id or uuid.uuid4().hex[:12]
        steps, current, count = self.defn["steps"], self.defn["start"], 0
        self._event(run_id, "", "", "run_started", detail=str(context))
        try:
            while current:
                count += 1
                if count > MAX_STEPS:
                    raise RuntimeError("step limit exceeded (possible loop)")
                step = steps[current]
                current = self._execute(run_id, current, step, context)
            self._event(run_id, "", "", "run_completed")
        except Exception as exc:  # run-level failure is itself an auditable event
            self._event(run_id, "", "", "run_failed", detail=str(exc))
        return run_id

    def _sleep(self, ms):
        time.sleep(ms / 1000 / self.speed)

    def _execute(self, run_id, name, step, ctx):
        kind = step["type"]
        if kind == "condition":
            self._event(run_id, name, kind, "step_started")
            for b in step.get("branches", []):
                if evaluate(b["when"], ctx):
                    self._event(run_id, name, kind, "step_completed", detail=f"matched {b['when']}")
                    return b["next"]
            self._event(run_id, name, kind, "step_completed", detail="default")
            return step.get("default")

        retries = int(step.get("retries", 0))
        for attempt in range(retries + 1):
            started = time.time()
            self._event(run_id, name, kind, "step_started", attempt=attempt)
            lo, hi = step.get("duration_ms", [200, 800]) if kind == "task" else step.get("wait_ms", [1500, 4000])
            self._sleep(random.randint(lo, hi))
            fail = step.get("fail_rate", 0) if kind == "task" else step.get("reject_rate", 0)
            elapsed = (time.time() - started) * 1000 * self.speed
            if random.random() >= fail:
                self._event(run_id, name, kind, "step_completed", elapsed, attempt,
                            step.get("approver", step.get("action", "")))
                return step.get("next")
            if kind == "approval":
                self._event(run_id, name, kind, "step_failed", elapsed, attempt, "rejected")
                if step.get("on_reject"):
                    return step["on_reject"]
                raise RuntimeError(f"{name}: rejected by {step.get('approver')}")
            self._event(run_id, name, kind, "step_failed", elapsed, attempt, "action failed")
            if attempt < retries:
                self._event(run_id, name, kind, "step_retry", attempt=attempt + 1)
                self._sleep(2 ** attempt * 300)
        raise RuntimeError(f"{name}: failed after {retries + 1} attempts")
