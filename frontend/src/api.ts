import type {
  MapDocument,
  MapNode,
  RouteOption,
  RouteRequest,
  RouteResponse,
  RerouteResponse,
  TripDetail,
  TripSummary,
  Window,
} from "./types";

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      msg = body.detail || body.message || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getMap: () => req<MapDocument>("/api/map"),
  saveMap: (doc: MapDocument) =>
    req<MapDocument>("/api/map", { method: "PUT", body: JSON.stringify(doc) }),
  resetMap: () => req<MapDocument>("/api/map/reset", { method: "POST" }),

  plan: (r: RouteRequest) =>
    req<RouteResponse>("/api/routes/plan", {
      method: "POST",
      body: JSON.stringify(r),
    }),

  listTrips: () => req<TripSummary[]>("/api/trips"),
  createTrip: (payload: {
    route: RouteOption;
    origin_id: string;
    dest_id: string;
    resident_name?: string;
    preferences?: Record<string, number>;
  }) =>
    req<TripSummary>("/api/trips", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getTrip: (id: string) => req<TripDetail>(`/api/trips/${id}`),
  advanceTrip: (id: string) =>
    req<TripSummary>(`/api/trips/${id}/advance`, { method: "POST" }),
  confirmTrip: (
    id: string,
    body: {
      node_id: string;
      now_time?: string;
      blocked_door_node_id?: string;
      blocked_elevator_id?: string;
    }
  ) =>
    req<RerouteResponse>(`/api/trips/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  undoTrip: (id: string) =>
    req<RerouteResponse>(`/api/trips/${id}/undo`, { method: "POST" }),
};

export function windowsText(windows?: Window[]): string {
  if (!windows || windows.length === 0) return "全天";
  return windows.map((w) => `${w.open}-${w.close}`).join("、");
}

export function windowsOpen(windows: Window[] | undefined, hm: string): boolean {
  if (!windows || windows.length === 0) return true;
  const t = toMin(hm);
  return windows.some((w) => toMin(w.open) <= t && t <= toMin(w.close));
}

export function toMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function addMin(hm: string, minutes: number): string {
  const t = toMin(hm) + minutes;
  const hh = Math.floor(t / 60) % 24;
  const mm = t % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export function nodeLabel(n: MapNode | undefined): string {
  return n?.name ?? "?";
}
