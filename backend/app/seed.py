"""Seed map: a small hilly three-building community.

1栋 sits high on the slope, 2栋 is halfway (has a floor 0 entrance), 3栋 is the
service building with canteen on floor 1 and activity room on floor 2. Stepped
stairs have parallel step-free ramps; a sky corridor links 2栋 floor 1 to
3栋 floor 2. All elevators skip some floors.
"""
from __future__ import annotations

from .models import (
    Building,
    Elevator,
    ElevatorStop,
    MapDocument,
    MapNode,
    WalkEdge,
    Window,
)


def seed_map() -> MapDocument:
    W = lambda o, c, note="": Window(open=o, close=c, note=note)  # noqa: E731

    buildings = [
        Building(id="B1", name="1栋（坡上）", x=180, y=120, floors=[1, 2, 3]),
        Building(id="B2", name="2栋（半坡）", x=540, y=120, floors=[0, 1, 2]),
        Building(id="B3", name="3栋综合楼", x=900, y=120, floors=[1, 2]),
    ]

    nodes: list[MapNode] = [
        # ---- 1栋 ----
        MapNode(id="b1-3-home", name="1栋3层 家门口", building_id="B1", floor=3,
                x=170, y=120, kind="landing"),
        MapNode(id="b1-3-lobby", name="1栋3层 电梯口", building_id="B1", floor=3,
                x=250, y=120, kind="landing", note="电梯停3层"),
        MapNode(id="b1-2-stair", name="1栋2层 楼梯平台", building_id="B1", floor=2,
                x=170, y=250, kind="landing", note="电梯不停2层"),
        MapNode(id="b1-seat-12", name="1栋1-2层休息平台", building_id="B1", floor=2,
                x=170, y=315, kind="seat", is_seat=True),
        MapNode(id="b1-1-stair", name="1栋1层 楼梯口", building_id="B1", floor=1,
                x=170, y=380, kind="landing"),
        MapNode(id="b1-1-lobby", name="1栋1层 电梯厅", building_id="B1", floor=1,
                x=250, y=380, kind="landing"),
        MapNode(id="b1-door", name="1栋单元门", building_id="B1", floor=1,
                x=250, y=455, kind="entrance", windows=[W("06:00", "22:00", "单元门")]),
        MapNode(id="b1-out", name="1栋门前平台", x=250, y=520, kind="landing"),

        # ---- 2栋 ----
        MapNode(id="b2-2-home", name="2栋2层 家门口", building_id="B2", floor=2,
                x=530, y=250, kind="landing"),
        MapNode(id="b2-2-lobby", name="2栋2层 走道", building_id="B2", floor=2,
                x=610, y=250, kind="landing", note="电梯井经过但不停2层"),
        MapNode(id="b2-seat-12", name="2栋1-2层休息平台", building_id="B2", floor=2,
                x=530, y=315, kind="seat", is_seat=True),
        MapNode(id="b2-1-stair", name="2栋1层 楼梯口", building_id="B2", floor=1,
                x=530, y=380, kind="landing"),
        MapNode(id="b2-1-lobby", name="2栋1层 电梯厅", building_id="B2", floor=1,
                x=610, y=380, kind="landing"),
        MapNode(id="b2-0-stair", name="2栋0层 楼梯口", building_id="B2", floor=0,
                x=530, y=510, kind="landing"),
        MapNode(id="b2-0-lobby", name="2栋0层 电梯厅", building_id="B2", floor=0,
                x=610, y=510, kind="landing"),
        MapNode(id="b2-door", name="2栋单元门", building_id="B2", floor=0,
                x=610, y=575, kind="entrance", windows=[W("06:00", "21:00", "单元门")]),
        MapNode(id="b2-out", name="2栋门前坡道顶", x=610, y=620, kind="landing"),

        # ---- 3栋综合楼 ----
        MapNode(id="b3-2-act", name="社区活动室", building_id="B3", floor=2,
                x=880, y=250, kind="poi", poi_type="activity"),
        MapNode(id="b3-2-door", name="活动室门", building_id="B3", floor=2,
                x=950, y=250, kind="door",
                windows=[W("08:30", "20:30", "活动室开放")]),
        MapNode(id="b3-2-stair", name="3栋2层 楼梯口", building_id="B3", floor=2,
                x=1030, y=250, kind="landing"),
        MapNode(id="b3-2-lobby", name="3栋2层 电梯厅", building_id="B3", floor=2,
                x=1100, y=250, kind="landing"),
        MapNode(id="b3-1-canteen", name="社区食堂", building_id="B3", floor=1,
                x=880, y=380, kind="poi", poi_type="canteen"),
        MapNode(id="b3-1-door", name="食堂门", building_id="B3", floor=1,
                x=950, y=380, kind="door",
                windows=[W("07:00", "13:30", "午餐时段"), W("16:30", "19:00", "晚餐时段")]),
        MapNode(id="b3-1-stair", name="3栋1层 楼梯口", building_id="B3", floor=1,
                x=1030, y=380, kind="landing"),
        MapNode(id="b3-1-lobby", name="3栋1层 电梯厅", building_id="B3", floor=1,
                x=1100, y=380, kind="landing"),
        MapNode(id="b3-door", name="综合楼大门", building_id="B3", floor=1,
                x=1100, y=470, kind="entrance", windows=[W("06:00", "22:00", "大楼门")]),
        MapNode(id="b3-out", name="综合楼前广场", x=1100, y=540, kind="landing"),

        # ---- 连廊 ----
        MapNode(id="cor2-b2", name="2栋1层 连廊口", building_id="B2", floor=1,
                x=700, y=380, kind="door",
                windows=[W("07:00", "19:00", "连廊门")]),
        MapNode(id="cor-mid", name="空中连廊休息椅", floor=1, x=780, y=330,
                kind="seat", is_seat=True),
        MapNode(id="cor2-b3", name="3栋2层 连廊口", building_id="B3", floor=2,
                x=860, y=290, kind="door",
                windows=[W("07:00", "19:00", "连廊门")]),

        # ---- 室外主路 ----
        MapNode(id="gate", name="小区主路入口", x=90, y=640, kind="entrance"),
        MapNode(id="rest-road", name="主路休息椅", x=360, y=640, kind="seat", is_seat=True),
        MapNode(id="slope-seat", name="坡道休息椅", x=480, y=560, kind="seat", is_seat=True),
    ]

    def E(id, a, b, kind="flat", length=0.0, steps=0, windows=None, note=""):
        return WalkEdge(id=id, a=a, b=b, kind=kind, length_m=length, steps=steps,
                        windows=windows or [], note=note)

    cor_w = [W("07:00", "19:00", "空中连廊")]
    edges: list[WalkEdge] = [
        # 1栋 室内
        E("e-b1-3", "b1-3-home", "b1-3-lobby", "flat", 30),
        E("e-b1-23a", "b1-3-home", "b1-2-stair", "stairs", 8, 18),
        E("e-b1-12a", "b1-2-stair", "b1-seat-12", "stairs", 5, 10),
        E("e-b1-12b", "b1-seat-12", "b1-1-stair", "stairs", 5, 10),
        E("e-b1-1l", "b1-1-stair", "b1-1-lobby", "flat", 20),
        E("e-b1-ld", "b1-1-lobby", "b1-door", "flat", 25),
        E("e-b1-ramp", "b1-door", "b1-out", "ramp", 20),

        # 2栋 室内
        E("e-b2-2", "b2-2-home", "b2-2-lobby", "flat", 25),
        E("e-b2-23a", "b2-2-home", "b2-seat-12", "stairs", 5, 10),
        E("e-b2-12a", "b2-seat-12", "b2-1-stair", "stairs", 5, 10),
        E("e-b2-10", "b2-1-stair", "b2-0-stair", "stairs", 6, 12),
        E("e-b2-1l", "b2-1-stair", "b2-1-lobby", "flat", 20),
        E("e-b2-0l", "b2-0-stair", "b2-0-lobby", "flat", 20),
        E("e-b2-ld", "b2-0-lobby", "b2-door", "flat", 20),
        E("e-b2-ramp", "b2-door", "b2-out", "ramp", 22),

        # 3栋 室内
        E("e-b3-act", "b3-2-act", "b3-2-door", "flat", 8),
        E("e-b3-2dl", "b3-2-door", "b3-2-lobby", "flat", 18),
        E("e-b3-2s", "b3-2-stair", "b3-2-lobby", "flat", 18),
        E("e-b3-12", "b3-1-stair", "b3-2-stair", "stairs", 8, 16),
        E("e-b3-1s", "b3-1-stair", "b3-1-lobby", "flat", 18),
        E("e-b3-canteen", "b3-1-canteen", "b3-1-door", "flat", 8),
        E("e-b3-1dl", "b3-1-door", "b3-1-lobby", "flat", 12),
        E("e-b3-ld", "b3-1-lobby", "b3-door", "stairs", 6, 14),
        E("e-b3-ramp", "b3-door", "b3-out", "ramp", 18),

        # 空中连廊（2栋1层 ↔ 3栋2层）
        E("e-cor-1", "b2-1-lobby", "cor2-b2", "flat", 15),
        E("e-cor-2", "cor2-b2", "cor-mid", "corridor", 60, windows=cor_w),
        E("e-cor-3", "cor-mid", "cor2-b3", "corridor", 60, windows=cor_w),
        E("e-cor-4", "cor2-b3", "b3-2-act", "flat", 20),

        # 室外主路
        E("e-road-1", "gate", "rest-road", "sidewalk", 120),
        E("e-road-2", "rest-road", "b1-out", "sidewalk", 80),
        E("e-slope-s1", "rest-road", "slope-seat", "stairs", 30, steps=12,
          note="坡台阶上段"),
        E("e-slope-r1", "rest-road", "slope-seat", "ramp", 95, note="无障碍坡道（绕）"),
        E("e-slope-s2", "slope-seat", "b2-out", "stairs", 30, steps=12,
          note="坡台阶下段"),
        E("e-slope-r2", "slope-seat", "b2-out", "ramp", 75, note="无障碍坡道（绕）"),
        E("e-road-3", "b2-out", "b3-out", "sidewalk", 90),
    ]

    elevators = [
        Elevator(
            id="E1", name="1栋电梯", building_id="B1", x=250, y=190,
            stops=[ElevatorStop(node_id="b1-3-lobby", floor=3),
                   ElevatorStop(node_id="b1-1-lobby", floor=1)],
            wait_seconds=90, seconds_per_floor=6,
            windows=[W("06:00", "23:00", "电梯运行")],
            note="不停2层",
        ),
        Elevator(
            id="E2", name="2栋电梯", building_id="B2", x=610, y=450,
            stops=[ElevatorStop(node_id="b2-1-lobby", floor=1),
                   ElevatorStop(node_id="b2-0-lobby", floor=0)],
            wait_seconds=90, seconds_per_floor=6,
            windows=[W("06:00", "21:30", "电梯运行")],
            note="不停2层",
        ),
        Elevator(
            id="E3", name="综合楼电梯", building_id="B3", x=1100, y=315,
            stops=[ElevatorStop(node_id="b3-2-lobby", floor=2),
                   ElevatorStop(node_id="b3-1-lobby", floor=1)],
            wait_seconds=60, seconds_per_floor=5,
            windows=[W("06:00", "22:00", "电梯运行")],
        ),
    ]

    return MapDocument(
        version=1, buildings=buildings, nodes=nodes, edges=edges, elevators=elevators
    )
