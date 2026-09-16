// Mirrors backend/app/models.py

export interface Window {
  open: string;
  close: string;
  note?: string;
}

export interface Building {
  id: string;
  name: string;
  x: number;
  y: number;
  floors: number[];
  notes?: string;
}

export type NodeKind = "landing" | "door" | "seat" | "poi" | "entrance";
export type PoiType = "canteen" | "activity" | "other";

export interface MapNode {
  id: string;
  name: string;
  building_id: string | null;
  floor: number | null;
  x: number;
  y: number;
  kind: NodeKind;
  poi_type?: PoiType | null;
  is_seat: boolean;
  windows: Window[];
  note?: string;
}

export type EdgeKind = "flat" | "ramp" | "stairs" | "corridor" | "sidewalk";

export interface WalkEdge {
  id: string;
  a: string;
  b: string;
  kind: EdgeKind;
  length_m: number;
  steps: number;
  windows: Window[];
  note?: string;
}

export interface ElevatorStop {
  node_id: string;
  floor: number;
}

export interface Elevator {
  id: string;
  name: string;
  building_id: string;
  stops: ElevatorStop[];
  wait_seconds: number;
  seconds_per_floor: number;
  windows: Window[];
  x: number;
  y: number;
  note?: string;
}

export interface MapDocument {
  version: number;
  buildings: Building[];
  nodes: MapNode[];
  edges: WalkEdge[];
  elevators: Elevator[];
}

export interface RouteRequest {
  origin_id: string;
  dest_id: string;
  depart_at: string;
  max_continuous_walk_m: number;
  max_stairs: number;
  blocked_node_ids?: string[];
  blocked_elevator_ids?: string[];
}

export type WaitReason = "door" | "corridor" | "elevator";

export interface WaitInfo {
  reason: WaitReason;
  target_name: string;
  seconds: number;
}

export type StepType = "walk" | "elevator" | "door";

export interface RouteStep {
  type: StepType;
  from_node_id: string;
  to_node_id: string;
  edge_id?: string | null;
  elevator_id?: string | null;
  description: string;
  detail: string;
  length_m: number;
  steps: number;
  floors: number;
  traverse_seconds: number;
  waits: WaitInfo[];
}

export interface RouteOption {
  rank: number;
  total_steps: number;
  total_walk_m: number;
  total_wait_seconds: number;
  total_seconds: number;
  elevator_rides: number;
  transfers: number;
  longest_continuous_walk_m: number;
  max_stairs_between_rest: number;
  depart_at: string;
  arrive_at: string;
  steps: RouteStep[];
  node_sequence: string[];
}

export interface RouteResponse {
  options: RouteOption[];
  feasible: boolean;
  message: string;
}

export interface TripSummary {
  id: string;
  status: string;
  resident_name: string;
  origin_name: string;
  dest_name: string;
  current_name: string;
  current_step_index: number;
  total_steps: number;
  depart_at: string;
  arrive_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  resident_name: string;
  origin_id: string;
  dest_id: string;
  preferences: Record<string, number>;
  route: RouteOption;
  current_node_id: string;
  current_step_index: number;
  completed: RouteStep[];
  history: unknown[];
  reroute_error?: string;
}

export interface TripDetail {
  summary: TripSummary;
  status: string;
  updated_at: string;
  trip: Trip;
}

export interface RerouteResponse {
  summary: TripSummary;
  route: RouteOption | null;
  message: string;
}
