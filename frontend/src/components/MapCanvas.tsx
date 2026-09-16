import { useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  EdgeKind,
  Elevator,
  MapDocument,
  MapNode,
  RouteStep,
  WalkEdge,
} from "../types";
import { windowsOpen } from "../api";

export interface LayerState {
  buildings: boolean;
  edges: boolean;
  elevators: boolean;
  route: boolean;
  nodes: boolean;
  labels: boolean;
}

interface Props {
  doc: MapDocument;
  nowTime: string;
  layers: LayerState;
  routeSteps?: RouteStep[];
  currentNodeId?: string | null;
  completedNodeIds?: Set<string>;
  blockedNodeIds?: Set<string>;
  selectedNodeId?: string | null;
  selectableNodeIds?: Set<string> | null;
  onNodeClick?: (n: MapNode) => void;
  onNodeDrag?: (n: MapNode, x: number, y: number) => void;
  highlightElevatorId?: string | null;
}

const EDGE_STYLE: Record<
  EdgeKind,
  { stroke: string; width: number; dash?: string }
> = {
  flat: { stroke: "#94a3b8", width: 3 },
  ramp: { stroke: "#38bdf8", width: 5, dash: "10 6" },
  stairs: { stroke: "#f59e0b", width: 4 },
  corridor: { stroke: "#a78bfa", width: 4, dash: "12 6" },
  sidewalk: { stroke: "#86efac", width: 4 },
};

const KIND_COLOR: Record<string, string> = {
  landing: "#64748b",
  seat: "#0ea5e9",
  canteen: "#ea580c",
  activity: "#7c3aed",
  other: "#0d9488",
};

function mid(a: MapNode, b: MapNode) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function StairTicks({ a, b }: { a: MapNode; b: MapNode }) {
  const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 16));
  const ticks = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    ticks.push(
      <line
        key={i}
        x1={cx - nx * 5}
        y1={cy - ny * 5}
        x2={cx + nx * 5}
        y2={cy + ny * 5}
        stroke="#b45309"
        strokeWidth={2}
      />
    );
  }
  return <g>{ticks}</g>;
}

function ElevatorShape({
  ev,
  doc,
  nowTime,
  highlight,
}: {
  ev: Elevator;
  doc: MapDocument;
  nowTime: string;
  highlight: boolean;
}) {
  const stops = ev.stops
    .map((s) => doc.nodes.find((n) => n.id === s.node_id))
    .filter((n): n is MapNode => !!n);
  if (stops.length < 2) return null;
  const xs = stops.map((s) => s.x);
  const ys = stops.map((s) => s.y);
  const minX = Math.min(...xs, ev.x) - 26;
  const maxX = Math.max(...xs, ev.x) + 26;
  const minY = Math.min(...ys, ev.y) - 20;
  const maxY = Math.max(...ys, ev.y) + 20;
  const open = windowsOpen(ev.windows, nowTime);
  return (
    <g>
      <rect
        x={minX}
        y={minY}
        width={maxX - minX}
        height={maxY - minY}
        rx={10}
        fill={highlight ? "#fef3c7" : "#f8fafc"}
        stroke={highlight ? "#d97706" : open ? "#475569" : "#dc2626"}
        strokeWidth={highlight ? 3 : 2}
        strokeDasharray="6 4"
      />
      {stops.map((s) => (
        <line
          key={s.id}
          x1={s.x - 14}
          y1={s.y}
          x2={s.x + 14}
          y2={s.y}
          stroke="#64748b"
          strokeWidth={2}
        />
      ))}
      <text
        x={(minX + maxX) / 2}
        y={minY + 16}
        textAnchor="middle"
        fontSize={12}
        fill={open ? "#334155" : "#dc2626"}
        fontWeight="bold"
      >
        ▣ {ev.name}
        {!open ? "（停开）" : ""}
      </text>
    </g>
  );
}

