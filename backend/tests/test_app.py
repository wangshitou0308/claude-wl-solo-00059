"""Tests for the route engine invariants and the trip session API."""
from __future__ import annotations

import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp()
os.environ["APP_DB_PATH"] = os.path.join(_tmp, "test.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app, validate_doc  # noqa: E402
from app.models import RouteRequest  # noqa: E402
from app.routing import plan_routes  # noqa: E402
from app.seed import seed_map  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        c.post("/api/map/reset")
        yield c


DOC = seed_map()


def plan(**kw):
    base = dict(
        origin_id="b1-3-home",
        dest_id="b3-1-canteen",
        depart_at="08:00",
        max_continuous_walk_m=200,
        max_stairs=24,
    )
    base.update(kw)
    return plan_routes(DOC, RouteRequest(**base))


def test_seed_map_validates():
    validate_doc(DOC)


def test_basic_route_feasible_and_ordered():
    resp = plan()
    assert resp.feasible
    stairs = [o.total_steps for o in resp.options]
    assert stairs == sorted(stairs)  # fewer stairs first
    top = resp.options[0]
    assert top.node_sequence[0] == "b1-3-home"
    assert top.node_sequence[-1] == "b3-1-canteen"


def test_zero_stairs_option_has_no_stair_edge():
    resp = plan(max_stairs=0)
    assert resp.feasible
    for o in resp.options:
        assert o.total_steps == 0
        assert sum(s.steps for s in o.steps) == 0


def test_continuous_walk_constraint_hard():
    resp = plan(max_continuous_walk_m=30)
    assert not resp.feasible
    resp2 = plan(max_continuous_walk_m=200)
    assert resp2.feasible
    for o in resp2.options:
        assert o.longest_continuous_walk_m <= 200


def test_door_opening_wait_and_after_close_infeasible():
    # canteen dinner ends 19:00; leaving 20:00 cannot enter
    assert not plan(depart_at="20:00").feasible
    # 06:50 arrival at 07:00 corridor incurs waiting
    resp = plan_routes(
        DOC,
        RouteRequest(
            origin_id="b2-1-lobby",
            dest_id="b3-2-act",
            depart_at="06:50",
            max_continuous_walk_m=200,
            max_stairs=24,
        ),
    )
    assert resp.feasible
    waits = [w for s in resp.options[0].steps for w in s.waits]
    assert any(w.reason in ("door", "corridor") and w.seconds >= 5 * 60 for w in waits)


def test_partial_floors_elevator():
    # b1 floor 2 landing cannot board the elevator (only 1 and 3 stop)
    resp = plan_routes(
        DOC,
        RouteRequest(
            origin_id="b1-2-stair",
            dest_id="b3-1-canteen",
            depart_at="08:00",
            max_continuous_walk_m=200,
            max_stairs=0,
        ),
    )
    assert not resp.feasible  # must climb to a served floor; zero stairs -> impossible


def test_no_repeat_elevatore_backtracking():
    resp = plan()
    top = resp.options[0]
    # elevator rides never revisit the same elevator immediately
    rides = [s.elevator_id for s in top.steps if s.elevator_id]
    for a, b in zip(rides, rides[1:]):
        assert not (a == b)


# ----------------------------------------------------------------- API/session


def test_api_full_trip_flow(client):
    req = dict(
        origin_id="b1-3-home",
        dest_id="b3-1-canteen",
        depart_at="08:00",
        max_continuous_walk_m=200,
        max_stairs=0,
    )
    opt = client.post("/api/routes/plan", json=req).json()["options"][0]
    s = client.post(
        "/api/trips",
        json=dict(
            route=opt,
            origin_id=req["origin_id"],
            dest_id=req["dest_id"],
            resident_name="测试住户",
            preferences=dict(max_continuous_walk_m=200, max_stairs=0),
        ),
    ).json()
    tid = s["id"]

    for _ in range(3):
        s = client.post(f"/api/trips/{tid}/advance").json()
    assert s["current_step_index"] == 3

    s = client.post(f"/api/trips/{tid}/undo").json()["summary"]
    assert s["current_step_index"] == 2

    # confirm a planned landmark further along -> tail recomputed, prefix kept
    b = client.post(
        f"/api/trips/{tid}/confirm",
        json=dict(node_id="b1-out", now_time="08:06"),
    ).json()
    assert b["route"] is not None
    assert b["summary"]["current_step_index"] >= 3
    completed = client.get(f"/api/trips/{tid}").json()["trip"]["completed"]
    assert len(completed) >= 3

    # closed main door -> reroute via sky corridor
    b = client.post(
        f"/api/trips/{tid}/confirm",
        json=dict(node_id="slope-seat", now_time="08:12",
                  blocked_door_node_id="b3-door"),
    ).json()
    assert b["route"] is not None
    assert "b3-door" not in b["route"]["node_sequence"]
    assert "cor2-b2" in b["route"]["node_sequence"]

    # undo the reroute (withdraws the confirm action: position restored)
    s = client.post(f"/api/trips/{tid}/undo").json()["summary"]
    assert s["current_name"] == "1栋门前平台"

    # arrive
    b = client.post(
        f"/api/trips/{tid}/confirm",
        json=dict(node_id="b3-1-canteen", now_time="08:40"),
    ).json()
    assert b["summary"]["status"] == "completed"


def test_api_confirm_offplan_landmark(client):
    req = dict(
        origin_id="b2-2-home",
        dest_id="b3-2-act",
        depart_at="09:00",
        max_continuous_walk_m=200,
        max_stairs=24,
    )
    opt = client.post("/api/routes/plan", json=req).json()["options"][0]
    tid = client.post(
        "/api/trips",
        json=dict(route=opt, origin_id=req["origin_id"], dest_id=req["dest_id"],
                  preferences=dict(max_continuous_walk_m=200, max_stairs=24)),
    ).json()["id"]
    # resident walks down to floor 0 instead of the planned route
    b = client.post(
        f"/api/trips/{tid}/confirm",
        json=dict(node_id="b2-0-stair", now_time="09:08"),
    ).json()
    assert b["route"] is not None
    assert b["summary"]["current_name"] == "2栋0层 楼梯口"
