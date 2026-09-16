import type { LayerState } from "./MapCanvas";

const LABELS: { key: keyof LayerState; label: string }[] = [
  { key: "buildings", label: "楼栋楼层" },
  { key: "edges", label: "步道/台阶/连廊" },
  { key: "elevators", label: "电梯" },
  { key: "route", label: "引导路线" },
  { key: "nodes", label: "地标节点" },
  { key: "labels", label: "文字标注" },
];

export function Legend() {
  const items: { color: string; label: string; dash?: string }[] = [
    { color: "#86efac", label: "平路/步道" },
    { color: "#38bdf8", label: "无障碍坡道", dash: "10 6" },
    { color: "#f59e0b", label: "台阶楼梯" },
    { color: "#a78bfa", label: "空中连廊", dash: "12 6" },
    { color: "#2563eb", label: "待走路线" },
    { color: "#16a34a", label: "已完成" },
  ];
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label} className="legend-item">
          <svg width="30" height="10">
            <line
              x1="0"
              y1="5"
              x2="30"
              y2="5"
              stroke={it.color}
              strokeWidth={5}
              strokeDasharray={it.dash}
              strokeLinecap="round"
            />
          </svg>
          {it.label}
        </span>
      ))}
      <span className="legend-item">💺 休息座椅</span>
      <span className="legend-item">🍚 食堂</span>
      <span className="legend-item">🎲 活动室</span>
    </div>
  );
}

export default function LayerControls({
  layers,
  onChange,
}: {
  layers: LayerState;
  onChange: (l: LayerState) => void;
}) {
  return (
    <div className="layer-controls">
      <div className="layer-title">分层显示</div>
      {LABELS.map(({ key, label }) => (
        <label key={key} className="layer-check">
          <input
            type="checkbox"
            checked={layers[key]}
            onChange={(e) => onChange({ ...layers, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <Legend />
    </div>
  );
}