function NodeIcon({
  n,
  open,
  blocked,
  selected,
  selectable,
  completed,
  onClick,
  onPointerDown,
}: {
  n: MapNode;
  open: boolean;
  blocked: boolean;
  selected: boolean;
  selectable: boolean;
  completed: boolean;
  onClick?: () => void;
  onPointerDown?: (ev: ReactPointerEvent) => void;
}) {
  const r = 11;
  const fill =
    n.kind === "door" || n.kind === "entrance"
      ? blocked || !open
        ? "#fecaca"
        : "#bbf7d0"
      : n.kind === "seat"
      ? "#e0f2fe"
      : n.kind === "poi"
      ? "#ffedd5"
      : "#e2e8f0";
  const stroke =
    n.kind === "door" || n.kind === "entrance"
      ? blocked
        ? "#dc2626"
        : open
        ? "#16a34a"
        : "#dc2626"
      : n.kind === "poi"
      ? KIND_COLOR[n.poi_type ?? "other"]
      : "#475569";

  return (
    <g
      transform={`translate(${n.x},${n.y})`}
      style={{ cursor: onClick || onPointerDown ? "pointer" : "default" }}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {selected && <circle r={r + 8} fill="none" stroke="#2563eb" strokeWidth={3} />}
      {selectable && (
        <circle r={r + 5} fill="none" stroke="#2563eb" strokeWidth={2} strokeDasharray="3 3">
          <animate attributeName="r" values={`${r + 4};${r + 9};${r + 4}`} dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}
      {n.kind === "seat" ? (
        <path
          d="M-7,-2 L-7,-8 L7,-8 L7,-2 M-7,-2 L-7,7 L-5,7 L-5,-2 M7,-2 L7,7 L5,7 L5,-2"
          fill="none"
          stroke="#0284c7"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      ) : n.kind === "door" || n.kind === "entrance" ? (
        <path
          d={`M${-r},${r} L${-r},${-r + 3} A ${r} ${r} 0 0 1 ${r},${-r + 3} L${r},${r} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={2.4}
        />
      ) : n.kind === "poi" ? (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={4} fill={fill} stroke={stroke} strokeWidth={2.4} />
      ) : (
        <circle r={r} fill={fill} stroke={stroke} strokeWidth={2.2} />
      )}
      {n.kind === "poi" && (
        <text y={4} textAnchor="middle" fontSize={12}>
          {n.poi_type === "canteen" ? "🍚" : n.poi_type === "activity" ? "🎲" : "★"}
        </text>
      )}
      {(n.kind === "door" || n.kind === "entrance") && (
        <text y={4} textAnchor="middle" fontSize={11}>
          {open ? "🚪" : "🔒"}
        </text>
      )}
      {n.kind === "landing" && n.is_seat && (
        <text y={4} textAnchor="middle" fontSize={10}>
          💺
        </text>
      )}
      {completed && (
        <circle cx={r - 2} cy={-r + 2} r={7} fill="#16a34a" />
      )}
      {completed && (
        <text x={r - 2} y={-r + 5} textAnchor="middle" fontSize={9} fill="#fff" fontWeight="bold">
          ✓
        </text>
      )}
    </g>
  );
}

export default function MapCanvas({
  doc,
  nowTime,
  layers,
  routeSteps,
  currentNodeId,
  completedNodeIds,
  blockedNodeIds,
  selectedNodeId,
  selectableNodeIds,
  onNodeClick,
  onNodeDrag,
  highlightElevatorId,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const nodeById = useMemo(
    () => new Map(doc.nodes.map((n) => [n.id, n])),
    [doc]
  );

  function toSvgPoint(ev: ReactPointerEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = new DOMPoint(ev.clientX, ev.clientY);
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  function onNodePointerDown(n: MapNode, ev: ReactPointerEvent) {
    if (!onNodeDrag) return;
    ev.preventDefault();
    drag.current = { id: n.id, moved: false };
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  }

  function onPointerMove(ev: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    const p = toSvgPoint(ev);
    const n = nodeById.get(d.id);
    if (n) onNodeDrag?.(n, Math.max(20, Math.min(1220, p.x)), Math.max(20, Math.min(680, p.y)));
  }

  function onPointerUp() {
    drag.current = null;
  }

  const upcomingWalk = new Set<string>();
  const doneWalk = new Set<string>();
  const upcomingElev = [] as { ev: Elevator; from: MapNode; to: MapNode }[];
  const doneElev = [] as { ev: Elevator; from: MapNode; to: MapNode }[];
  const completedSet = completedNodeIds ?? new Set<string>();
  if (routeSteps) {
    for (const s of routeSteps) {
      const isDone = s.type !== "door" && completedSet.has(s.to_node_id);
      if (s.type === "walk" && s.edge_id) {
        (isDone ? doneWalk : upcomingWalk).add(s.edge_id);
      }
      if (s.type === "elevator") {
        const ev = doc.elevators.find((e) => e.id === s.elevator_id);
        const from = nodeById.get(s.from_node_id);
        const to = nodeById.get(s.to_node_id);
        if (ev && from && to) {
          (isDone ? doneElev : upcomingElev).push({ ev, from, to });
        }
      }
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1240 700"
      className="map-svg"
      role="img"
      aria-label="社区分层路线图"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1" />
        </pattern>
        <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#2563eb" />
        </marker>
        <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#16a34a" />
        </marker>
      </defs>

      <rect width="1240" height="700" fill="#f1f5f9" />
      <rect width="1240" height="700" fill="url(#grid)" />

      {/* 图层1：楼栋 */}
      {layers.buildings &&
        doc.buildings.map((b) => (
          <g key={b.id}>
            <rect
              x={b.x - 70}
              y={b.y - 40}
              width={140}
              height={560}
              rx={14}
              fill="#ffffff"
              stroke="#cbd5e1"
              strokeWidth={2}
            />
            <rect x={b.x - 70} y={b.y - 40} width={140} height={34} rx={14} fill="#e2e8f0" />
            <text x={b.x} y={b.y - 18} textAnchor="middle" fontSize={15} fontWeight="bold" fill="#1e293b">
              {b.name}
            </text>
            <text x={b.x + 78} y={b.y - 18} fontSize={11} fill="#64748b">
              楼层 {b.floors.join("/")}
            </text>
          </g>
        ))}

      {/* 图层2：步行连线 */}
      {layers.edges && (
        <g>
          {doc.edges.map((e: WalkEdge) => {
            const a = nodeById.get(e.a);
            const b = nodeById.get(e.b);
            if (!a || !b) return null;
            const st = EDGE_STYLE[e.kind];
            const edgeOpen = windowsOpen(e.windows, nowTime);
            const onRoute = upcomingWalk.has(e.id) || doneWalk.has(e.id);
            return (
              <g key={e.id} opacity={onRoute ? 0.35 : 1}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={edgeOpen ? st.stroke : "#ef4444"}
                  strokeWidth={st.width}
                  strokeDasharray={edgeOpen ? st.dash : "4 4"}
                  strokeLinecap="round"
                />
                {e.kind === "stairs" && <StairTicks a={a} b={b} />}
                {(e.length_m >= 50 || e.steps > 0) &&
                  (() => {
                    const m = mid(a, b);
                    return (
                      <text x={m.x} y={m.y - 7} textAnchor="middle" fontSize={10} fill="#475569">
                        {e.steps ? `${e.steps}级` : `${e.length_m}m`}
                      </text>
                    );
                  })()}
              </g>
            );
          })}
        </g>
      )}

      {/* 图层3：电梯 */}
      {layers.elevators && (
        <g>
          {doc.elevators.map((ev) => (
            <ElevatorShape
              key={ev.id}
              ev={ev}
              doc={doc}
              nowTime={nowTime}
              highlight={highlightElevatorId === ev.id}
            />
          ))}
        </g>
      )}

      {/* 图层4：路线叠加 */}
      {layers.route && routeSteps && (
        <g>
          {routeSteps
            .filter((s) => s.type === "walk")
            .map((s) => {
              const a = nodeById.get(s.from_node_id);
              const b = nodeById.get(s.to_node_id);
              if (!a || !b) return null;
              const isDone = completedSet.has(b.id);
              return (
                <line
                  key={`r-${s.from_node_id}-${s.to_node_id}-${s.edge_id ?? ""}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={isDone ? "#16a34a" : "#2563eb"}
                  strokeWidth={6}
                  strokeLinecap="round"
                  markerEnd={`url(#${isDone ? "arrow-green" : "arrow-blue"})`}
                  opacity={0.9}
                />
              );
            })}
          {[...doneElev, ...upcomingElev].map(({ ev, from, to }, i) => {
            const isDone = i < doneElev.length;
            const cx = ev.x;
            const color = isDone ? "#16a34a" : "#ea580c";
            return (
              <polyline
                key={`e-${ev.id}-${from.id}-${to.id}-${i}`}
                points={`${from.x},${from.y} ${cx},${from.y} ${cx},${to.y} ${to.x},${to.y}`}
                fill="none"
                stroke={color}
                strokeWidth={5}
                strokeDasharray="8 5"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd={`url(#${isDone ? "arrow-green" : "arrow-blue"})`}
              />
            );
          })}
          {routeSteps
            .filter((s) => s.type === "door")
            .map((s) => {
              const n = nodeById.get(s.from_node_id);
              if (!n) return null;
              const waiting = s.waits.some((w) => w.seconds > 0);
              return (
                <g key={`d-${s.from_node_id}-${s.detail}`} transform={`translate(${n.x + 18},${n.y - 20})`}>
                  <circle r={10} fill={waiting ? "#f59e0b" : "#0891b2"} />
                  <text y={4} textAnchor="middle" fontSize={11} fill="#fff">
                    {waiting ? "⏰" : "卡"}
                  </text>
                </g>
              );
            })}
        </g>
      )}

      {/* 图层5：节点 */}
      {layers.nodes && (
        <g>
          {doc.nodes.map((n) => (
            <NodeIcon
              key={n.id}
              n={n}
              open={windowsOpen(n.windows, nowTime)}
              blocked={blockedNodeIds?.has(n.id) ?? false}
              selected={selectedNodeId === n.id}
              selectable={!!selectableNodeIds?.has(n.id)}
              completed={completedSet.has(n.id)}
              onClick={onNodeClick ? () => onNodeClick(n) : undefined}
              onPointerDown={(ev) => onNodePointerDown(n, ev)}
            />
          ))}
        </g>
      )}

      {/* 图层6：标注 */}
      {layers.labels && (
        <g>
          {doc.nodes.map((n) => {
            const open = windowsOpen(n.windows, nowTime);
            return (
              <g key={`l-${n.id}`} pointerEvents="none">
                <text
                  x={n.x}
                  y={n.y + 28}
                  textAnchor="middle"
                  fontSize={12.5}
                  fontWeight={n.kind === "poi" ? "bold" : "normal"}
                  fill={n.kind === "poi" ? KIND_COLOR[n.poi_type ?? "other"] : "#1e293b"}
                  style={{ paintOrder: "stroke" }}
                  stroke="#f8fafc"
                  strokeWidth={3}
                >
                  {n.name}
                </text>
                {n.windows.length > 0 && (
                  <text x={n.x} y={n.y + 42} textAnchor="middle" fontSize={10} fill={open ? "#15803d" : "#b91c1c"}>
                    {n.windows.map((w) => `${w.open}-${w.close}`).join(" ")}
                    {!open ? " 关闭" : ""}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* 当前位置脉冲 */}
      {currentNodeId && nodeById.get(currentNodeId) && (
        <g transform={`translate(${nodeById.get(currentNodeId)!.x},${nodeById.get(currentNodeId)!.y})`} pointerEvents="none">
          <circle r={14} fill="none" stroke="#dc2626" strokeWidth={3}>
            <animate attributeName="r" values="12;24" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.1" dur="1.4s" repeatCount="indefinite" />
          </circle>
          <circle r={7} fill="#dc2626" stroke="#fff" strokeWidth={2} />
        </g>
      )}
    </svg>
  );
}
