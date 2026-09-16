import type { Window } from "../types";

export default function WindowsEditor({
  windows,
  onChange,
}: {
  windows: Window[];
  onChange: (w: Window[]) => void;
}) {
  const update = (i: number, patch: Partial<Window>) => {
    onChange(windows.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  };
  return (
    <div className="windows-editor">
      <div className="windows-head">
        <span>开放/门禁时段（空白=全天开放）</span>
        <button
          type="button"
          className="btn-small"
          onClick={() =>
            onChange([...windows, { open: "08:00", close: "18:00", note: "" }])
          }
        >
          + 时段
        </button>
      </div>
      {windows.length === 0 && <div className="muted">全天可通行</div>}
      {windows.map((w, i) => (
        <div key={i} className="window-row">
          <input
            type="time"
            value={w.open}
            onChange={(e) => update(i, { open: e.target.value })}
          />
          <span>至</span>
          <input
            type="time"
            value={w.close}
            onChange={(e) => update(i, { close: e.target.value })}
          />
          <input
            type="text"
            placeholder="说明（如午餐时段）"
            value={w.note ?? ""}
            onChange={(e) => update(i, { note: e.target.value })}
          />
          <button
            type="button"
            className="btn-small danger"
            onClick={() => onChange(windows.filter((_, j) => j !== i))}
          >
            删
          </button>
        </div>
      ))}
    </div>
  );
}
