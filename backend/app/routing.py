"""Route generation engine.

The map is a time-dependent graph: walking edges (flat / ramp / stairs /
corridor / sidewalk) and elevators that stop at only some floors. Doors and
corridors have daily opening windows; arriving early means waiting, arriving
after closing means the route is infeasible for that day.

A multi-criteria label-setting search keeps Pareto-optimal labels per node.
Personal limits are hard constraints:

* continuous walking distance between two rest opportunities (a seat or the end
  of an elevator ride) must not exceed ``max_continuous_walk_m``;
* stairs climbed between the same rest opportunities must not exceed
  ``max_stairs``.

Result options are ordered by: fewer stairs, shorter longest continuous walk,
fewer transfers, shorter total walk, earlier arrival.
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass
from typing import Optional

from .models import (
    Elevator,
    MapDocument,
    MapNode,
    RouteOption,
    RouteRequest,
    RouteResponse,
    RouteStep,
    WaitInfo,
    WalkEdge,
    Window,
)

DAY = 24 * 60

# Elderly-friendly speeds
WALK_SPEED = {  # metres / minute
    "flat": 45.0,
    "ramp": 38.0,
    "corridor": 50.0,
    "sidewalk": 45.0,
}
STAIRS_PER_MIN = 10.0
EDGE_LABEL = {
    "flat": "平路",
    "ramp": "坡道",
    "stairs": "楼梯",
    "corridor": "连廊",
    "sidewalk": "步道",
}


# ------------------------------------------------------------------- helpers


def hm_to_min(text: str) -> int:
    h, m = text.split(":")
    return int(h) * 60 + int(m)


def min_to_hm(value: int) -> str:
    value = max(0, min(DAY - 1, int(round(value))))
    return f"{value // 60:02d}:{value % 60:02d}"


def window_open(windows: list[Window], t: int) -> bool:
    return any(hm_to_min(w.open) <= t <= hm_to_min(w.close) for w in windows)


def wait_until_open(windows: list[Window], t: int) -> Optional[int]:
    """Minutes to wait before a window opens today; None if it never will."""
    if not windows:
        return 0
    if window_open(windows, t):
        return 0
    candidates = [hm_to_min(w.open) for w in windows if hm_to_min(w.open) >= t]
    if not candidates:
        return None
    return min(candidates) - t


# ---------------------------------------------------------------- graph view


@dataclass
class _WalkLink:
    edge: WalkEdge
    other: MapNode


@dataclass
class _ElevLink:
    elevator: Elevator
    target: MapNode
    floors: int  # signed: up / down


class Graph:
    def __init__(self, doc: MapDocument):
        self.nodes: dict[str, MapNode] = {n.id: n for n in doc.nodes}
        self.elevators: dict[str, Elevator] = {e.id: e for e in doc.elevators}
        self.walk: dict[str, list[_WalkLink]] = {nid: [] for nid in self.nodes}
        self.elev: dict[str, list[_ElevLink]] = {nid: [] for nid in self.nodes}

        for edge in doc.edges:
            if edge.a not in self.nodes or edge.b not in self.nodes:
                continue
            self.walk[edge.a].append(_WalkLink(edge, self.nodes[edge.b]))
            self.walk[edge.b].append(_WalkLink(edge, self.nodes[edge.a]))

        for elev in doc.elevators:
            stops = [s for s in elev.stops if s.node_id in self.nodes]
            for s in stops:
                for t in stops:
                    if s.node_id == t.node_id:
                        continue
                    self.elev[s.node_id].append(
                        _ElevLink(elev, self.nodes[t.node_id], t.floor - s.floor)
                    )


# ---------------------------------------------------------------------- labels


@dataclass
class Label:
    node_id: str
    arrival: int
    cont_walk: float
    cont_steps: int
    total_steps: int
    total_walk: float
    total_wait: int  # minutes
    max_cont_walk: float
    rides: int
    visited: frozenset[str] = frozenset()
    prev: Optional["Label"] = None
    step: Optional[RouteStep] = None
    alive: bool = True
    uid: int = 0

    def tuple(self) -> tuple:
        return (
            self.arrival,
            round(self.cont_walk, 2),
            self.cont_steps,
            self.total_steps,
            round(self.total_walk, 2),
            self.total_wait,
            self.rides,
            round(self.max_cont_walk, 2),
        )

    def dominates(self, other: "Label") -> bool:
        a, b = self.tuple(), other.tuple()
        return all(x <= y for x, y in zip(a, b)) and a != b


# -------------------------------------------------------------------- engine


class RouteEngine:
    def __init__(self, doc: MapDocument, req: RouteRequest):
        self.g = Graph(doc)
        self.req = req
        self.labels: dict[str, list[Label]] = {nid: [] for nid in self.g.nodes}
        self._uid = 0
        self.MAX_LABELS = 60_000
        self.label_count = 0

    def solve(self) -> RouteResponse:
        req = self.req
        if req.origin_id not in self.g.nodes:
            return RouteResponse(options=[], feasible=False, message="找不到出发地")
        if req.dest_id not in self.g.nodes:
            return RouteResponse(options=[], feasible=False, message="找不到目的地")
        if req.origin_id == req.dest_id:
            return RouteResponse(options=[], feasible=False, message="出发地与目的地相同")
        if req.dest_id in req.blocked_node_ids:
            return RouteResponse(options=[], feasible=False, message="目的地当前不可达")

        start = Label(
            node_id=req.origin_id,
            arrival=hm_to_min(req.depart_at),
            cont_walk=0.0,
            cont_steps=0,
            total_steps=0,
            total_walk=0.0,
            total_wait=0,
            max_cont_walk=0.0,
            rides=0,
            visited=frozenset({req.origin_id}),
        )
        heap: list[tuple[int, int, Label]] = []
        self._push(heap, start)

        while heap:
            _, _, lab = heapq.heappop(heap)
            if not lab.alive:
                continue
            if lab.node_id == req.dest_id:
                # keep earlier-arriving dest labels but never expand past dest
                continue
            for link in self.g.walk.get(lab.node_id, []):
                self._walk(heap, lab, link)
            for link in self.g.elev.get(lab.node_id, []):
                self._ride(heap, lab, link)
            if self.label_count > self.MAX_LABELS:
                break

        return self._collect()

    # --------------------------------------------------------------- frontier

    def _admit(self, cand: Label) -> bool:
        existing = self.labels[cand.node_id]
        for old in existing:
            if old.dominates(cand):
                return False
        for old in existing:
            if cand.dominates(old):
                old.alive = False
        self.labels[cand.node_id] = [old for old in existing if old.alive]
        cand.uid = self._uid
        self._uid += 1
        self.label_count += 1
        self.labels[cand.node_id].append(cand)
        return True

    def _push(self, heap, cand: Label) -> None:
        if self._admit(cand):
            heapq.heappush(heap, (cand.arrival, cand.uid, cand))

    def _rest_at(self, node: MapNode) -> bool:
        return node.is_seat or node.kind == "seat"

    # ------------------------------------------------------------- traversals

    def _walk(self, heap, lab: Label, link: _WalkLink) -> None:
        edge, node = link.edge, link.other
        if node.id in self.req.blocked_node_ids or node.id in lab.visited:
            return

        t = lab.arrival
        waits: list[WaitInfo] = []
        if edge.windows:
            wait = wait_until_open(edge.windows, t)
            if wait is None:
                return
            if wait > 0:
                waits.append(
                    WaitInfo(
                        reason="corridor",
                        target_name=f"连廊{('（' + edge.note + '）') if edge.note else ''}",
                        seconds=wait * 60,
                    )
                )
                t += wait

        if edge.kind == "stairs":
            traverse = max(1, int(round(edge.steps / STAIRS_PER_MIN)))
        else:
            traverse = max(1, int(round(edge.length_m / WALK_SPEED[edge.kind])))
        arrive = t + traverse
        if arrive >= DAY:
            return

        cont_walk = lab.cont_walk + edge.length_m
        cont_steps = lab.cont_steps + edge.steps
        if cont_walk > self.req.max_continuous_walk_m + 1e-6:
            return
        if cont_steps > self.req.max_stairs:
            return

        step = RouteStep(
            type="walk",
            from_node_id=lab.node_id,
            to_node_id=node.id,
            edge_id=edge.id,
            description=self._walk_text(edge, node, waits),
            detail=f"{EDGE_LABEL[edge.kind]} {edge.length_m:g} 米"
            + (f"，{edge.steps} 级台阶" if edge.steps else ""),
            length_m=edge.length_m,
            steps=edge.steps,
            traverse_seconds=traverse * 60,
            waits=waits,
        )

        cand = Label(
            node_id=node.id,
            arrival=arrive,
            cont_walk=cont_walk,
            cont_steps=cont_steps,
            total_steps=lab.total_steps + edge.steps,
            total_walk=lab.total_walk + edge.length_m,
            total_wait=lab.total_wait + sum(w.seconds for w in waits) // 60,
            max_cont_walk=max(lab.max_cont_walk, cont_walk),
            rides=lab.rides,
            visited=lab.visited | {node.id},
            prev=lab,
            step=step,
        )
        self._arrive_node(heap, cand, node)

    def _ride(self, heap, lab: Label, link: _ElevLink) -> None:
        elev, node = link.elevator, link.target
        if elev.id in self.req.blocked_elevator_ids:
            return
        if node.id in self.req.blocked_node_ids or node.id in lab.visited:
            return

        t = lab.arrival
        waits: list[WaitInfo] = []
        if elev.windows:
            wait = wait_until_open(elev.windows, t)
            if wait is None:
                return
            if wait > 0:
                waits.append(
                    WaitInfo(reason="elevator", target_name=f"{elev.name}开放", seconds=wait * 60)
                )
                t += wait

        car_wait = max(0, round(elev.wait_seconds / 60))
        floors_t = max(1, round(elev.seconds_per_floor / 60))
        traverse = car_wait + max(1, abs(link.floors)) * floors_t
        arrive = t + traverse
        if arrive >= DAY:
            return
        waits.append(
            WaitInfo(reason="elevator", target_name=elev.name, seconds=car_wait * 60)
        )

        direction = "上行" if link.floors > 0 else "下行"
        step = RouteStep(
            type="elevator",
            from_node_id=lab.node_id,
            to_node_id=node.id,
            elevator_id=elev.id,
            description=(
                f"乘【{elev.name}】{direction} {abs(link.floors)} 层，"
                f"在「{node.name}」出电梯"
            ),
            detail="仅停：" + "、".join(str(s.floor) for s in elev.stops),
            floors=link.floors,
            traverse_seconds=traverse * 60,
            waits=waits,
        )

        cand = Label(
            node_id=node.id,
            arrival=arrive,
            cont_walk=0.0,  # riding is a rest break
            cont_steps=0,
            total_steps=lab.total_steps,
            total_walk=lab.total_walk,
            total_wait=lab.total_wait + sum(w.seconds for w in waits) // 60,
            max_cont_walk=lab.max_cont_walk,
            rides=lab.rides + 1,
            visited=lab.visited | {node.id},
            prev=lab,
            step=step,
        )
        self._arrive_node(heap, cand, node)

    def _arrive_node(self, heap, cand: Label, node: MapNode) -> None:
        """Access-control wait/door step, seat reset, then frontier insert."""
        if node.id != self.req.origin_id and node.windows and node.kind in (
            "door",
            "entrance",
        ):
            wait = wait_until_open(node.windows, cand.arrival)
            if wait is None:
                return
            if cand.arrival + wait >= DAY:
                return
            door_step = RouteStep(
                type="door",
                from_node_id=node.id,
                to_node_id=node.id,
                description=self._door_text(node, wait),
                detail="开放：" + "、".join(f"{w.open}-{w.close}" for w in node.windows),
                traverse_seconds=0,
                waits=(
                    [WaitInfo(reason="door", target_name=node.name, seconds=wait * 60)]
                    if wait
                    else []
                ),
            )
            cand.arrival += wait
            cand.total_wait += wait
            cand = Label(
                node_id=node.id,
                arrival=cand.arrival,
                cont_walk=cand.cont_walk,
                cont_steps=cand.cont_steps,
                total_steps=cand.total_steps,
                total_walk=cand.total_walk,
                total_wait=cand.total_wait,
                max_cont_walk=cand.max_cont_walk,
                rides=cand.rides,
                visited=cand.visited,
                prev=cand,
                step=door_step,
            )

        if self._rest_at(node):
            cand.cont_walk = 0.0
            cand.cont_steps = 0

        self._push(heap, cand)

    # ---------------------------------------------------------------- texts

    def _walk_text(self, edge: WalkEdge, node: MapNode, waits: list[WaitInfo]) -> str:
        parts = [f"沿{EDGE_LABEL[edge.kind]}前往「{node.name}」"]
        if edge.steps:
            parts.append(f"共 {edge.steps} 级台阶，请扶好扶手")
        elif edge.length_m >= 60:
            parts.append(f"约 {edge.length_m:g} 米")
        if waits:
            parts.append(f"连廊未开，需等待 {waits[0].seconds // 60} 分钟")
        return "，".join(parts)

    def _door_text(self, node: MapNode, wait: int) -> str:
        if wait > 0:
            return f"「{node.name}」尚未开放，等待 {wait} 分钟后刷卡或推门通过"
        return f"「{node.name}」已开放，刷卡或推门通过"

    # --------------------------------------------------------------- collect

    def _collect(self) -> RouteResponse:
        dest = self.req.dest_id
        winners = [l for l in self.labels[dest] if l.alive and l.prev is not None]
        if not winners:
            return RouteResponse(
                options=[],
                feasible=False,
                message=(
                    "在当前开放时段与您的体力限制下没有找到完整路线，"
                    "可调整出发时刻、放宽连续步行距离或楼梯级数。"
                ),
            )

        options: list[RouteOption] = []
        seen: set[str] = set()
        winners.sort(
            key=lambda l: (
                l.total_steps,
                l.max_cont_walk,
                max(0, l.rides - 1),
                l.total_walk,
                l.arrival,
            )
        )
        for lab in winners:
            steps, seq = self._rebuild(lab)
            key = "|".join(seq)
            if key in seen:
                continue
            seen.add(key)
            rides = lab.rides
            options.append(
                RouteOption(
                    rank=len(options) + 1,
                    total_steps=lab.total_steps,
                    total_walk_m=round(lab.total_walk, 1),
                    total_wait_seconds=lab.total_wait * 60,
                    total_seconds=(lab.arrival - hm_to_min(self.req.depart_at)) * 60,
                    elevator_rides=rides,
                    transfers=max(0, rides - 1),
                    longest_continuous_walk_m=round(lab.max_cont_walk, 1),
                    max_stairs_between_rest=self._max_cont_stairs(steps),
                    depart_at=self.req.depart_at,
                    arrive_at=min_to_hm(lab.arrival),
                    steps=steps,
                    node_sequence=seq,
                )
            )
            if len(options) >= 5:
                break

        for i, opt in enumerate(options):
            opt.rank = i + 1
        return RouteResponse(options=options, feasible=True)

    def _max_cont_stairs(self, steps: list[RouteStep]) -> int:
        best = run = 0
        for s in steps:
            if s.type == "walk" and s.steps:
                run += s.steps
                best = max(best, run)
            elif s.type == "elevator":
                run = 0
            elif s.type == "walk":
                pass
            # a walk step ending at a seat node breaks the run
            if s.type == "walk" and self.g.nodes.get(s.to_node_id) and (
                self.g.nodes[s.to_node_id].is_seat
                or self.g.nodes[s.to_node_id].kind == "seat"
            ):
                run = 0
        return best

    def _rebuild(self, lab: Label) -> tuple[list[RouteStep], list[str]]:
        steps: list[RouteStep] = []
        cur: Optional[Label] = lab
        while cur is not None and cur.step is not None:
            steps.append(cur.step)
            cur = cur.prev
        steps.reverse()
        seq = [self.req.origin_id]
        for s in steps:
            if s.type != "door":
                seq.append(s.to_node_id)
        return steps, seq


def plan_routes(doc: MapDocument, req: RouteRequest) -> RouteResponse:
    return RouteEngine(doc, req).solve()
