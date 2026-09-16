"""Pydantic models shared by the API and the routing engine."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# ---------------------------------------------------------------- time windows


class Window(BaseModel):
    """Daily repeating opening period, e.g. 08:00-20:00. Closed if empty."""

    open: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    close: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    note: str = ""


# -------------------------------------------------------------------- map model


class Building(BaseModel):
    id: str
    name: str
    x: float = 0
    y: float = 0
    floors: list[int] = Field(default_factory=list, description="楼层编号，坡地小区可为负/不连续")
    notes: str = ""


class MapNode(BaseModel):
    id: str
    name: str
    building_id: Optional[str] = None
    floor: Optional[int] = None
    x: float = 0
    y: float = 0
    kind: Literal[
        "landing",  # 楼层平台 / 普通节点
        "door",  # 门禁 / 大门
        "seat",  # 休息座椅
        "poi",  # 食堂、活动室等目的地
        "entrance",  # 楼栋出入口
    ] = "landing"
    poi_type: Optional[Literal["canteen", "activity", "other"]] = None
    is_seat: bool = False
    windows: list[Window] = Field(default_factory=list, description="门禁/开放时段")
    note: str = ""


class WalkEdge(BaseModel):
    id: str
    a: str
    b: str
    kind: Literal["flat", "ramp", "stairs", "corridor", "sidewalk"] = "flat"
    length_m: float = 0
    steps: int = 0
    windows: list[Window] = Field(default_factory=list, description="连廊开放时段")
    note: str = ""


class ElevatorStop(BaseModel):
    node_id: str
    floor: int


class Elevator(BaseModel):
    id: str
    name: str
    building_id: str
    stops: list[ElevatorStop] = Field(default_factory=list, description="仅停部分楼层")
    wait_seconds: int = 60
    seconds_per_floor: int = 5
    windows: list[Window] = Field(default_factory=list, description="电梯开放时段")
    x: float = 0
    y: float = 0
    note: str = ""


class MapDocument(BaseModel):
    version: int = 1
    buildings: list[Building] = Field(default_factory=list)
    nodes: list[MapNode] = Field(default_factory=list)
    edges: list[WalkEdge] = Field(default_factory=list)
    elevators: list[Elevator] = Field(default_factory=list)


# --------------------------------------------------------------- route request


class RouteRequest(BaseModel):
    origin_id: str
    dest_id: str
    depart_at: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    max_continuous_walk_m: float = 200
    max_stairs: int = 24
    blocked_node_ids: list[str] = Field(default_factory=list)
    blocked_elevator_ids: list[str] = Field(default_factory=list)


class WaitInfo(BaseModel):
    reason: Literal["door", "corridor", "elevator"]
    target_name: str
    seconds: int


class RouteStep(BaseModel):
    type: Literal["walk", "elevator", "door"]
    from_node_id: str
    to_node_id: str
    edge_id: Optional[str] = None
    elevator_id: Optional[str] = None
    description: str
    detail: str = ""
    length_m: float = 0
    steps: int = 0
    floors: int = 0
    traverse_seconds: int = 0
    waits: list[WaitInfo] = Field(default_factory=list)


class RouteOption(BaseModel):
    rank: int
    total_steps: int
    total_walk_m: float
    total_wait_seconds: int
    total_seconds: int
    elevator_rides: int
    transfers: int
    longest_continuous_walk_m: float
    max_stairs_between_rest: int
    depart_at: str
    arrive_at: str
    steps: list[RouteStep]
    node_sequence: list[str]


class RouteResponse(BaseModel):
    options: list[RouteOption]
    feasible: bool
    message: str = ""


# -------------------------------------------------------------------- sessions


class CreateTripRequest(BaseModel):
    route: RouteOption
    origin_id: str
    dest_id: str
    resident_name: str = ""
    preferences: dict = Field(default_factory=dict)


class TripSummary(BaseModel):
    id: str
    status: str
    resident_name: str
    origin_name: str
    dest_name: str
    current_name: str
    current_step_index: int
    total_steps: int
    depart_at: str
    arrive_at: str
    updated_at: str


class ConfirmPositionRequest(BaseModel):
    node_id: str
    now_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    blocked_door_node_id: Optional[str] = None
    blocked_elevator_id: Optional[str] = None


class RerouteResponse(BaseModel):
    summary: TripSummary
    route: Optional[RouteOption] = None
    message: str = ""


class UndoResponse(BaseModel):
    summary: TripSummary
