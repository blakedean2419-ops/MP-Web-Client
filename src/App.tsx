import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Flame,
  Fuel,
  Leaf,
  Plus,
  Settings2,
  Trash2,
  TrendingUp,
  Wifi,
  X,
} from "lucide-react";
import TrendChart, { type Trace, type Reading } from "./TrendChart";
import type { Snapshot } from "./types";

type Group = { id: string; title: string; tags: string[] };
type Layout = {
  title: string;
  chartTitle: string;
  groups: Group[];
  traces: Trace[];
};
const palette = [
  "#42ed18",
  "#008cff",
  "#ff3737",
  "#d742ff",
  "#ffd000",
  "#46dded",
];
const key = "mp-dashboard-v2";
function load(): Layout | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v &&
      typeof v.title === "string" &&
      typeof v.chartTitle === "string" &&
      Array.isArray(v.groups) &&
      v.groups.every(
        (g: Group) =>
          typeof g.id === "string" &&
          typeof g.title === "string" &&
          Array.isArray(g.tags) &&
          g.tags.every((id) => typeof id === "string"),
      ) &&
      Array.isArray(v.traces) &&
      v.traces.every(
        (t: Trace) =>
          typeof t.id === "string" &&
          /^#[0-9a-f]{6}$/i.test(t.color) &&
          typeof t.visible === "boolean",
      )
      ? v
      : null;
  } catch {
    return null;
  }
}
export default function App() {
  const [layout, setLayout] = useState<Layout | null>(load);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [modal, setModal] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [windowSeconds, setWindowSeconds] = useState(800);
  const [updateMs, setUpdateMs] = useState(500);
  const [yMin, setYMin] = useState(0);
  const [yMax, setYMax] = useState(100);
  const [autoY, setAutoY] = useState(true);
  const [relative, setRelative] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!modal) return;
    triggerRef.current = document.activeElement as HTMLElement;
    dialogRef.current?.querySelector<HTMLElement>("button, input")?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      triggerRef.current?.focus();
    };
  }, [modal]);
  useEffect(() => {
    if (!layout) return;
    try {
      localStorage.setItem(key, JSON.stringify(layout));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [layout]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/snapshot", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        if (!response.ok) throw new Error("Snapshot request failed");
        const next: Snapshot = await response.json();
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setError("");
        setLayout(
          (current) =>
            current ?? {
              title: "Fuel and Air",
              chartTitle: "Trends",
              groups: [
                "Fuel and Air",
                "Fuel Splits",
                "Emissions (15% O₂)",
                "Pulsation",
              ].map((title, i) => ({
                id: `group-${i}`,
                title,
                tags: next.tags
                  .slice(i * 4, i * 4 + (i === 3 ? 2 : 4))
                  .map((t) => t.id),
              })),
              traces: next.tags.slice(0, 4).map((t, i) => ({
                id: t.id,
                color: palette[i],
                visible: true,
              })),
            },
        );
        const timestamp = next.status.lastSuccess;
        if (next.status.connected && timestamp)
          setReadings((current) => {
            if (current.at(-1)?.timestamp === timestamp) return current;
            const values: Record<string, number | null> = {};
            for (const tag of next.tags)
              values[tag.id] = tag.quality === "good" ? tag.value : null;
            return [...current, { timestamp, values }]
              .filter((r) => r.timestamp >= timestamp - 3600000)
              .slice(-7200);
          });
      } catch {
        if (!controller.signal.aborted)
          setError("Cannot reach MP server. Displayed values may be stale.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, updateMs);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [updateMs]);
  const tags = snapshot?.tags ?? [];
  const connected = !error && snapshot?.status.connected;
  const change = (fn: (v: Layout) => Layout) =>
    setLayout((v) => (v ? fn(v) : v));
  const editGroup = (id: string, fn: (g: Group) => Group) =>
    change((v) => ({
      ...v,
      groups: v.groups.map((g) => (g.id === id ? fn(g) : g)),
    }));
  const addTrace = (id: string) =>
    change((v) =>
      v.traces.some((t) => t.id === id)
        ? v
        : {
            ...v,
            traces: [
              ...v.traces,
              {
                id,
                color: palette[v.traces.length % palette.length],
                visible: true,
              },
            ],
          },
    );
  const group = layout?.groups.find((g) => modal === g.id);
  const end = readings.at(-1)?.timestamp ?? Date.now();
  const shown = readings.filter(
    (r) => r.timestamp >= end - windowSeconds * 1000,
  );
  const icons = [Flame, Fuel, Leaf, Activity];
  return (
    <div className="dashboard">
      <header className="topbar">
        <Flame className="brand-flame" size={42} />
        <input
          className="dashboard-title"
          aria-label="Dashboard title"
          value={layout?.title ?? "Fuel and Air"}
          onChange={(e) => change((v) => ({ ...v, title: e.target.value }))}
        />
        <div className={`connection ${connected ? "online" : ""}`}>
          <i />
          {snapshot?.status.mode === "demo"
            ? "Demo · simulated data"
            : connected
              ? "XML connected"
              : "XML disconnected"}
        </div>
        <button onClick={() => setModal("source")}>
          <Wifi size={16} />
          Connection
        </button>
        <time>{new Date(end).toLocaleString()}</time>
      </header>
      {(error || snapshot?.status.error) && (
        <div className="alert" role="alert">
          {error || snapshot?.status.error} Values are stale. Last read:{" "}
          {snapshot?.status.lastSuccess
            ? new Date(snapshot.status.lastSuccess).toLocaleString()
            : "none"}
          .
        </div>
      )}
      {storageError && (
        <div role="status" className="alert">
          Browser storage is unavailable. Changes apply to this session only.
        </div>
      )}
      <div className="workspace">
        <aside className="groups">
          {layout?.groups.map((g, i) => {
            const Icon = icons[i % icons.length];
            return (
              <section className={`tag-group group-${i % 4}`} key={g.id}>
                <div className="panel-heading">
                  <Icon size={23} />
                  <input
                    aria-label={`Group title ${i + 1}`}
                    value={g.title}
                    onChange={(e) =>
                      editGroup(g.id, (old) => ({
                        ...old,
                        title: e.target.value,
                      }))
                    }
                  />
                  <button
                    aria-label={`Edit ${g.title}`}
                    onClick={() => {
                      setSearch("");
                      setModal(g.id);
                    }}
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="tag-rows">
                  {g.tags.map((id) => {
                    const tag = tags.find((t) => t.id === id);
                    const trace = layout.traces.find((t) => t.id === id);
                    return (
                      <button
                        className="tag-row"
                        key={id}
                        title={`Add ${tag?.name ?? id} to graph`}
                        onClick={() => addTrace(id)}
                      >
                        <span>{tag?.name ?? id}</span>
                        <strong
                          style={{
                            color: trace?.color ?? palette[i % palette.length],
                          }}
                        >
                          {tag?.quality === "good" ? tag.value.toFixed(3) : "—"}
                        </strong>
                        <small>{tag?.unit || "—"}</small>
                      </button>
                    );
                  })}
                  {!g.tags.length && (
                    <p className="empty">Add tags to this group.</p>
                  )}
                </div>
              </section>
            );
          })}
          <button
            className="add-group"
            onClick={() =>
              change((v) => ({
                ...v,
                groups: [
                  ...v.groups,
                  { id: crypto.randomUUID(), title: "New group", tags: [] },
                ],
              }))
            }
          >
            <Plus size={18} />
            Add group
          </button>
        </aside>
        <main className="trend-panel">
          <div className="panel-heading">
            <TrendingUp size={24} />
            <input
              aria-label="Graph title"
              value={layout?.chartTitle ?? "Trends"}
              onChange={(e) =>
                change((v) => ({ ...v, chartTitle: e.target.value }))
              }
            />
            <button
              onClick={() => {
                setSearch("");
                setModal("traces");
              }}
            >
              <Plus size={17} />
              Add Trace
            </button>
            <button
              onClick={() => {
                setSearch("");
                setModal("traces");
              }}
            >
              <Settings2 size={17} />
              Configure Traces
            </button>
          </div>
          <div className="trace-legend">
            {layout?.traces.map((trace) => {
              const tag = tags.find((t) => t.id === trace.id);
              return (
                <div className="trace-chip" key={trace.id}>
                  <input
                    type="checkbox"
                    aria-label={`Show ${trace.id}`}
                    checked={trace.visible}
                    style={{ accentColor: trace.color }}
                    onChange={(e) =>
                      change((v) => ({
                        ...v,
                        traces: v.traces.map((t) =>
                          t.id === trace.id
                            ? { ...t, visible: e.target.checked }
                            : t,
                        ),
                      }))
                    }
                  />
                  <span>{tag?.name ?? trace.id}</span>
                  <strong style={{ color: trace.color }}>
                    {tag?.quality === "good" ? tag.value.toFixed(2) : "—"}{" "}
                    <small>{tag?.unit}</small>
                  </strong>
                </div>
              );
            })}
          </div>
          <div className="chart" aria-label="Live multi-tag trend">
            <TrendChart
              readings={shown}
              traces={layout?.traces ?? []}
              tags={tags}
              relative={relative}
              domain={autoY ? undefined : [yMin, yMax]}
            />
          </div>
          {!shown.length && (
            <p className="chart-note">
              Waiting for live samples. Trends accumulate while this page is
              open.
            </p>
          )}
          {!layout?.traces.length && (
            <p className="chart-note">Add a trace to plot live values.</p>
          )}
          <div className="trend-footer">
            <span>
              <i className="live-dot" />
              LIVE TRENDS
            </span>
            <span>
              {layout?.traces.filter((t) => t.visible).length ?? 0} visible
              traces · {shown.length} live samples
            </span>
          </div>
        </main>
      </div>
      <footer className="settings-panel">
        <div className="panel-heading">
          <Settings2 size={20} />
          <strong>Chart Settings</strong>
        </div>
        <div className="settings-fields">
          <label>
            <span>Y Axis</span>
            <div className="axis-inputs">
              <input
                aria-label="Y minimum"
                type="number"
                value={yMin}
                onChange={(e) => setYMin(Number(e.target.value))}
              />
              <input
                aria-label="Y maximum"
                type="number"
                value={yMax}
                onChange={(e) => setYMax(Number(e.target.value))}
              />
            </div>
          </label>
          <label className="auto-axis">
            <input
              type="checkbox"
              checked={autoY}
              onChange={(e) => setAutoY(e.target.checked)}
            />
            Auto scale
          </label>
          <label>
            Time Window (s)
            <select
              aria-label="Time window"
              value={windowSeconds}
              onChange={(e) => setWindowSeconds(Number(e.target.value))}
            >
              {[60, 300, 800, 1800, 3600].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Update Rate (ms)
            <select
              aria-label="Update rate"
              value={updateMs}
              onChange={(e) => setUpdateMs(Number(e.target.value))}
            >
              {[500, 1000, 2000, 5000].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Time Display
            <select
              aria-label="Time display"
              value={relative ? "relative" : "clock"}
              onChange={(e) => setRelative(e.target.value === "relative")}
            >
              <option value="relative">Relative (s)</option>
              <option value="clock">Clock time</option>
            </select>
          </label>
          <span className="read-only">
            Read-only XML telemetry
            <br />
            No acquisition controls or recording
          </span>
        </div>
        {!autoY && yMin >= yMax && (
          <p role="alert">
            Y minimum must be less than Y maximum. Using automatic scale.
          </p>
        )}
      </footer>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            ref={dialogRef}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const all = dialogRef.current?.querySelectorAll<HTMLElement>(
                "button:not([disabled]), input, select",
              );
              if (!all?.length) return;
              const first = all[0],
                last = all[all.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
          >
            <div className="modal-header">
              <h2 id="dialog-title">
                {modal === "source"
                  ? "LabVIEW connection"
                  : group
                    ? `Edit ${group.title}`
                    : "Configure Traces"}
              </h2>
              <button aria-label="Close dialog" onClick={() => setModal(null)}>
                <X size={20} />
              </button>
            </div>
            {modal === "source" ? (
              <>
                <p>
                  The MP server reads your LabVIEW XML service. The dashboard
                  only displays values; it never controls acquisition.
                </p>
                <p>
                  On your Windows laptop, copy <code>.env.laptop.example</code>{" "}
                  to <code>.env</code>, then run <code>npm.cmd ci</code>,{" "}
                  <code>npm.cmd run build</code> and <code>npm.cmd start</code>.
                </p>
                <p>
                  Set <code>XML_SERVICE_URL</code> to{" "}
                  <code>
                    http://127.0.0.1:8001/WebService1/Random_Number(GET)
                  </code>{" "}
                  when MP runs on the same laptop. A cloud server needs a
                  reachable service URL. Keep credentials in server
                  configuration.
                </p>
                <p>
                  Live trends are held temporarily in this browser, for up to
                  one hour / 7,200 samples. Reloading clears them. No readings
                  are recorded to disk.
                </p>
              </>
            ) : (
              <>
                {group && (
                  <div className="group-edit">
                    <label>
                      Group title
                      <input
                        value={group.title}
                        onChange={(e) =>
                          editGroup(group.id, (g) => ({
                            ...g,
                            title: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className="danger"
                      onClick={() => {
                        change((v) => ({
                          ...v,
                          groups: v.groups.filter((g) => g.id !== group.id),
                        }));
                        setModal(null);
                      }}
                    >
                      <Trash2 size={16} />
                      Delete group
                    </button>
                  </div>
                )}
                <input
                  className="search"
                  aria-label="Search tags"
                  placeholder="Search tags by name or ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="tag-picker">
                  {tags
                    .filter((t) =>
                      `${t.name} ${t.id}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((tag) => {
                      const trace = layout?.traces.find((t) => t.id === tag.id);
                      const selected = group
                        ? group.tags.includes(tag.id)
                        : !!trace;
                      return (
                        <div className="picker-row" key={tag.id}>
                          <label>
                            <input
                              type="checkbox"
                              aria-label={`Include ${tag.id}`}
                              checked={selected}
                              onChange={(e) => {
                                if (group)
                                  editGroup(group.id, (g) => ({
                                    ...g,
                                    tags: e.target.checked
                                      ? [...g.tags, tag.id]
                                      : g.tags.filter((id) => id !== tag.id),
                                  }));
                                else if (e.target.checked) addTrace(tag.id);
                                else
                                  change((v) => ({
                                    ...v,
                                    traces: v.traces.filter(
                                      (t) => t.id !== tag.id,
                                    ),
                                  }));
                              }}
                            />
                            <span>
                              {tag.name}
                              <small>
                                {tag.id} · {tag.unit || "No unit"}
                              </small>
                            </span>
                          </label>
                          {!group && trace && (
                            <>
                              <input
                                type="color"
                                aria-label={`Color ${tag.id}`}
                                value={trace.color}
                                onChange={(e) =>
                                  change((v) => ({
                                    ...v,
                                    traces: v.traces.map((t) =>
                                      t.id === tag.id
                                        ? { ...t, color: e.target.value }
                                        : t,
                                    ),
                                  }))
                                }
                              />
                              <label className="visibility">
                                <input
                                  type="checkbox"
                                  aria-label={`Visible ${tag.id}`}
                                  checked={trace.visible}
                                  onChange={(e) =>
                                    change((v) => ({
                                      ...v,
                                      traces: v.traces.map((t) =>
                                        t.id === tag.id
                                          ? { ...t, visible: e.target.checked }
                                          : t,
                                      ),
                                    }))
                                  }
                                />
                                Visible
                              </label>
                            </>
                          )}
                        </div>
                      );
                    })}
                  {!tags.length && (
                    <p>No tags available. Check the connection.</p>
                  )}
                </div>
                <p className="muted">
                  Changes save automatically in this browser. Click a group
                  value to add it to the graph.
                </p>
              </>
            )}
            <button className="done" onClick={() => setModal(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
