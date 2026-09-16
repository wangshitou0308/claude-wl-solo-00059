import { useMemo, useState } from "react";
import type { MapDocument, MapNode, RouteOption, RouteResponse } from "../types";
import { api, nowHM } from "../api";
import MapCanvas, { type LayerState } from "./MapCanvas";
import LayerControls from "./LayerControls";

const DEFAULT_LAYERS: LayerState = {
  buildings: true,
  edges: true,
  elevators: true,
  route: true,
  nodes: true,
  labels: true,
};

export default function PlanPage({
  doc,
  onStarted,
}: {
  doc: MapDocument;
  onStarted: (tripId: string) => void;
}) {
  const [origin, setOrigin] = useState("b1-3-home");
  const [dest, setDest] = useState("b3-1-canteen");
  const [depart, setDepart] = useState(nowHM());
  const [maxWalk, setMaxWalk] = useState(200);
  const [maxStairs, setMaxStairs] = useState(24);
  const [name, setName] = useState("");
  const [pickMode, setPickMode] = useState<"origin" | "dest" | null>(null);
  const [resp, setResp] = useState<RouteResponse | null>(null);
  const [chosen, setChosen] = useState<RouteOption | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);

  const nodeById = useMemo(
    () => new Map(doc.nodes.map((n) => [n.id, n])),
    [doc]
  );

  async function plan() {
    setBusy(true);
    setError("");
    try {
      const r = await api.plan({
        origin_id: origin,
        dest_id: dest,
        depart_at: depart,
        max_continuous_walk_m: maxWalk,
        max_stairs: maxStairs,
      });
      setResp(r);
      setChosen(r.feasible && r.options.length ? r.options[0] : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!chosen) return;
    setBusy(true);
    try {
      const s = await api.createTrip({
        route: chosen,
        origin_id: origin,
        dest_id: dest,
        resident_name: name,
        preferences: {
          max_continuous_walk_m: maxWalk,
          max_stairs: maxStairs,
        },
      });
      onStarted(s.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function clickNode(n: MapNode) {
    if (pickMode === "origin") setOrigin(n.id);
    else if (pickMode === "dest") setDest(n.id);
    setPickMode(null);
  }

  const origins = doc.nodes
    .filter((n) => n.kind !== "poi")
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const dests = doc.nodes
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "zh"));

  return (
    <div className="page-grid">
      <aside className="panel form-panel">
        <h2>① 填写出行信息</h2>
        <label className="field">
          <span>您的称呼（可选）</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：王阿姨" />
        </label>

        <div className="field">
          <span>出发地</span>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {origins.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span>目的地</span>
          <select value={dest} onChange={(e) => setDest(e.target.value)}>
            {dests.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <div className="pick-row">
          <button
            type="button"
            className={`btn-small ${pickMode === "origin" ? "active" : ""}`}
            onClick={() => setPickMode("origin")}
          >
            地图上点选出发地
          </button>
          <button
            type="button"
            className={`btn-small ${pickMode === "dest" ? "active" : ""}`}
            onClick={() => setPickMode("dest")}
          >
            地图上点选目的地
          </button>
        </div>

        <label className="field">
          <span>出发时刻</span>
          <input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} />
        </label>

        <label className="field">
          <span>
            可接受连续步行 <b className="big">{maxWalk}</b> 米
            <small>（两次休息/乘梯之间）</small>
          </span>
          <input
            type="range"
            min={20}
            max={400}
            step={10}
            value={maxWalk}
            onChange={(e) => setMaxWalk(Number(e.target.value))}
          />
        </label>

        <label className="field">
          <span>
            可接受楼梯 <b className="big">{maxStairs}</b> 级
          </span>
          <input
            type="range"
            min={0}
            max={80}
            step={2}
            value={maxStairs}
            onChange={(e) => setMaxStairs(Number(e.target.value))}
          />
        </label>

        <button className="btn-primary big-btn" disabled={busy} onClick={plan}>
          🔍 查询可行路线
        </button>
        {error && <div className="error">{error}</div>}
        {pickMode && (
          <div className="hint">请在右侧地图上点击一个地标作为{pickMode === "origin" ? "出发地" : "目的地"}</div>
        )}

        {resp && !resp.feasible && (
          <div className="error big-error">
            ⚠ {resp.message}
            <div className="muted" style={{ marginTop: 8 }}>
              可改晚/改早出发时刻、放宽步行距离或楼梯级数后再试。
            </div>
          </div>
        )}

        {resp?.feasible && chosen && (
          <>
            <h2>② 选择路线方案</h2>
            <div className="option-list">
              {resp.options.map((o) => (
                <button
                  key={o.rank}
                  className={`option-card ${chosen.rank === o.rank ? "chosen" : ""}`}
                  onClick={() => setChosen(o)}
                >
                  <div className="option-rank">方案 {o.rank}</div>
                  <div className="option-metrics">
                    <span title="全程台阶级数">🪜 {o.total_steps}级</span>
                    <span title="最长连续步行">📏 {o.longest_continuous_walk_m}m</span>
                    <span title="电梯换乘次数">🔄 {o.transfers}换乘</span>
                    <span title="步行总长">🚶 {o.total_walk_m}m</span>
                  </div>
                  <div className="option-metrics muted">
                    <span>⏱ {o.depart_at}→{o.arrive_at}</span>
                    <span>梯×{o.elevator_rides}</span>
                    <span>等{o.total_wait_seconds / 60}分</span>
                  </div>
                </button>
              ))}
            </div>
            <button className="btn-success big-btn" disabled={busy} onClick={start}>
              ③ 开始一步一步引导 →
            </button>
          </>
        )}
      </aside>

      <section className="panel map-panel">
        <LayerControls layers={layers} onChange={setLayers} />
        <div className="map-wrap">
          <MapCanvas
            doc={doc}
            nowTime={depart}
            layers={layers}
            routeSteps={chosen?.steps}
            currentNodeId={origin}
            selectedNodeId={pickMode ? null : chosen ? origin : null}
            onNodeClick={pickMode ? clickNode : undefined}
          />
        </div>
        {chosen && (
          <div className="route-summary">
            <b>推荐走法：</b>
            {chosen.steps.filter((s) => s.type === "elevator").length} 次乘梯 · 总台阶
            {chosen.total_steps} 级 · 最长连续步行 {chosen.longest_continuous_walk_m} 米 ·
            预计 {chosen.arrive_at} 到达
            {nodeById.get(dest)?.name ? `「${nodeById.get(dest)!.name}」` : ""}
          </div>
        )}
      </section>
    </div>
  );
}
