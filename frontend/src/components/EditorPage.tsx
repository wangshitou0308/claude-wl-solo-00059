import { useMemo, useState } from "react";
import type {
  EdgeKind,
  Elevator,
  MapDocument,
  MapNode,
  NodeKind,
  WalkEdge,
} from "../types";
import { api } from "../api";
import MapCanvas, { type LayerState } from "./MapCanvas";
import LayerControls from "./LayerControls";
import WindowsEditor from "./WindowsEditor";

const DEFAULT_LAYERS: LayerState = {
  buildings: true,
  edges: true,
  elevators: true,
  route: false,
  nodes: true,
  labels: true,
};

type Tab = "node" | "edge" | "elevator" | "building";
let seq = 1;
const nextId = (p: string) => `${p}${Date.now().toString(36)}${seq++}`;

export default function EditorPage({
  doc,
  onSaved,
}: {
  doc: MapDocument;
  onSaved: (d: MapDocument) => void;
}) {
  const [draft, setDraft] = useState<MapDocument>(() =>
    JSON.parse(JSON.stringify(doc))
  );
  const [tab, setTab] = useState<Tab>("node");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [edgePick, setEdgePick] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedElev, setSelectedElev] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [nowTime, setNowTime] = useState("12:00");
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);

  const nodeById = useMemo(
    () => new Map(draft.nodes.map((n) => [n.id, n])),
    [draft]
  );

  function update(patch: Partial<MapDocument>) {
    setDraft((d) => ({ ...d, ...patch }));
    setMsg("");
  }

  function patchNode(id: string, patch: Partial<MapNode>) {
    update({ nodes: draft.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  }

  function addNode() {
    const n: MapNode = {
      id: nextId("n-"),
      name: "新地标",
      building_id: draft.buildings[0]?.id ?? null,
      floor: 1,
      x: 620,
      y: 350,
      kind: "landing",
      poi_type: null,
      is_seat: false,
      windows: [],
      note: "",
    };
    update({ nodes: [...draft.nodes, n] });
    setSelectedNode(n.id);
    setTab("node");
  }

  function addEdge() {
    const e: WalkEdge = {
      id: nextId("e-"),
      a: draft.nodes[0]?.id ?? "",
      b: draft.nodes[1]?.id ?? "",
      kind: "flat",
      length_m: 20,
      steps: 0,
      windows: [],
      note: "",
    };
    update({ edges: [...draft.edges, e] });
    setSelectedEdge(e.id);
    setTab("edge");
  }

  function addElevator() {
    const b = draft.buildings[0]?.id;
    const ev: Elevator = {
      id: nextId("E"),
      name: "新电梯",
      building_id: b ?? "",
      stops: [],
      wait_seconds: 60,
      seconds_per_floor: 6,
      windows: [],
      x: 300,
      y: 200,
      note: "",
    };
    update({ elevators: [...draft.elevators, ev] });
    setSelectedElev(ev.id);
    setTab("elevator");
  }

  function addBuilding() {
    const id = nextId("B");
    update({
      buildings: [
        ...draft.buildings,
        { id, name: "新楼栋", x: 400, y: 120, floors: [1], notes: "" },
      ],
    });
    setSelectedB(id);
    setTab("building");
  }

  function clickNode(n: MapNode) {
    if (tab === "edge" && edgePick) {
      if (edgePick !== n.id) {
        const exists = draft.edges.some(
          (e) =>
            (e.a === edgePick && e.b === n.id) || (e.a === n.id && e.b === edgePick)
        );
        if (!exists) {
          const e: WalkEdge = {
            id: nextId("e-"),
            a: edgePick,
            b: n.id,
            kind: "flat",
            length_m: 20,
            steps: 0,
            windows: [],
            note: "",
          };
          update({ edges: [...draft.edges, e] });
          setSelectedEdge(e.id);
        }
      }
      setEdgePick(null);
    } else if (tab === "edge") {
      setEdgePick(n.id);
    } else {
      setSelectedNode(n.id);
      setTab("node");
    }
  }

  async function save() {
    setErr("");
    setMsg("");
    try {
      const saved = await api.saveMap(draft);
      setDraft(JSON.parse(JSON.stringify(saved)));
      onSaved(saved);
      setMsg("已保存到本机数据库");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function reset() {
    if (!confirm("恢复为内置示例地图？当前未保存的修改会丢失。")) return;
    const fresh = await api.resetMap();
    setDraft(JSON.parse(JSON.stringify(fresh)));
    onSaved(fresh);
    setSelectedNode(null);
    setMsg("已恢复示例地图");
  }

  const selNode = nodeById.get(selectedNode ?? "") ?? null;
  const selEdge = draft.edges.find((e) => e.id === selectedEdge) ?? null;
  const selElev = draft.elevators.find((e) => e.id === selectedElev) ?? null;
  const selBuilding = draft.buildings.find((b) => b.id === selectedB) ?? null;
  const selectable = tab === "edge" ? new Set(draft.nodes.map((n) => n.id)) : null;

  return (
    <div className="page-grid">
      <aside className="panel form-panel editor-panel">
        <div className="editor-head">
          <h2>🗺 地图资料绘制</h2>
          <div className="action-row">
            <button className="btn-primary" onClick={save}>
              保存
            </button>
            <button className="btn-secondary" onClick={reset}>
              恢复示例
            </button>
          </div>
        </div>
        {msg && <div className="success">✓ {msg}</div>}
        {err && <div className="error">⚠ {err}</div>}

        <div className="tabs">
          {(["node", "edge", "elevator", "building"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "node" ? "地标" : t === "edge" ? "连廊/台阶" : t === "elevator" ? "电梯" : "楼栋"}
            </button>
          ))}
        </div>

        {/* --------------------------------------------------- node tab */}
        {tab === "node" && (
          <div>
            <div className="action-row">
              <button className="btn-small" onClick={addNode}>
                + 新增地标
              </button>
            </div>
            <select
              className="full-select"
              value={selectedNode ?? ""}
              onChange={(e) => setSelectedNode(e.target.value || null)}
            >
              <option value="">选择地标…</option>
              {draft.nodes
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, "zh"))
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
            </select>
            {selNode && (
              <div className="edit-body">
                <label className="field">
                  <span>名称</span>
                  <input
                    value={selNode.name}
                    onChange={(e) => patchNode(selNode.id, { name: e.target.value })}
                  />
                </label>
                <div className="two-col">
                  <label className="field">
                    <span>类型</span>
                    <select
                      value={selNode.kind}
                      onChange={(e) => {
                        const kind = e.target.value as NodeKind;
                        patchNode(selNode.id, {
                          kind,
                          poi_type: kind === "poi" ? selNode.poi_type ?? "canteen" : null,
                        });
                      }}
                    >
                      <option value="landing">楼层平台/普通</option>
                      <option value="seat">休息座椅</option>
                      <option value="door">门禁/门</option>
                      <option value="entrance">楼栋出入口</option>
                      <option value="poi">目的地(食堂/活动室)</option>
                    </select>
                  </label>
                  {selNode.kind === "poi" && (
                    <label className="field">
                      <span>目的地类别</span>
                      <select
                        value={selNode.poi_type ?? "other"}
                        onChange={(e) => patchNode(selNode.id, { poi_type: e.target.value as MapNode["poi_type"] })}
                      >
                        <option value="canteen">社区食堂</option>
                        <option value="activity">社区活动室</option>
                        <option value="other">其他</option>
                      </select>
                    </label>
                  )}
                </div>
                <div className="two-col">
                  <label className="field">
                    <span>所属楼栋</span>
                    <select
                      value={selNode.building_id ?? ""}
                      onChange={(e) => patchNode(selNode.id, { building_id: e.target.value || null })}
                    >
                      <option value="">室外/无</option>
                      {draft.buildings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>楼层（坡地可为0/负）</span>
                    <input
                      type="number"
                      value={selNode.floor ?? 0}
                      onChange={(e) => patchNode(selNode.id, { floor: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={selNode.is_seat}
                    onChange={(e) => patchNode(selNode.id, { is_seat: e.target.checked })}
                  />
                  此处有休息座椅（走到此处可歇脚、重置连续步行）
                </label>
                <WindowsEditor
                  windows={selNode.windows}
                  onChange={(windows) => patchNode(selNode.id, { windows })}
                />
                <button
                  className="btn-small danger"
                  onClick={() => {
                    const cleanedElevators = draft.elevators
                      .map((ev) => ({
                        ...ev,
                        stops: ev.stops.filter((s) => s.node_id !== selNode.id),
                      }))
                      .filter((ev) => ev.stops.length >= 2);
                    update({
                      nodes: draft.nodes.filter((n) => n.id !== selNode.id),
                      edges: draft.edges.filter(
                        (e) => e.a !== selNode.id && e.b !== selNode.id
                      ),
                      elevators: cleanedElevators,
                    });
                    setSelectedNode(null);
                  }}
                >
                  删除该地标（相关连线与电梯停层一并删除）
                </button>
              </div>
            )}
            <p className="muted hint">提示：可直接在右侧地图上按住地标拖动调整位置。</p>
          </div>
        )}

        {/* --------------------------------------------------- edge tab */}
        {tab === "edge" && (
          <div>
            <div className="action-row">
              <button className="btn-small" onClick={addEdge}>
                + 新增连线
              </button>
              <button
                className={`btn-small ${edgePick ? "active" : ""}`}
                onClick={() => setEdgePick(null)}
              >
                {edgePick ? "取消点选" : "地图点选两端"}
              </button>
            </div>
            {edgePick && <div className="hint">已选起点「{nodeById.get(edgePick)?.name}」，请在地图上点终点</div>}
            <select
              className="full-select"
              value={selectedEdge ?? ""}
              onChange={(e) => setSelectedEdge(e.target.value || null)}
            >
              <option value="">选择连线…</option>
              {draft.edges.map((e) => (
                <option key={e.id} value={e.id}>
                  {nodeById.get(e.a)?.name} — {nodeById.get(e.b)?.name}（{e.kind}
                  {e.steps ? ` ${e.steps}级` : ""}）
                </option>
              ))}
            </select>
            {selEdge && (
              <div className="edit-body">
                <div className="two-col">
                  <label className="field">
                    <span>起点</span>
                    <select
                      value={selEdge.a}
                      onChange={(e) =>
                        update({
                          edges: draft.edges.map((x) =>
                            x.id === selEdge.id ? { ...x, a: e.target.value } : x
                          ),
                        })
                      }
                    >
                      {draft.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>终点</span>
                    <select
                      value={selEdge.b}
                      onChange={(e) =>
                        update({
                          edges: draft.edges.map((x) =>
                            x.id === selEdge.id ? { ...x, b: e.target.value } : x
                          ),
                        })
                      }
                    >
                      {draft.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>类型（台阶与坡道是两条平行线）</span>
                  <select
                    value={selEdge.kind}
                    onChange={(e) =>
                      update({
                        edges: draft.edges.map((x) =>
                          x.id === selEdge.id ? { ...x, kind: e.target.value as EdgeKind } : x
                        ),
                      })
                    }
                  >
                    <option value="flat">平路</option>
                    <option value="ramp">无障碍坡道</option>
                    <option value="stairs">台阶楼梯</option>
                    <option value="corridor">连廊（有时段）</option>
                    <option value="sidewalk">室外步道</option>
                  </select>
                </label>
                <div className="two-col">
                  <label className="field">
                    <span>长度（米）</span>
                    <input
                      type="number"
                      value={selEdge.length_m}
                      onChange={(e) =>
                        update({
                          edges: draft.edges.map((x) =>
                            x.id === selEdge.id ? { ...x, length_m: Number(e.target.value) } : x
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>台阶级数</span>
                    <input
                      type="number"
                      value={selEdge.steps}
                      onChange={(e) =>
                        update({
                          edges: draft.edges.map((x) =>
                            x.id === selEdge.id ? { ...x, steps: Number(e.target.value) } : x
                          ),
                        })
                      }
                    />
                  </label>
                </div>
                <WindowsEditor
                  windows={selEdge.windows}
                  onChange={(windows) =>
                    update({
                      edges: draft.edges.map((x) =>
                        x.id === selEdge.id ? { ...x, windows } : x
                      ),
                    })
                  }
                />
                <button
                  className="btn-small danger"
                  onClick={() => {
                    update({ edges: draft.edges.filter((x) => x.id !== selEdge.id) });
                    setSelectedEdge(null);
                  }}
                >
                  删除连线
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------ elevator tab */}
        {tab === "elevator" && (
          <div>
            <div className="action-row">
              <button className="btn-small" onClick={addElevator}>
                + 新增电梯
              </button>
            </div>
            <select
              className="full-select"
              value={selectedElev ?? ""}
              onChange={(e) => setSelectedElev(e.target.value || null)}
            >
              <option value="">选择电梯…</option>
              {draft.elevators.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}（停 {e.stops.map((s) => s.floor).join("/") || "—"} 层）
                </option>
              ))}
            </select>
            {selElev && (
              <div className="edit-body">
                <label className="field">
                  <span>名称</span>
                  <input
                    value={selElev.name}
                    onChange={(e) =>
                      update({
                        elevators: draft.elevators.map((x) =>
                          x.id === selElev.id ? { ...x, name: e.target.value } : x
                        ),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>所在楼栋</span>
                  <select
                    value={selElev.building_id}
                    onChange={(e) =>
                      update({
                        elevators: draft.elevators.map((x) =>
                          x.id === selElev.id ? { ...x, building_id: e.target.value } : x
                        ),
                      })
                    }
                  >
                    {draft.buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="two-col">
                  <label className="field">
                    <span>候梯时间（秒）</span>
                    <input
                      type="number"
                      value={selElev.wait_seconds}
                      onChange={(e) =>
                        update({
                          elevators: draft.elevators.map((x) =>
                            x.id === selElev.id ? { ...x, wait_seconds: Number(e.target.value) } : x
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>每层耗时（秒）</span>
                    <input
                      type="number"
                      value={selElev.seconds_per_floor}
                      onChange={(e) =>
                        update({
                          elevators: draft.elevators.map((x) =>
                            x.id === selElev.id
                              ? { ...x, seconds_per_floor: Number(e.target.value) }
                              : x
                          ),
                        })
                      }
                    />
                  </label>
                </div>

                <div className="stops-editor">
                  <div className="windows-head">
                    <span>停靠楼层（仅停部分楼层——不停的层不要添加）</span>
                    <button
                      type="button"
                      className="btn-small"
                      onClick={() =>
                        update({
                          elevators: draft.elevators.map((x) =>
                            x.id === selElev.id
                              ? {
                                  ...x,
                                  stops: [
                                    ...x.stops,
                                    { node_id: draft.nodes[0]?.id ?? "", floor: 1 },
                                  ],
                                }
                              : x
                          ),
                        })
                      }
                    >
                      + 停靠层
                    </button>
                  </div>
                  {selElev.stops.map((s, i) => (
                    <div className="window-row" key={i}>
                      <select
                        value={s.node_id}
                        onChange={(e) =>
                          update({
                            elevators: draft.elevators.map((x) =>
                              x.id === selElev.id
                                ? {
                                    ...x,
                                    stops: x.stops.map((y, j) =>
                                      j === i ? { ...y, node_id: e.target.value } : y
                                    ),
                                  }
                                : x
                            ),
                          })
                        }
                      >
                        {draft.nodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={s.floor}
                        onChange={(e) =>
                          update({
                            elevators: draft.elevators.map((x) =>
                              x.id === selElev.id
                                ? {
                                    ...x,
                                    stops: x.stops.map((y, j) =>
                                      j === i ? { ...y, floor: Number(e.target.value) } : y
                                    ),
                                  }
                                : x
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="btn-small danger"
                        onClick={() =>
                          update({
                            elevators: draft.elevators.map((x) =>
                              x.id === selElev.id
                                ? { ...x, stops: x.stops.filter((_, j) => j !== i) }
                                : x
                            ),
                          })
                        }
                      >
                        删
                      </button>
                    </div>
                  ))}
                </div>

                <WindowsEditor
                  windows={selElev.windows}
                  onChange={(windows) =>
                    update({
                      elevators: draft.elevators.map((x) =>
                        x.id === selElev.id ? { ...x, windows } : x
                      ),
                    })
                  }
                />
                <button
                  className="btn-small danger"
                  onClick={() => {
                    update({ elevators: draft.elevators.filter((x) => x.id !== selElev.id) });
                    setSelectedElev(null);
                  }}
                >
                  删除电梯
                </button>
              </div>
            )}
          </div>
        )}

        {/* building tab */}
        {tab === "building" && (
          <div>
            <div className="action-row">
              <button className="btn-small" onClick={addBuilding}>
                + 新增楼栋
              </button>
            </div>
            <select
              className="full-select"
              value={selectedB ?? ""}
              onChange={(e) => setSelectedB(e.target.value || null)}
            >
              <option value="">选择楼栋…</option>
              {draft.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {selBuilding && (
              <div className="edit-body">
                <label className="field">
                  <span>名称</span>
                  <input
                    value={selBuilding.name}
                    onChange={(e) =>
                      update({
                        buildings: draft.buildings.map((x) =>
                          x.id === selBuilding.id ? { ...x, name: e.target.value } : x
                        ),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>包含楼层（逗号分隔，坡地可用 0、负数）</span>
                  <input
                    value={selBuilding.floors.join(",")}
                    onChange={(e) =>
                      update({
                        buildings: draft.buildings.map((x) =>
                          x.id === selBuilding.id
                            ? {
                                ...x,
                                floors: e.target.value
                                  .split(/[,，]/)
                                  .map((v) => Number(v.trim()))
                                  .filter((v) => !Number.isNaN(v)),
                              }
                            : x
                        ),
                      })
                    }
                  />
                </label>
                <button
                  className="btn-small danger"
                  onClick={() => {
                    update({
                      buildings: draft.buildings.filter((x) => x.id !== selBuilding.id),
                      nodes: draft.nodes.map((n) =>
                        n.building_id === selBuilding.id ? { ...n, building_id: null } : n
                      ),
                    });
                    setSelectedB(null);
                  }}
                >
                  删除楼栋（地标保留并变为室外）
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      <section className="panel map-panel">
        <div className="editor-toolbar">
          <LayerControls layers={layers} onChange={setLayers} />
          <label className="field time-preview">
            <span>时段预览时刻</span>
            <input type="time" value={nowTime} onChange={(e) => setNowTime(e.target.value)} />
          </label>
        </div>
        <div className="map-wrap">
          <MapCanvas
            doc={draft}
            nowTime={nowTime}
            layers={layers}
            selectedNodeId={edgePick ?? selectedNode}
            selectableNodeIds={selectable}
            onNodeClick={clickNode}
            onNodeDrag={(n, x, y) => {
              const nd = { ...draft, nodes: draft.nodes.map((m) => (m.id === n.id ? { ...m, x, y } : m)) };
              setDraft(nd);
            }}
          />
        </div>
      </section>
    </div>
  );
}
