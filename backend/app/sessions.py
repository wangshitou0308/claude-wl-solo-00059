"""Trip session lifecycle: create, confirm position, recompute tail, undo."""
from __future__ import annotations

import uuid
from copy import deepcopy
from typing import Any, Optional

from . import database as db
from .models import (
    ConfirmPositionRequest,
    CreateTripRequest,
    MapDocument,
    RouteOption,
    RouteRequest,
    TripSummary,
)
from .routing import hm_to_min, min_to_hm, plan_routes

DEFAULT_PREFS = {
    "max_continuous_walk_m": 200,
    "max_stairs": 24,
}


def _summary(data: dict[str, Any], doc: MapDocument) -> TripSummary:
    names = {n.id: n.name for n in doc.nodes}
    steps = data["route"]["steps"]
    idx = data["current_step_index"]
    current_id = data["current_node_id"]
    total = len(steps)
    return TripSummary(
        id=data["id"],
        status=data.get("status", "active"),
        resident_name=data.get("resident_name", ""),
        origin_name=names.get(data["origin_id"], data["origin_id"]),
        dest_name=names.get(data["dest_id"], data["dest_id"]),
        current_name=names.get(current_id, current_id),
        current_step_index=idx,
        total_steps=total,
        depart_at=data["route"]["depart_at"],
        arrive_at=data["route"]["arrive_at"],
        updated_at=data.get("_updated_at", ""),
    )


def list_summaries(doc: MapDocument) -> list[TripSummary]:
    out = []
    for row in db.list_trips():
        tid = row.pop("_id")
        status = row.pop("_status")
        updated_at = row.pop("_updated_at")
        if "route" not in row:
            continue
        row["id"] = tid
        row["status"] = status
        row["_updated_at"] = updated_at
        out.append(_summary(row, doc))
    return out


def create_trip(doc: MapDocument, req: CreateTripRequest) -> dict[str, Any]:
    tid = uuid.uuid4().hex[:12]
    data = {
        "id": tid,
        "resident_name": req.resident_name,
        "origin_id": req.origin_id,
        "dest_id": req.dest_id,
        "preferences": req.preferences or {},
        "route": req.route.model_dump(),
        "current_node_id": req.origin_id,
        "current_step_index": 0,
        "completed": [],          # list[RouteStep] already walked
        "history": [],            # undo snapshots
        "created_from": req.origin_id,
    }
    db.create_trip(tid, data)
    return data


def get_trip_data(trip_id: str) -> Optional[dict[str, Any]]:
    return db.get_trip(trip_id)


def summary_for(trip_id: str, doc: MapDocument) -> Optional[TripSummary]:
    data = db.get_trip(trip_id)
    if not data:
        return None
    data["id"] = trip_id
    data["status"] = data.pop("_status")
    data["_updated_at"] = data.pop("_updated_at")
    return _summary(data, doc)


def _snapshot(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "route": deepcopy(data["route"]),
        "current_node_id": data["current_node_id"],
        "current_step_index": data["current_step_index"],
        "completed": deepcopy(data["completed"]),
    }


def _advance(data: dict[str, Any]) -> bool:
    """Mark the current step finished; return True if the trip is complete."""
    route = data["route"]
    steps = route["steps"]
    idx = data["current_step_index"]
    if idx >= len(steps):
        return True
    step = steps[idx]
    data["history"].append(_snapshot(data))
    data["completed"].append(step)
    if step["type"] != "door":
        data["current_node_id"] = step["to_node_id"]
    data["current_step_index"] = idx + 1
    if data["current_step_index"] >= len(steps):
        db.save_trip(data["id"], data, status="completed")
        return True
    db.save_trip(data["id"], data)
    return False


def advance(trip_id: str) -> Optional[bool]:
    data = db.get_trip(trip_id)
    if not data:
        return None
    data["id"] = trip_id
    return _advance(data)


