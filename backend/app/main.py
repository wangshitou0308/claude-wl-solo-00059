"""FastAPI application: map CRUD, route planning and trip sessions."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import database as db, sessions
from .models import (
    ConfirmPositionRequest,
    CreateTripRequest,
    MapDocument,
    RouteRequest,
    RerouteResponse,
    TripSummary,
    UndoResponse,
)
from .routing import plan_routes
from .seed import seed_map

app = FastAPI(title="坡地社区电梯接续引导", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()
    if db.get_map_doc() is None:
        db.put_map_doc(seed_map().model_dump())


def _doc() -> MapDocument:
    raw = db.get_map_doc()
    if raw is None:
        db.init_db()
        db.put_map_doc(seed_map().model_dump())
        raw = db.get_map_doc()
    return MapDocument.model_validate(raw)


def validate_doc(doc: MapDocument) -> None:
    node_ids = {n.id for n in doc.nodes}
    building_ids = {b.id for b in doc.buildings}
    if len(node_ids) != len(doc.nodes):
        raise HTTPException(400, "存在重复的节点 ID")
    for e in doc.edges:
        if e.a not in node_ids or e.b not in node_ids:
            raise HTTPException(400, f"连线 {e.id} 引用了不存在的节点")
    for ev in doc.elevators:
        if ev.building_id not in building_ids:
            raise HTTPException(400, f"电梯 {ev.id} 引用了不存在的楼栋")
        for s in ev.stops:
            if s.node_id not in node_ids:
                raise HTTPException(400, f"电梯 {ev.id} 引用了不存在的停靠节点")
    seen: set[tuple[str, str]] = set()
    for e in doc.edges:
        key = tuple(sorted((e.a, e.b)))
        key2 = (key, e.kind)
        # parallel edges (stairs + ramp) allowed; flag exact duplicates
        if key2 in seen:
            raise HTTPException(400, f"重复连线：{e.a}-{e.b} ({e.kind})")
        seen.add(key2)


# ---------------------------------------------------------------------- map


@app.get("/api/map", response_model=MapDocument)
def get_map() -> MapDocument:
    return _doc()


@app.put("/api/map", response_model=MapDocument)
def put_map(doc: MapDocument) -> MapDocument:
    validate_doc(doc)
    db.put_map_doc(doc.model_dump())
    return doc


@app.post("/api/map/reset", response_model=MapDocument)
def reset_map() -> MapDocument:
    fresh = seed_map()
    db.put_map_doc(fresh.model_dump())
    return fresh


# -------------------------------------------------------------------- routes


@app.post("/api/routes/plan")
def plan(req: RouteRequest) -> dict[str, Any]:
    resp = plan_routes(_doc(), req)
    return resp.model_dump()


# -------------------------------------------------------------------- trips


@app.post("/api/trips", response_model=TripSummary)
def create_trip(req: CreateTripRequest) -> TripSummary:
    doc = _doc()
    data = sessions.create_trip(doc, req)
    s = sessions.summary_for(data["id"], doc)
    assert s is not None
    return s


@app.get("/api/trips", response_model=list[TripSummary])
def list_trips() -> list[TripSummary]:
    return sessions.list_summaries(_doc())


@app.get("/api/trips/{trip_id}")
def get_trip(trip_id: str) -> dict[str, Any]:
    data = db.get_trip(trip_id)
    if not data:
        raise HTTPException(404, "行程不存在")
    status = data.pop("_status")
    updated = data.pop("_updated_at")
    summary = sessions.summary_for(trip_id, _doc())
    return {
        "summary": summary.model_dump() if summary else None,
        "status": status,
        "updated_at": updated,
        "trip": data,
    }


@app.post("/api/trips/{trip_id}/advance", response_model=TripSummary)
def advance(trip_id: str) -> TripSummary:
    result = sessions.advance(trip_id)
    if result is None:
        raise HTTPException(404, "行程不存在")
    s = sessions.summary_for(trip_id, _doc())
    assert s is not None
    return s


@app.post("/api/trips/{trip_id}/confirm", response_model=RerouteResponse)
def confirm(trip_id: str, req: ConfirmPositionRequest) -> RerouteResponse:
    doc = _doc()
    summary, route, msg = sessions.confirm_position(trip_id, doc, req)
    if summary is None:
        raise HTTPException(404, "行程不存在")
    return RerouteResponse(summary=summary, route=route, message=msg)


@app.post("/api/trips/{trip_id}/undo", response_model=UndoResponse)
def undo(trip_id: str) -> UndoResponse:
    doc = _doc()
    s = sessions.undo(trip_id, doc)
    if s is None:
        raise HTTPException(404, "行程不存在")
    return UndoResponse(summary=s)
