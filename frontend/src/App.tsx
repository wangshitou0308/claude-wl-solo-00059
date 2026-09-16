import { useEffect, useState } from "react";
import type { MapDocument, TripSummary } from "./types";
import { api } from "./api";
import PlanPage from "./components/PlanPage";
import TripPage from "./components/TripPage";
import EditorPage from "./components/EditorPage";

type View =
  | { name: "plan" }
  | { name: "trip"; id: string }
  | { name: "editor" };

export default function App() {
  const [doc, setDoc] = useState<MapDocument | null>(null);
  const [view, setView] = useState<View>({ name: "plan" });
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loadError, setLoadError] = useState("");

  async function load() {
    try {
      const d = await api.getMap();
      setDoc(d);
    } catch (e) {
      setLoadError(
        "无法连接后端，请确认已启动 FastAPI（端口 8765）。" + (e as Error).message
      );
    }
  }

  async function loadTrips() {
    try {
      setTrips(await api.listTrips());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (view.name === "plan") loadTrips();
  }, [view]);

  if (loadError) {
    return (
      <div className="app-error">
        <h2>⚠ 服务未连接</h2>
        <p>{loadError}</p>
        <p>
          启动方式：<code>cd backend &amp;&amp; .venv/bin/uvicorn app.main:app --port 8765</code>
        </p>
      </div>
    );
  }
  if (!doc) return <div className="loading">正在载入社区地图…</div>;

  return (
    <div className="app">
      <nav className="topnav">
        <div className="brand">🛗 坡地社区 · 电梯接续引导</div>
        <div className="nav-btns">
          <button
            className={view.name === "plan" ? "nav-active" : ""}
            onClick={() => setView({ name: "plan" })}
          >
            出行规划
          </button>
          <button
            className={view.name === "editor" ? "nav-active" : ""}
            onClick={() => setView({ name: "editor" })}
          >
            地图绘制（协助者）
          </button>
        </div>
      </nav>

      {view.name === "plan" && (
        <>
          <PlanPage doc={doc} onStarted={(id) => setView({ name: "trip", id })} />
          {trips.length > 0 && (
            <section className="panel trips-bar">
              <h3>最近的行程（保存在本机）</h3>
              <div className="trip-chips">
                {trips.map((t) => (
                  <button
                    key={t.id}
                    className={`trip-chip status-${t.status}`}
                    onClick={() => setView({ name: "trip", id: t.id })}
                  >
                    <b>
                      {t.resident_name || "住户"} · {t.origin_name}→{t.dest_name}
                    </b>
                    <span className="muted">
                      {t.current_step_index}/{t.total_steps} 步 ·{" "}
                      {t.status === "completed"
                        ? "已到达"
                        : t.status === "stuck"
                        ? "待帮助"
                        : "进行中"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {view.name === "trip" && (
        <TripPage
          tripId={view.id}
          doc={doc}
          onExit={() => setView({ name: "plan" })}
        />
      )}
      {view.name === "editor" && (
        <EditorPage doc={doc} onSaved={(d) => setDoc(d)} />
      )}
    </div>
  );
}