def undo(trip_id: str, doc: MapDocument) -> Optional[TripSummary]:
    data = db.get_trip(trip_id)
    if not data:
        return None
    if not data["history"]:
        data["id"] = trip_id
        data["status"] = data.get("_status", "active")
        data["_updated_at"] = data.get("_updated_at", "")
        return _summary(data, doc)
    snap = data["history"].pop()
    data["route"] = snap["route"]
    data["current_node_id"] = snap["current_node_id"]
    data["current_step_index"] = snap["current_step_index"]
    data["completed"] = snap["completed"]
    if data.get("_status") == "completed":
        db.save_trip(trip_id, data, status="active")
    else:
        db.save_trip(trip_id, data)
    return summary_for(trip_id, doc)

def confirm_position(
    trip_id: str, doc: MapDocument, req: ConfirmPositionRequest
) -> tuple[Optional[TripSummary], Optional[RouteOption], str]:
    """Recompute the remaining path from a user-confirmed landmark.

    Already completed steps are always kept. The new route starts at
    ``node_id`` (which may be the planned next node or a different landmark
    when the resident got lost). A closed door / broken elevator is added to
    the blocked list for the recompute.
    """
    data = db.get_trip(trip_id)
    if not data:
        return None, None, "找不到该行程"
    data["id"] = trip_id

    steps = data["route"]["steps"]
    idx = data["current_step_index"]

    # How far forward is the confirmed node in the original plan?
    advance_to: Optional[int] = None
    for j in range(idx, len(steps)):
        s = steps[j]
        if s["type"] != "door" and s["to_node_id"] == req.node_id:
            advance_to = j + 1
            break

    data["history"].append(_snapshot(data))

    if advance_to is not None:
        # Confirming planned steps — keep them as completed.
        for j in range(idx, advance_to):
            s = steps[j]
            data["completed"].append(s)
            if s["type"] != "door":
                data["current_node_id"] = s["to_node_id"]
        data["current_step_index"] = advance_to
    else:
        # Different landmark: the resident walked somewhere off-plan. Record a
        # walk step but keep completed prefix; only prefix is "kept".
        data["current_node_id"] = req.node_id

    prefs = {**DEFAULT_PREFS, **(data.get("preferences") or {})}

    # Recompute suffix with a time anchor. Prefer the resident's clock.
    anchor = req.now_time
    if anchor is None:
        anchor = min_to_hm(
            hm_to_min(data["route"]["depart_at"])
            + sum(s["traverse_seconds"] + sum(w["seconds"] for w in s["waits"])
                  for s in data["completed"])
            // 60
        )

    blocked_nodes: list[str] = []
    blocked_elevs: list[str] = []
    if req.blocked_door_node_id:
        blocked_nodes.append(req.blocked_door_node_id)
    if req.blocked_elevator_id:
        blocked_elevs.append(req.blocked_elevator_id)

    if req.node_id == data["dest_id"]:
        # arrived
        data["current_step_index"] = len(steps)
        data["current_node_id"] = req.node_id
        db.save_trip(trip_id, data, status="completed")
        return summary_for(trip_id, doc), None, "已到达目的地"

    rr = RouteRequest(
        origin_id=req.node_id,
        dest_id=data["dest_id"],
        depart_at=anchor,
        max_continuous_walk_m=prefs["max_continuous_walk_m"],
        max_stairs=prefs["max_stairs"],
        blocked_node_ids=blocked_nodes,
        blocked_elevator_ids=blocked_elevs,
    )
    resp = plan_routes(doc, rr)
    if not resp.feasible or not resp.options:
        # keep the snapshot so user can undo; store infeasible marker
        data["reroute_error"] = resp.message
        db.save_trip(trip_id, data, status="stuck")
        return summary_for(trip_id, doc), None, resp.message

    best = resp.options[0]
    new_route = best.model_dump()
    # splice: full step list = completed prefix + new suffix
    new_route["steps"] = data["completed"] + new_route["steps"]
    new_route["node_sequence"] = (
        [data["origin_id"]]
        + [s["to_node_id"] for s in data["completed"] if s["type"] != "door"]
        + best.node_sequence[1:]
    )
    # keep original departure label, update arrival from the suffix anchor
    data["route"] = new_route
    data["current_step_index"] = len(data["completed"])
    data["current_node_id"] = req.node_id
    data.pop("reroute_error", None)
    db.save_trip(trip_id, data, status="active")
    msg = "余程已重算" if advance_to is not None else "已按确认位置重算余程，已走步骤保留"
    return summary_for(trip_id, doc), best, msg
