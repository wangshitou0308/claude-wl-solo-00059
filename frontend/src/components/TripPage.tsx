import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MapDocument,
  MapNode,
  RouteStep,
  TripDetail,
} from "../types";
import { api, nowHM, windowsText } from "../api";
import MapCanvas, { type LayerState } from "./MapCanvas";
import LayerControls from "./LayerControls";

type FixMode = "none" | "door" | "lost";

const DEFAULT_LAYERS: LayerState = {
  buildings: true,
  edges: true,
  elevators: true,
  route: true,
  nodes: true,
  labels: true,
};

export default function TripPage({
  tripId,
  doc,
  onExit,
}: {
  tripId: string;
  doc: MapDocument;
  onExit: () => void;
}) {
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fixMode, setFixMode] = useState<FixMode>("none");
  const [pickedNode, setPickedNode] = useState<string | null>(null);
  const [nowTime, setNowTime] = useState(nowHM());
  const [blockedDoor, setBlockedDoor] = useState<string | null>(null);
  const [blockedElev, setBlockedElev] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);

  const refresh = useCallback(async () => {
    const d = await api.getTrip(tripId);
    setDetail(d);
    return d;
  }, [tripId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const nodeById = useMemo(
    () => new Map(doc.nodes.map((n) => [n.id, n])),
    [doc]
  );

  const trip = detail?.trip;
  const summary = detail?.summary;
  const steps = trip?.route.steps ?? [];
  const idx = trip?.current_step_index ?? 0;
  const current = steps[Math.min(idx, steps.length - 1)];
  const done = idx >= steps.length;

  const completedNodeIds = useMemo(() => {
    const s = new Set<string>();
    (trip?.completed ?? []).forEach((st) => {
      if (st.type !== "door") s.add(st.to_node_id);
    });
    return s;
  }, [trip]);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const advance = () =>
    guard(async () => {
      await api.advanceTrip(tripId);
    });

  const undo = () =>
    guard(async () => {
      const r = await api.undoTrip(tripId);
      setMsg("已撤回：" + r.summary.current_name);
      setFixMode("none");
    });

  const startFix = (mode: FixMode) => {
    setFixMode(mode);
    setMsg("");
    setError("");
    setPickedNode(null);
    setBlockedElev(null);
    // default blocked target: the door/elevator involved in the current step
    const s = steps[idx];
    if (mode === "door") {
      if (s?.type === "door") setBlockedDoor(s.from_node_id);
      else if (s?.type === "elevator") {
        setBlockedElev(s.elevator_id ?? null);
        setBlockedDoor(null);
      } else setBlockedDoor(null);
    }
  };

  const clickNode = (n: MapNode) => {
    if (fixMode === "lost") setPickedNode(n.id);
    if (fixMode === "door" && (n.kind === "door" || n.kind === "entrance"))
      setBlockedDoor(n.id);
  };

  const confirmFix = () =>
    guard(async () => {
      if (!pickedNode) return;
      const r = await api.confirmTrip(tripId, {
        node_id: pickedNode,
        now_time: nowTime,
        blocked_door_node_id: blockedDoor ?? undefined,
        blocked_elevator_id: blockedElev ?? undefined,
      });
      setMsg(r.message);
      setFixMode("none");
      setPickedNode(null);
      setBlockedDoor(null);
      setBlockedElev(null);
    });

  if (!trip || !summary) return <div className="loading">正在载入行程…</div>;

  const fromNode = current ? nodeById.get(current.from_node_id) : null;
  const toNode = current ? nodeById.get(current.to_node_id) : null;
  const currentNode = nodeById.get(trip.current_node_id);
  const doors = doc.nodes.filter((n) => n.kind === "door" || n.kind === "entrance");
  const progress = Math.round((idx / Math.max(1, steps.length)) * 100);

  const pickableIds =
    fixMode === "lost"
      ? new Set(doc.nodes.map((n) => n.id))
      : fixMode === "door"
      ? new Set(doors.map((n) => n.id))
      : null;

  const waits = current?.waits.filter((w) => w.seconds > 0) ?? [];

  return (
    <div className="trip-page">
      <header className="trip-header">
        <button className="btn-small" onClick={onExit}>
          ← 返回首页
        </button>
        <div className="trip-title">
          <div className="big">
            {trip.resident_name ? `${trip.resident_name} · ` : ""}
            {summary.origin_name} → {summary.dest_name}
          </div>
          <div className="muted">
            预计 {summary.arrive_at} 到达 · 状态：
            {summary.status === "completed" ? "已到达 🎉" : summary.status === "stuck" ? "需要帮助" : "进行中"}
          </div>
        </div>
        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${done ? 100 : progress}%` }} />
          </div>
          <div className="muted center">
            第 {Math.min(idx + (done ? 0 : 1), steps.length)} / {steps.length} 步 ·
            已完成 {idx} 步
          </div>
        </div>
      </header>

      <div className="trip-grid">
        {/* 一步一屏卡片 */}
        <div className="card-col">
          {done ? (
            <ArrivalCard summary={summary} onExit={onExit} />
          ) : (
            <StepCard
              step={current}
              index={idx}
              total={steps.length}
              fromName={fromNode?.name ?? ""}
              toName={toNode?.name ?? ""}
              waits={waits}
              elevators={doc.elevators}
              nodeById={nodeById}
            />
          )}

          {trip.reroute_error && (
            <div className="error big-error">
              ⚠ {trip.reroute_error}
              <div className="muted" style={{ marginTop: 8 }}>
                可点“撤回”，或确认附近的其他地标重新计算。
              </div>
            </div>
          )}

          {msg && <div className="success">✓ {msg}</div>}
          {error && <div className="error">⚠ {error}</div>}

          {!done && fixMode === "none" && (
            <div className="action-grid">
              <button className="btn-success big-btn" disabled={busy} onClick={advance}>
                ✓ 我已到达「{toNode?.name}」
              </button>
              <div className="action-row">
                <button className="btn-warn" disabled={busy} onClick={() => startFix("door")}>
                  🚪 门没开/电梯坏了
                </button>
                <button className="btn-warn" disabled={busy} onClick={() => startFix("lost")}>
                  🧭 我走到别处了
                </button>
                <button className="btn-secondary" disabled={busy || trip.history.length === 0} onClick={undo}>
                  ↩ 撤回误点
                </button>
              </div>
            </div>
          )}

          {fixMode !== "none" && (
            <div className="fix-panel">
              <h3>
                {fixMode === "door" ? "门关闭/电梯停运，从当前位置重算余程" : "确认您当前实际所在的地标"}
              </h3>
              <div className="muted">
                已走完的 {trip.completed.length} 个步骤会保留，只重新安排后面的路。
              </div>

              <label className="field">
                <span>现在时刻</span>
                <input type="time" value={nowTime} onChange={(e) => setNowTime(e.target.value)} />
              </label>

              {fixMode === "lost" && (
                <div className="field">
                  <span>我现在在（可在地图上点选蓝色虚圈地标）</span>
                  <select value={pickedNode ?? ""} onChange={(e) => setPickedNode(e.target.value)}>
                    <option value="" disabled>
                      请选择当前地标…
                    </option>
                    {doc.nodes
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, "zh"))
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {fixMode === "door" && (
                <>
                  <div className="field">
                    <span>过不去的门（地图红色门可点选）</span>
                    <select value={blockedDoor ?? ""} onChange={(e) => setBlockedDoor(e.target.value || null)}>
                      <option value="">（无）</option>
                      {doors.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}（{windowsText(n.windows)}）
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <span>停运的电梯</span>
                    <select value={blockedElev ?? ""} onChange={(e) => setBlockedElev(e.target.value || null)}>
                      <option value="">（无）</option>
                      {doc.elevators.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}（{windowsText(e.windows)}）
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <span>您现在所在位置</span>
                    <select value={pickedNode ?? ""} onChange={(e) => setPickedNode(e.target.value)}>
                      <option value="" disabled>
                        请选择当前地标…
                      </option>
                      {doc.nodes
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name, "zh"))
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}

              <div className="action-row">
                <button
                  className="btn-primary"
                  disabled={busy || !pickedNode}
                  onClick={confirmFix}
                >
                  确认位置并重算余程
                </button>
                <button className="btn-secondary" onClick={() => setFixMode("none")}>
                  取消
                </button>
                <button className="btn-secondary" disabled={busy || trip.history.length === 0} onClick={undo}>
                  ↩ 撤回
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 地图 */}
        <div className="panel map-panel">
          <LayerControls layers={layers} onChange={setLayers} />
          <div className="map-wrap">
            <MapCanvas
              doc={doc}
              nowTime={nowTime}
              layers={layers}
              routeSteps={steps}
              currentNodeId={trip.current_node_id}
              completedNodeIds={completedNodeIds}
              blockedNodeIds={blockedDoor ? new Set([blockedDoor]) : new Set()}
              selectedNodeId={pickedNode}
              selectableNodeIds={pickableIds}
              onNodeClick={fixMode === "none" ? undefined : clickNode}
              highlightElevatorId={current?.elevator_id ?? null}
            />
          </div>
          <div className="current-banner">
            <span className="pulse-dot" />
            当前位置：<b>{currentNode?.name}</b>
            {fixMode === "none" && !done && toNode && (
              <span className="muted">　下一步到：{toNode.name}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ step card

function StepCard({
  step,
  index,
  total,
  fromName,
  toName,
  waits,
  elevators,
  nodeById,
}: {
  step: RouteStep;
  index: number;
  total: number;
  fromName: string;
  toName: string;
  waits: { reason: string; target_name: string; seconds: number }[];
  elevators: MapDocument["elevators"];
  nodeById: Map<string, MapNode>;
}) {
  const icon = step.type === "elevator" ? "🛗" : step.type === "door" ? "🚪" : "🚶";
  const tone =
    step.type === "elevator" ? "tone-elev" : step.type === "door" ? "tone-door" : "tone-walk";
  const ev = step.elevator_id
    ? elevators.find((e) => e.id === step.elevator_id)
    : null;
  const target = nodeById.get(step.to_node_id);

  return (
    <div className={`step-card ${tone}`}>
      <div className="step-top">
        <div className="step-no">
          第 {index + 1} 步 <span className="muted">/ 共 {total} 步</span>
        </div>
        <div className="step-icon">{icon}</div>
      </div>

      <div className="step-places">
        <div className="place">
          <div className="muted">您现在在</div>
          <div className="place-name">{fromName}</div>
        </div>
        <div className="place-arrow">→</div>
        <div className="place">
          <div className="muted">{step.type === "door" ? "停留通过" : "接下来到达"}</div>
          <div className="place-name accent">{step.type === "door" ? fromName : toName}</div>
        </div>
      </div>

      <div className="step-desc">{step.description}</div>

      {step.type === "elevator" && ev && target && (
        <div className="key-facts">
          <div className="fact">
            <span className="fact-label">应乘电梯</span>
            <span className="fact-value">{ev.name}</span>
          </div>
          <div className="fact">
            <span className="fact-label">下梯楼层</span>
            <span className="fact-value big">{target.floor} 层</span>
          </div>
          <div className="fact">
            <span className="fact-label">该梯停靠</span>
            <span className="fact-value">
              {ev.stops.map((s) => s.floor).join("、")} 层
            </span>
          </div>
        </div>
      )}

      {step.detail && <div className="step-detail">ℹ {step.detail}</div>}
      {step.steps > 0 && (
        <div className="step-warn">🪜 本段有 {step.steps} 级台阶，请扶稳扶手慢行</div>
      )}
      {step.length_m >= 60 && (
        <div className="step-detail">📏 步行约 {step.length_m} 米</div>
      )}

      {waits.length > 0 && (
        <div className="wait-box">
          {waits.map((w, i) => (
            <div key={i} className="wait-item">
              ⏰ 等待：<b>{w.target_name}</b>，约需等 <b className="big">{Math.round(w.seconds / 60)}</b> 分钟
              <div className="muted">
                {w.reason === "door"
                  ? "门到点才开，可在附近座椅休息，开门后再通过"
                  : w.reason === "corridor"
                  ? "连廊到点开放，请等待开放后通过"
                  : "包括等候轿厢时间"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArrivalCard({
  summary,
  onExit,
}: {
  summary: TripDetail["summary"];
  onExit: () => void;
}) {
  return (
    <div className="step-card tone-done">
      <div className="arrival-emoji">🎉</div>
      <h2 className="center">已到达「{summary.dest_name}」</h2>
      <p className="center big">
        {summary.origin_name} 出发 · {summary.depart_at}–{summary.arrive_at}
      </p>
      <p className="center muted">全程共 {summary.total_steps} 步，路上辛苦了，好好休息～</p>
      <button className="btn-primary big-btn" onClick={onExit}>
        返回首页
      </button>
    </div>
  );
}
