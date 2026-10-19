import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Gauge,
  LayoutDashboard,
  Menu,
  Monitor,
  Radio,
  Search,
  Settings2,
  SlidersHorizontal,
  Tags,
  TrendingUp,
  Waves,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { Sample, Snapshot, Tag } from "./types";

type Page = "Overview" | "Trends" | "Tag explorer" | "History";
type Widget = { id: string; kind: "gauge" | "value" };
const colors = [
  "#159d8b",
  "#cd9046",
  "#6b80c5",
  "#3999bd",
  "#a276b4",
  "#76995a",
];
const ranges = [
  { label: "15 min", ms: 900000 },
  { label: "1 hour", ms: 3600000 },
  { label: "6 hours", ms: 21600000 },
  { label: "24 hours", ms: 86400000 },
];
const format = (n: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const time = (n: number) =>
  new Date(n).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const dateTime = (n: number) => new Date(n).toLocaleString();
const TrendChart = lazy(() => import("./TrendChart"));
function loadWidgets(): Widget[] | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem("mp-widgets-v1") || "null",
    );
    return Array.isArray(value) &&
      value.every(
        (item) =>
          item &&
          typeof item.id === "string" &&
          ["gauge", "value"].includes(item.kind),
      )
      ? value
      : null;
  } catch {
    return null;
  }
}
function TagGauge({
  tag,
  color,
  kind,
}: {
  tag: Tag;
  color: string;
  kind: Widget["kind"];
}) {
  const percent = Math.max(
    0,
    Math.min(100, ((tag.value - tag.min) / (tag.max - tag.min)) * 100),
  );
  const alarm = tag.warning !== undefined && tag.value >= tag.warning;
  return (
    <div className={`hmi-widget ${alarm ? "warning" : ""}`}>
      <div className="widget-title">
        <span className="tag-code">{tag.id}</span>
        <span
          className={`quality-dot ${tag.quality === "bad" ? "bad" : ""}`}
          title={`Quality: ${tag.quality}`}
        />
      </div>
      <div className="widget-name">{tag.name}</div>
      <div className="widget-value" title={String(tag.value)}>
        {format(tag.value)} <span>{tag.unit}</span>
      </div>
      {kind === "gauge" && (
        <>
          <div className="gauge-track">
            <div
              style={{
                width: `${percent}%`,
                background: alarm ? "#c18427" : color,
              }}
            />
            {tag.warning !== undefined && (
              <i
                style={{
                  left: `${Math.max(0, Math.min(100, ((tag.warning - tag.min) / (tag.max - tag.min)) * 100))}%`,
                }}
                title={`High threshold: ${tag.warning} ${tag.unit}`}
              />
            )}
          </div>
          <div className="gauge-labels">
            <span>{tag.min}</span>
            <span>
              {tag.max} {tag.unit}
            </span>
          </div>
        </>
      )}
      {alarm && <span className="threshold-label">Above high threshold</span>}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [networkError, setNetworkError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [range, setRange] = useState(3600000);
  const [search, setSearch] = useState("");
  const [tablePage, setTablePage] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"layout" | "source" | null>(null);
  const [widgets, setWidgets] = useState<Widget[] | null>(loadWidgets);
  const [draftWidgets, setDraftWidgets] = useState<Widget[]>([]);
  const [notice, setNotice] = useState("");
  const [customRange, setCustomRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const modalTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/snapshot", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("The data server is unavailable.");
        const data: Snapshot = await response.json();
        setSnapshot(data);
        setNetworkError("");
        setSelectedId((id) =>
          data.tags.some((tag) => tag.id === id) ? id : data.tags[0]?.id || "",
        );
      } catch (error) {
        if (!controller.signal.aborted)
          setNetworkError(
            error instanceof Error
              ? error.message
              : "Cannot connect to the data server.",
          );
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setHistoryLoading(false);
      return;
    }
    const controller = new AbortController();
    let pending = false;
    setSamples([]);
    setHistoryLoading(true);
    setHistoryError("");
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const to = customRange?.to ?? Date.now();
        const from = customRange?.from ?? to - range;
        const response = await fetch(
          `/api/history?${new URLSearchParams({ tag: selectedId, from: String(from), to: String(to) })}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            "History could not be loaded. Try a range of 31 days or less.",
          );
        const data: { samples: Sample[] } = await response.json();
        setSamples(data.samples);
        setHistoryError("");
      } catch (error) {
        if (!controller.signal.aborted)
          setHistoryError(
            error instanceof Error
              ? error.message
              : "History could not be loaded.",
          );
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
        pending = false;
      }
    }
    void refresh();
    const timer = customRange ? undefined : setInterval(refresh, 4000);
    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [selectedId, range, customRange]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(
        (event.target as HTMLElement)?.tagName,
      );
      if (event.key === "/" && !typing && !modal) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setModal(null);
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);
  useEffect(() => {
    if (!modal) return;
    modalTrigger.current = document.activeElement as HTMLElement;
    dialogRef.current
      ?.querySelector<HTMLElement>("button, input, select")
      ?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      modalTrigger.current?.focus();
    };
  }, [modal]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    setTablePage(0);
  }, [search, page]);

  const tags = snapshot?.tags ?? [];
  const selected = tags.find((tag) => tag.id === selectedId);
  const visibleTags = tags.filter((tag) =>
    `${tag.id} ${tag.name} ${tag.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const displayedTags =
    page === "Overview"
      ? visibleTags.slice(0, 6)
      : visibleTags.slice(tablePage * 25, (tablePage + 1) * 25);
  const activeWidgets = (
    widgets ??
    tags.slice(0, 3).map((tag) => ({ id: tag.id, kind: "gauge" as const }))
  ).filter((widget) => tags.some((tag) => tag.id === widget.id));
  const sourceFailed = Boolean(
    networkError || (snapshot && !snapshot.status.connected),
  );
  const demo = snapshot?.status.mode === "demo";
  const values = samples.map((s) => s.value);
  const stats = values.length
    ? {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
      }
    : null;
  function navigate(next: Page) {
    setPage(next);
    setMenuOpen(false);
  }
  function customize() {
    setDraftWidgets([...activeWidgets]);
    setModal("layout");
  }
  function exportCsv() {
    if (!selected || !samples.length) return;
    const safe = (text: string) =>
      `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
    const csv = [
      "timestamp,tag,name,value,unit",
      ...samples.map(
        (sample) =>
          `${new Date(sample.timestamp).toISOString()},${safe(selected.id)},${safe(selected.name)},${sample.value},${safe(selected.unit)}`,
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `mp-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("History exported as CSV.");
  }
  function applyDates() {
    const from = new Date(dateFrom).getTime(),
      to = new Date(dateTo).getTime();
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to < from ||
      to - from > 31 * 86400000
    ) {
      setNotice("Choose a valid date range of 31 days or less.");
      return;
    }
    setCustomRange({ from, to });
  }

  const trendPanel = (
    <section className="panel trend-panel" aria-label="Tag trend">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">PROCESS INSIGHTS</div>
          <h2>
            {page === "History" ? "Historical trend" : "Live trend"}
            <span className="heading-note">
              {selected?.unit || "Tag values"}
            </span>
          </h2>
        </div>
        <button
          className="icon-button"
          title="Export displayed history"
          aria-label="Export displayed history"
          onClick={exportCsv}
          disabled={!samples.length}
        >
          <ArrowDownToLine size={18} />
        </button>
      </div>
      <div className="trend-toolbar">
        <select
          aria-label="Chart tag"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {!tags.length && <option value="">No tags available</option>}
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name} · {tag.id}
            </option>
          ))}
        </select>
        <div className="range-options" aria-label="Time range">
          {ranges.map((item) => (
            <button
              key={item.ms}
              className={!customRange && range === item.ms ? "active" : ""}
              onClick={() => {
                setRange(item.ms);
                setCustomRange(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {page === "History" && (
        <div className="date-filter">
          <label>
            From
            <input
              aria-label="History from"
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              aria-label="History to"
              type="datetime-local"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <button className="button secondary" onClick={applyDates}>
            Apply range
          </button>
        </div>
      )}
      <div className="trend-value">
        <span>{selected ? format(selected.value) : "—"}</span>
        <span>{selected?.unit}</span>
        <span className={`live-chip ${sourceFailed ? "muted" : ""}`}>
          <span />
          {sourceFailed
            ? "Stale value"
            : demo
              ? "Simulated live"
              : "Current value"}
        </span>
      </div>
      <div className="chart-wrap">
        {historyError ? (
          <div className="empty-state">
            <WifiOff size={25} />
            <p>{historyError}</p>
          </div>
        ) : historyLoading ? (
          <div className="empty-state">
            <Activity size={25} className="pulse" />
            <p>Loading historical samples…</p>
          </div>
        ) : !samples.length ? (
          <div className="empty-state">
            <Database size={25} />
            <p>No history in this time range.</p>
            <span>Samples are recorded as the service is polled.</span>
          </div>
        ) : (
          <Suspense
            fallback={<div className="empty-state">Loading chart…</div>}
          >
            <TrendChart samples={samples} tag={selected} />
          </Suspense>
        )}
      </div>
      <div
        className="chart-footer"
        title="Statistics for the representative samples shown in the chart"
      >
        <span>
          <i className="legend-dot" />
          {selected?.id ?? "No tag selected"}
        </span>
        <span>
          Min <b>{stats ? format(stats.min) : "—"}</b>
        </span>
        <span>
          Avg <b>{stats ? format(stats.avg) : "—"}</b>
        </span>
        <span>
          Max <b>{stats ? format(stats.max) : "—"}</b>
        </span>
      </div>
      {page === "History" && (
        <p className="sampling-note">
          Exports and charts use up to 600 representative samples, preserving
          bucket minima and maxima. Doubles are stored at full precision.
        </p>
      )}
    </section>
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <span className="brand-icon">
            <Activity size={24} strokeWidth={2.3} />
          </span>
          <span>
            MP<span className="brand-light"> / client</span>
          </span>
        </a>
        <div className="workspace-selector">
          <div className="workspace-icon">
            <Waves size={19} />
          </div>
          <div>
            <strong>Process workspace</strong>
            <small>Operations dashboard</small>
          </div>
          <span className="workspace-badge">01</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              { label: "Overview", icon: LayoutDashboard },
              { label: "Trends", icon: TrendingUp },
              { label: "Tag explorer", icon: Tags },
              { label: "History", icon: Clock3 },
            ] as const
          ).map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={page === label ? "nav-item active" : "nav-item"}
              onClick={() => navigate(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === "Tag explorer" && (
                <span className="nav-count">{tags.length}</span>
              )}
              {page === label && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="source-card">
            <div className="source-card-title">
              <Radio size={17} />
              <span>Data source</span>
              <span className={`quality-dot ${sourceFailed ? "bad" : ""}`} />
            </div>
            <strong>
              {demo
                ? "Demo XML service"
                : snapshot
                  ? "XML web service"
                  : "Connecting…"}
            </strong>
            <small>
              {sourceFailed
                ? "Connection needs attention"
                : demo
                  ? "Simulated process values"
                  : "Read-only data connection"}
            </small>
            <button onClick={() => setModal("source")}>
              Connection details <ArrowRight size={14} />
            </button>
          </div>
          <button className="sidebar-help" onClick={() => setModal("source")}>
            <CircleHelp size={18} />
            Setup & connection guide
            <ChevronRight size={15} />
          </button>
          <div className="sidebar-profile">
            <div className="avatar">MP</div>
            <div>
              <strong>Local workspace</strong>
              <small>Device preferences enabled</small>
            </div>
            <Monitor size={16} />
          </div>
        </div>
      </aside>
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <div className="search-box">
              <Search size={16} />
              <input
                ref={searchRef}
                aria-label="Search tags"
                placeholder="Search tags…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (e.target.value) setPage("Tag explorer");
                }}
              />
              <kbd>/</kbd>
            </div>
            <span className="topbar-divider" />
            <div
              className="connection-indicator"
              title={
                snapshot?.status.lastSuccess
                  ? `Last sample: ${dateTime(snapshot.status.lastSuccess)}`
                  : "No sample received"
              }
            >
              {sourceFailed ? <WifiOff size={16} /> : <Wifi size={16} />}
              <span>
                {sourceFailed
                  ? "Disconnected"
                  : snapshot
                    ? "Connected"
                    : "Connecting"}
              </span>
            </div>
          </div>
        </header>
        <main>
          <div className="page-title-row">
            <div>
              <div className="eyebrow">YOUR PROCESS, AT A GLANCE</div>
              <h1>
                {page === "Overview"
                  ? "Process overview"
                  : page === "Trends"
                    ? "Process trends"
                    : page === "History"
                      ? "Historical data"
                      : "Tag explorer"}
                <span className="title-dot">.</span>
              </h1>
              <p>
                {page === "Overview"
                  ? "A clear view of your process. Live values, trends, and everything in between."
                  : page === "Trends"
                    ? "Follow a tag over time and inspect changes in your process."
                    : page === "History"
                      ? "Explore recorded values and export the data behind your trends."
                      : "Every connected tag, with its latest value and data quality."}
              </p>
            </div>
            <div className="page-actions">
              <span className={`live-status ${sourceFailed ? "offline" : ""}`}>
                <span />
                {sourceFailed ? "OFFLINE" : "LIVE"}
              </span>
              <button className="button secondary" onClick={customize}>
                <SlidersHorizontal size={15} />
                <span>Customize view</span>
              </button>
            </div>
          </div>
          {sourceFailed && (
            <div className="error-banner" role="alert">
              <WifiOff size={17} />
              <span>
                {networkError ||
                  snapshot?.status.error ||
                  "The service has not supplied a sample."}{" "}
                Existing values are stale.
              </span>
              <button onClick={() => setModal("source")}>
                Details <ArrowRight size={14} />
              </button>
            </div>
          )}
          {demo && (
            <div className="demo-banner">
              <div className="demo-banner-icon">
                <Radio size={16} />
              </div>
              <span>
                <strong>You’re viewing demo data.</strong> Connect your XML web
                service to see your own process values.
              </span>
              <button onClick={() => setModal("source")}>
                Connect service <ArrowRight size={14} />
              </button>
            </div>
          )}
          {!snapshot && !networkError && (
            <div className="loading-banner">
              <Activity className="pulse" size={18} /> Connecting to the data
              server…
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="section-label">
                <h2>Live process values</h2>
                <span>
                  <span className="quality-dot" />
                  Updated{" "}
                  {snapshot?.status.lastSuccess
                    ? time(snapshot.status.lastSuccess)
                    : "—"}
                </span>
              </div>
              <div className="metric-grid">
                {tags.slice(0, 4).map((tag, i) => (
                  <button
                    className={`metric-card ${selectedId === tag.id ? "selected" : ""}`}
                    key={tag.id}
                    onClick={() => setSelectedId(tag.id)}
                  >
                    <div className="metric-top">
                      <span>{tag.name}</span>
                      <span
                        className="metric-icon"
                        style={{ color: colors[i] }}
                      >
                        {i === 1 ? (
                          <Activity size={16} />
                        ) : i === 2 ? (
                          <Waves size={16} />
                        ) : (
                          <Gauge size={16} />
                        )}
                      </span>
                    </div>
                    <div className="metric-value">
                      {format(tag.value)}
                      <span>{tag.unit}</span>
                    </div>
                    <div className="metric-bottom">
                      <span className="tag-code">{tag.id}</span>
                      <span
                        className={
                          tag.quality === "bad" ? "quality-bad" : "quality-good"
                        }
                      >
                        <span
                          className={`quality-dot ${tag.quality === "bad" ? "bad" : ""}`}
                        />
                        {tag.quality === "good"
                          ? "Good quality"
                          : "Bad quality"}
                      </span>
                    </div>
                    <div className="metric-range">
                      <span>
                        Range {tag.min}–{tag.max} {tag.unit}
                      </span>
                      <span className="mini-line" style={{ color: colors[i] }}>
                        <Gauge size={12} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="dashboard-grid">
                {trendPanel}
                <section className="panel hmi-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">DEVICE DASHBOARD</div>
                      <h2>
                        Tag HMI{" "}
                        <span className="count-badge">
                          {activeWidgets.length}
                        </span>
                      </h2>
                    </div>
                    <button
                      className="icon-button"
                      title="Configure HMI tiles"
                      aria-label="Configure HMI tiles"
                      onClick={customize}
                    >
                      <Settings2 size={18} />
                    </button>
                  </div>
                  <div className="hmi-subtitle">
                    Your selected tags, in real time.
                  </div>
                  <div className="hmi-widgets">
                    {activeWidgets.map((widget, i) => (
                      <TagGauge
                        key={widget.id}
                        tag={tags.find((tag) => tag.id === widget.id)!}
                        color={colors[i % colors.length]}
                        kind={widget.kind}
                      />
                    ))}
                    {!activeWidgets.length && (
                      <div className="empty-state">
                        <Gauge size={24} />
                        <p>No HMI tiles selected.</p>
                        <button className="text-button" onClick={customize}>
                          Choose tags
                        </button>
                      </div>
                    )}
                  </div>
                  <button className="hmi-customize" onClick={customize}>
                    <SlidersHorizontal size={14} />
                    Customize this device
                    <ArrowRight size={14} />
                  </button>
                </section>
              </div>
            </>
          )}
          {(page === "Trends" || page === "History") && trendPanel}
          {(page === "Overview" || page === "Tag explorer") && (
            <section className="panel tag-table-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">CONNECTED SIGNALS</div>
                  <h2>
                    {page === "Overview" ? "Tag activity" : "All tags"}{" "}
                    <span className="count-badge">{visibleTags.length}</span>
                  </h2>
                </div>
                {page === "Overview" ? (
                  <button
                    className="text-button"
                    onClick={() => navigate("Tag explorer")}
                  >
                    View all tags <ArrowRight size={15} />
                  </button>
                ) : (
                  <span className="table-note">Read-only telemetry</span>
                )}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>TAG / NAME</th>
                      <th>VALUE</th>
                      <th>QUALITY</th>
                      <th>LAST UPDATE</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTags.map((tag, i) => (
                      <tr key={tag.id}>
                        <td>
                          <div className="table-tag">
                            <span
                              className="table-tag-icon"
                              style={{
                                color: colors[i % colors.length],
                                background: `${colors[i % colors.length]}0c`,
                              }}
                            >
                              <Activity size={17} />
                            </span>
                            <div>
                              <strong>{tag.name}</strong>
                              <span>{tag.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="table-value">
                            {format(tag.value)}
                          </span>
                          <span className="table-unit">{tag.unit}</span>
                        </td>
                        <td>
                          <span
                            className={`quality-pill ${tag.quality === "bad" ? "bad" : ""}`}
                          >
                            <span
                              className={`quality-dot ${tag.quality === "bad" ? "bad" : ""}`}
                            />
                            {tag.quality === "good" ? "Good" : "Bad"}
                          </span>
                        </td>
                        <td className="last-update">{time(tag.timestamp)}</td>
                        <td>
                          <button
                            className="table-trend"
                            aria-label={`View trend for ${tag.name}`}
                            onClick={() => {
                              setSelectedId(tag.id);
                              navigate("Trends");
                            }}
                          >
                            <TrendingUp size={16} />
                            <span>Trend</span>
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visibleTags.length && (
                <div className="empty-state">
                  <Tags size={25} />
                  <p>
                    {search
                      ? "No tags match your search."
                      : "No tags received yet."}
                  </p>
                  {search && (
                    <button
                      className="text-button"
                      onClick={() => setSearch("")}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
              <div className="table-footer">
                <span>
                  Showing {displayedTags.length} of {visibleTags.length} tags
                </span>
                {page === "Tag explorer" && visibleTags.length > 25 ? (
                  <div className="pagination">
                    <button
                      disabled={tablePage === 0}
                      onClick={() => setTablePage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {tablePage + 1} of{" "}
                      {Math.ceil(visibleTags.length / 25)}
                    </span>
                    <button
                      disabled={(tablePage + 1) * 25 >= visibleTags.length}
                      onClick={() => setTablePage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                ) : (
                  <span>
                    <Database size={12} />
                    History stored on server
                  </span>
                )}
              </div>
            </section>
          )}
          {page === "History" && (
            <section className="panel tag-table-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">RECORDED SAMPLES</div>
                  <h2>
                    {selected?.name ?? "Tag history"}{" "}
                    <span className="count-badge">{samples.length}</span>
                  </h2>
                </div>
                <button
                  className="button secondary"
                  onClick={exportCsv}
                  disabled={!samples.length}
                >
                  <ArrowDownToLine size={15} />
                  Export CSV
                </button>
              </div>
              <div className="table-scroll history-table">
                <table>
                  <thead>
                    <tr>
                      <th>TIMESTAMP</th>
                      <th>TAG</th>
                      <th>VALUE</th>
                      <th>UNIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...samples]
                      .reverse()
                      .slice(0, 100)
                      .map((sample) => (
                        <tr key={sample.timestamp}>
                          <td>{dateTime(sample.timestamp)}</td>
                          <td className="tag-code">{selectedId}</td>
                          <td className="table-value">
                            {String(sample.value)}
                          </td>
                          <td>{selected?.unit}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!samples.length && (
                  <div className="empty-state">
                    <p>No samples to display.</p>
                  </div>
                )}
              </div>
              <div className="table-footer">
                <span>Showing up to 100 latest representative samples</span>
                <span>CSV includes all chart samples</span>
              </div>
            </section>
          )}
          <footer className="page-footer">
            <span>
              <Activity size={13} />
              MP Web Client<span className="footer-separator">/</span>Process
              visibility, everywhere.
            </span>
            <span>
              <Monitor size={13} />
              <span className="desktop-label">Desktop layout</span>
              <span className="tablet-label">Tablet layout</span>
              <span className="phone-label">Mobile layout</span>
              <span className="footer-separator">·</span>Read-only
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className="modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const focusable =
                dialogRef.current?.querySelectorAll<HTMLElement>(
                  "button:not([disabled]), input, select, a[href]",
                );
              if (!focusable?.length) return;
              const first = focusable[0],
                last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <div className="modal-header">
              <div className="modal-icon">
                {modal === "layout" ? (
                  <SlidersHorizontal size={22} />
                ) : (
                  <Radio size={22} />
                )}
              </div>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => setModal(null)}
              >
                <X size={21} />
              </button>
            </div>
            <h2 id="modal-title">
              {modal === "layout"
                ? "Make this device your own."
                : "Connect your process."}
            </h2>
            {modal === "layout" ? (
              <>
                <p>
                  Choose the tags and displays for your HMI panel. Preferences
                  are saved in this browser, so each device can have its own
                  view.
                </p>
                <div className="layout-choices">
                  {tags.map((tag) => {
                    const widget = draftWidgets.find(
                      (item) => item.id === tag.id,
                    );
                    return (
                      <div className="layout-choice" key={tag.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(widget)}
                            onChange={(e) =>
                              setDraftWidgets((current) =>
                                e.target.checked
                                  ? [...current, { id: tag.id, kind: "gauge" }]
                                  : current.filter(
                                      (item) => item.id !== tag.id,
                                    ),
                              )
                            }
                          />
                          <span>
                            <strong>{tag.name}</strong>
                            <small>
                              {tag.id} · {tag.unit || "No unit"}
                            </small>
                          </span>
                        </label>
                        <select
                          aria-label={`Display type for ${tag.name}`}
                          disabled={!widget}
                          value={widget?.kind ?? "gauge"}
                          onChange={(e) =>
                            setDraftWidgets((current) =>
                              current.map((item) =>
                                item.id === tag.id
                                  ? {
                                      ...item,
                                      kind: e.target.value as Widget["kind"],
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="gauge">Range gauge</option>
                          <option value="value">Numeric value</option>
                        </select>
                      </div>
                    );
                  })}
                  {!tags.length && (
                    <p>No tags are available to configure yet.</p>
                  )}
                </div>
                <div className="modal-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setWidgets(null);
                      try {
                        localStorage.removeItem("mp-widgets-v1");
                      } catch {
                        /* session defaults still apply */
                      }
                      setModal(null);
                    }}
                  >
                    Reset defaults
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      setWidgets(draftWidgets);
                      try {
                        localStorage.setItem(
                          "mp-widgets-v1",
                          JSON.stringify(draftWidgets),
                        );
                        setNotice("Device view saved.");
                      } catch {
                        setNotice(
                          "View applied for this session. Browser storage is unavailable.",
                        );
                      }
                      setModal(null);
                    }}
                  >
                    <Check size={16} />
                    Save device view
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Your browser connects to the MP server. The server reads the
                  XML service and records numeric values for historical trends.
                </p>
                <div className="connection-summary">
                  <span>Current source</span>
                  <strong>
                    {demo ? "Simulated demonstration" : "XML web service"}
                  </strong>
                  <span>Polling interval</span>
                  <strong>
                    {snapshot
                      ? `${snapshot.status.pollIntervalMs / 1000} seconds`
                      : "—"}
                  </strong>
                  <span>Last successful read</span>
                  <strong>
                    {snapshot?.status.lastSuccess
                      ? dateTime(snapshot.status.lastSuccess)
                      : "No data yet"}
                  </strong>
                  <span>Connection</span>
                  <strong
                    className={sourceFailed ? "quality-bad" : "quality-good"}
                  >
                    {sourceFailed ? "Disconnected" : "Connected"}
                  </strong>
                </div>
                <h3>Service configuration</h3>
                <p>
                  Set <code>XML_SERVICE_URL</code> in the server’s{" "}
                  <code>.env</code> file, then restart the API. Keep
                  authentication in <code>XML_SERVICE_AUTHORIZATION</code> on
                  the server.
                </p>
                <p>
                  For your laptop’s LabVIEW service, use{" "}
                  <code>
                    http://127.0.0.1:8001/WebService1/Random_Number(GET)
                  </code>{" "}
                  only when the MP server runs on that laptop. A cloud server
                  needs a reachable service address.
                </p>
                <pre>
                  {
                    "<Response><Terminal>\n  <Name>Array</Name>\n  <Value><DimSize>2</DimSize>\n    <Name>Numeric Control</Name>\n    <Value>8.644872989293326</Value>\n    <Name>Numeric Control</Name>\n    <Value>2.881289565370859</Value>\n  </Value>\n</Terminal></Response>"
                  }
                </pre>
                <p className="modal-note">
                  LabVIEW arrays, named tags, and numeric XML leaves are
                  detected automatically. Array elements use stable zero-based
                  IDs such as Array[0]. Other schemas can use an explicit{" "}
                  <code>XML_TAG_MAP</code>. See README for examples. Never enter
                  credentials into dashboard fields.
                </p>
                <div className="modal-actions">
                  <button
                    className="button primary"
                    onClick={() => setModal(null)}
                  >
                    Got it
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
