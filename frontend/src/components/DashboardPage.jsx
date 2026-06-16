import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable'; // Explicit import for fail-safe Vite bundling
import './DashboardPage.css';

// ─── Mini Sparkline SVG (Zero-Dependency) ───
function Sparkline({ data, color = '#00e5ff', height = 40 }) {
  if (data.length < 2) return <div style={{ height }} />;
  const w = 200, h = height;
  const vals = data.map(d => d.tps);
  const max = Math.max(...vals) || 1;
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const pathD = `M ${pts.join(' L ')}`;
  const areaD = `${pathD} L ${w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${color.replace('#','')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Full TPS Chart with hover ───
function TelemetryChart({ data, color = '#00e5ff', label = 'TPS' }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  if (data.length < 2) {
    return (
      <div className="no-data-placeholder">
        <div className="spinner-small" />
        <p>Awaiting stream data…</p>
      </div>
    );
  }
  const W = 760, H = 160, PAD = { t: 12, r: 12, b: 28, l: 44 };
  const inner = { w: W - PAD.l - PAD.r, h: H - PAD.t - PAD.b };
  const vals = data.map(d => d.tps);
  const max = Math.max(...vals) * 1.1 || 1;
  const min = 0;
  const range = max - min;
  const pts = data.map((d, i) => ({
    x: PAD.l + (i / (data.length - 1)) * inner.w,
    y: PAD.t + inner.h - ((d.tps - min) / range) * inner.h,
    tps: d.tps, label: d.time,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length-1].x} ${H - PAD.b} L ${PAD.l} ${H - PAD.b} Z`;
  const yTicks = [0, 0.5, 1].map(t => ({ v: Math.round(min + t * range), y: PAD.t + inner.h - t * inner.h }));
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="telem-svg">
        <defs>
          <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y} stroke="#1e2936" strokeWidth="1" />
            <text x={PAD.l - 6} y={t.y + 4} fill="#4a5568" fontSize="9" textAnchor="end">
              {t.v >= 1000 ? `${(t.v/1000).toFixed(1)}k` : t.v}
            </text>
          </g>
        ))}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#1e2936" strokeWidth="1" />
        {/* Area + Line */}
        <path d={areaD} fill="url(#chartArea)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" filter="url(#glow)" />
        {/* Hover dots */}
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHoveredPoint(p)} onMouseLeave={() => setHoveredPoint(null)}>
            <circle cx={p.x} cy={p.y} r="8" fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hoveredPoint === p ? 3.5 : 2}
              fill={hoveredPoint === p ? '#fff' : color} stroke={color} strokeWidth="1" />
          </g>
        ))}
        {/* X labels */}
        {[0, data.length - 1].map((idx) => (
          <text key={idx} x={pts[idx].x} y={H - PAD.b + 16} fill="#4a5568" fontSize="9" textAnchor="middle">
            {data[idx].time}
          </text>
        ))}
      </svg>
      {hoveredPoint && (
        <div className="chart-tooltip" style={{
          left: `${(hoveredPoint.x / W) * 100}%`,
          top: `${(hoveredPoint.y / H) * 100}%`,
        }}>
          <div className="tt-label">{hoveredPoint.label}</div>
          <div className="tt-value" style={{ color }}>{hoveredPoint.tps.toLocaleString()} {label}</div>
        </div>
      )}
    </div>
  );
}

// ─── Gauge Ring ───
function GaugeRing({ value, max = 100, color = '#00e5ff', size = 64, label }) {
  const r = 24, circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const dash = pct * circ;
  return (
    <div className="gauge-ring-wrap">
      <svg width={size} height={size} viewBox="0 0 60 60">
        <circle cx="30" cy="30" r={r} fill="none" stroke="#0d1117" strokeWidth="5" />
        <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 30 30)"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
        <text x="30" y="34" textAnchor="middle" fill={color} fontSize="11" fontWeight="700">
          {typeof value === 'number' ? (value >= 1000 ? `${(value/1000).toFixed(1)}k` : value) : value}
        </text>
      </svg>
      {label && <div className="gauge-label">{label}</div>}
    </div>
  );
}

// ─── Multi-line chart (for Percentiles / accuracy) ───
function MultiLineChart({ series, height = 120 }) {
  const W = 360, H = height, PAD = { t: 10, r: 8, b: 20, l: 36 };
  if (!series || series.every(s => s.data.length < 2)) {
    return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#4a5568', fontSize: 11 }}>Awaiting data…</span>
    </div>;
  }
  const allVals = series.flatMap(s => s.data.map(d => d.v));
  const max = Math.max(...allVals) * 1.1 || 1;
  const min = Math.min(...allVals, 0);
  const range = max - min || 1;
  const maxLen = Math.max(...series.map(s => s.data.length));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      {series.map((s) => {
        if (s.data.length < 2) return null;
        const pts = s.data.map((d, i) => ({
          x: PAD.l + (i / (maxLen - 1)) * (W - PAD.l - PAD.r),
          y: PAD.t + (H - PAD.t - PAD.b) - ((d.v - min) / range) * (H - PAD.t - PAD.b),
        }));
        const pathD = pts.map((p, i) => `${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
        return <path key={s.label} d={pathD} fill="none" stroke={s.color} strokeWidth="1.5" />;
      })}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#1e2936" strokeWidth="1" />
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#1e2936" strokeWidth="1" />
      <text x={PAD.l - 4} y={PAD.t + 5} fill="#4a5568" fontSize="8" textAnchor="end">
        {max >= 1000 ? `${(max/1000).toFixed(0)}k` : Math.round(max)}
      </text>
      <text x={PAD.l - 4} y={H - PAD.b + 1} fill="#4a5568" fontSize="8" textAnchor="end">
        {Math.round(min)}
      </text>
    </svg>
  );
}

// ─── Main Dashboard Page ───
export default function DashboardPage({ activeTest, onBackToUpload, onViewLeaderboard, userToken }) {
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [telemetryData, setTelemetryData] = useState([]);
  const [currentMetrics, setCurrentMetrics] = useState({ tps: 0, p50: 0, p99: 0, accuracy: 100 });
  const [logs, setLogs] = useState([]);
  const [finalReport, setFinalReport] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [activePanel, setActivePanel] = useState('overview');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  // Real-time telemetry histories
  const [accuracyHistory, setAccuracyHistory] = useState([]);
  const [latencyHistory, setLatencyHistory] = useState({ p50: [], p99: [] });

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const fetchDatabaseReport = async () => {
    try {
      const response = await fetch(
        `https://stresstester.ddns.net/api/v1/submissions/report/${activeTest.submissionId}`,
        { headers: { 'Authorization': `Bearer ${userToken}` } }
      );
      const result = await response.json();
      if (response.ok && result.success) {
        setFinalReport(result.data);
        setShowSummary(true);
        clearInterval(timerRef.current);
      }
    } catch (err) {
      console.error('Report fetch failed:', err);
    }
  };

  useEffect(() => {
    if (activeTest.preCompletedReport) {
      setProgress(100);
      setIsCompleted(true);
      setConnectionStatus('CLOSED');
      fetchDatabaseReport();
      return;
    }
    const streamUrl = `https://stresstester.ddns.net/api/v1/submissions/stream?teamId=${activeTest.teamId}&submissionId=${activeTest.submissionId}`;
    const es = new EventSource(streamUrl);
    
    es.onopen = () => setConnectionStatus('STREAMING');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data.progress);
        if (data.log) setLogs(prev => [...prev, data.log]);
        if (data.metrics) {
          const { tps, p50, p99, accuracy } = data.metrics;
          setCurrentMetrics({ tps, p50, p99, accuracy });
          const tick = { time: `${(data.progress / 10).toFixed(1)}s`, tps };
          
          // Stream updates mapping to live state histories [2]
          setTelemetryData(prev => [...prev.slice(-29), tick]);
          setAccuracyHistory(prev => [...prev.slice(-29), { v: accuracy }]);
          setLatencyHistory(prev => ({
            p50: [...(prev.p50 || []).slice(-29), { v: p50 }],
            p99: [...(prev.p99 || []).slice(-29), { v: p99 }],
          }));
        }
        if (data.completed) {
          es.close();
          setConnectionStatus('CLOSED');
          setIsCompleted(true);
          fetchDatabaseReport();
        }
      } catch (e) { console.error('[SSE]', e); }
    };
    es.onerror = () => { setConnectionStatus('ERROR'); es.close(); };
    return () => es.close();
  }, [activeTest]);

  const handleDownloadPDF = () => {
    if (!finalReport) return;
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('IICPC Benchmark Performance Report 2026', 14, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Team ID: ${activeTest.teamId}   |   File: ${activeTest.filename}`, 14, 35);
    autoTable(doc, {
      startY: 42,
      head: [['Metric', 'Value']],
      body: [
        ['Peak TPS', `${parseInt(finalReport.peak_tps).toLocaleString()} orders/sec`],
        ['p50 Latency', `${finalReport.avg_p50_latency} ms`],
        ['p99 Latency', `${finalReport.avg_p99_latency} ms`],
        ['Fill Accuracy', `${finalReport.final_accuracy}%`],
        ['Composite Score', `${finalReport.composite_score} / 1000`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [0, 229, 255], textColor: [0, 0, 0] },
      styles: { fontSize: 10, cellPadding: 4 },
    });
    doc.save(`IICPC_${activeTest.teamId}.pdf`);
  };

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  const statusDot = {
    STREAMING: { color: '#00e5ff', label: '● LIVE', cls: 'live' },
    CONNECTING: { color: '#f59e0b', label: '◌ CONNECTING', cls: 'connecting' },
    CLOSED: { color: '#22c55e', label: '✓ FINISHED', cls: 'finished' },
    ERROR: { color: '#ef4444', label: '✕ ERROR', cls: 'error' },
  }[connectionStatus] || { color: '#666', label: connectionStatus, cls: '' };

  return (
    <div className="dash-root">
      {/* ── Top Nav Bar (Ready Trader Go style) ── */}
      <header className="top-nav">
        <div className="nav-brand">
          <span className="brand-logo">⬡</span>
          <span className="brand-name">STRESSTESTER</span>
          <span className="brand-sep">·</span>
          <span className={`brand-status ${statusDot.cls}`} style={{ color: statusDot.color }}>
            {statusDot.label}
          </span>
        </div>

        <nav className="nav-tabs">
          {['overview', 'charts', 'logs'].map(p => (
            <button key={p} className={`nav-tab ${activePanel === p ? 'active' : ''}`}
              onClick={() => setActivePanel(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </nav>

        <div className="nav-metrics">
          <div className="nav-metric">
            <span className="nm-label">TPS</span>
            <span className="nm-value cyan">{currentMetrics.tps.toLocaleString()}</span>
          </div>
          <div className="nav-metric">
            <span className="nm-label">p99</span>
            <span className="nm-value rose">{currentMetrics.p99} ms</span>
          </div>
          <div className="nav-metric">
            <span className="nm-label">ACC</span>
            <span className="nm-value green">{currentMetrics.accuracy}%</span>
          </div>
          <div className="nav-metric">
            <span className="nm-label">TIME</span>
            <span className="nm-value white">{fmtTime(elapsed)}</span>
          </div>
        </div>
      </header>

      {/* ── Progress Rail ── */}
      <div className="progress-rail">
        <div className="progress-fill-bar" style={{ width: `${progress}%` }} />
        <span className="progress-pct">{progress}%</span>
      </div>

      {/* ── Main Content ── */}
      <main className="dash-main">

        {/* OVERVIEW PANEL */}
        {activePanel === 'overview' && (
          <div className="panel-overview">
            {/* Stat cards row */}
            <div className="stat-row">
              {[
                { label: 'Current TPS', value: currentMetrics.tps.toLocaleString(), color: '#00e5ff', sub: 'orders/sec' },
                { label: 'p50 Latency', value: `${currentMetrics.p50} ms`, color: '#22c55e', sub: 'median' },
                { label: 'p99 Latency', value: `${currentMetrics.p99} ms`, color: '#ef4444', sub: 'worst case' },
                { label: 'Fill Accuracy', value: `${currentMetrics.accuracy}%`, color: '#f59e0b', sub: 'orderbook match' },
                { label: 'Progress', value: `${progress}%`, color: '#818cf8', sub: 'evaluated' },
              ].map((m) => (
                <div className="stat-card" key={m.label}>
                  <div className="sc-label">{m.label}</div>
                  <div className="sc-value" style={{ color: m.color }}>{m.value}</div>
                  <div className="sc-sub">{m.sub}</div>
                  <div className="sc-bar-track">
                    <div className="sc-bar-fill" style={{
                      width: m.label === 'Progress' ? `${progress}%` :
                             m.label === 'Fill Accuracy' ? `${currentMetrics.accuracy}%` : '60%',
                      background: m.color,
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Two-column grid: TPS chart + multi-line */}
            <div className="panel-grid-2">
              {/* TPS Chart */}
              <div className="panel-card span-2">
                <div className="pc-header">
                  <span className="pc-title">Throughput — TPS over time</span>
                  <span className="pc-badge cyan">LIVE</span>
                </div>
                <TelemetryChart data={telemetryData} color="#00e5ff" label="TPS" />
              </div>

              {/* Latency chart */}
              <div className="panel-card">
                <div className="pc-header">
                  <span className="pc-title">Latency — by percentile</span>
                  <div className="pc-legend">
                    <span style={{ color: '#22c55e' }}>● p50</span>
                    <span style={{ color: '#ef4444' }}>● p99</span>
                  </div>
                </div>
                <MultiLineChart height={110} series={[
                  { label: 'p50', color: '#22c55e', data: latencyHistory.p50 },
                  { label: 'p99', color: '#ef4444', data: latencyHistory.p99 },
                ]} />
              </div>

              {/* Accuracy chart */}
              <div className="panel-card">
                <div className="pc-header">
                  <span className="pc-title">Fill Accuracy — by team</span>
                  <span className="pc-badge green">MATCH %</span>
                </div>
                <MultiLineChart height={110} series={[
                  { label: 'Accuracy', color: '#f59e0b', data: accuracyHistory },
                ]} />
              </div>
            </div>

            {/* Info bar */}
            <div className="info-bar">
              <div className="ib-item">
                <span className="ib-label">Team ID</span>
                <span className="ib-value">{activeTest.teamId}</span>
              </div>
              <div className="ib-item">
                <span className="ib-label">File</span>
                <span className="ib-value">{activeTest.filename}</span>
              </div>
              <div className="ib-item">
                <span className="ib-label">Submission</span>
                <span className="ib-value mono">{activeTest.submissionId?.slice(0, 12)}…</span>
              </div>
              <div className="ib-item">
                <span className="ib-label">Submitted</span>
                <span className="ib-value">{new Date(activeTest.submittedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* CHARTS PANEL */}
        {activePanel === 'charts' && (
          <div className="panel-charts">
            <div className="panel-grid-2">
              <div className="panel-card span-2">
                <div className="pc-header">
                  <span className="pc-title">Throughput Curve (TPS vs Time)</span>
                  <span className="pc-badge cyan">req/s</span>
                </div>
                <TelemetryChart data={telemetryData} color="#00e5ff" label="TPS" />
              </div>
              <div className="panel-card">
                <div className="pc-header"><span className="pc-title">Composite Score (0–100) — by team</span></div>
                <MultiLineChart height={130} series={[
                  { label: 'Score', color: '#818cf8', data: accuracyHistory.map(d => ({ v: d.v * 0.43 })) },
                ]} />
              </div>
              <div className="panel-card">
                <div className="pc-header"><span className="pc-title">Fill Accuracy — by team</span></div>
                <MultiLineChart height={130} series={[
                  { label: 'Accuracy', color: '#22c55e', data: accuracyHistory },
                ]} />
              </div>
            </div>

            {/* Standings table */}
            {finalReport ? (
              <div className="panel-card mt-16">
                <div className="pc-header">
                  <span className="pc-title">Current Standings (latest score per team)</span>
                </div>
                <table className="standings-table">
                  <thead>
                    <tr>
                      {['team_name','p99 Latency','TPS','Fill Accuracy','Violations','recovery_ms','Score ↓'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="row-highlight">
                      <td>{activeTest.teamId}</td>
                      <td className="cyan">{finalReport.avg_p99_latency} ms</td>
                      <td className="cyan">{parseInt(finalReport.peak_tps).toLocaleString()} req/s</td>
                      <td className="green">{finalReport.final_accuracy}%</td>
                      <td>0</td>
                      <td>—</td>
                      <td className="bold white">{finalReport.composite_score}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="panel-card mt-16 center-placeholder">
                <span>Standings available after test completes</span>
              </div>
            )}
          </div>
        )}

        {/* LOGS PANEL */}
        {activePanel === 'logs' && (
          <div className="panel-logs">
            <div className="panel-card full-height">
              <div className="pc-header">
                <span className="pc-title">Validator Console</span>
                <span className="pc-badge" style={{ color: '#22c55e', borderColor: '#22c55e' }}>
                  {logs.length} events
                </span>
              </div>
              <div className="terminal-body">
                {logs.length === 0 ? (
                  <div className="term-empty">
                    <div className="spinner-small" />
                    <span>Waiting for log stream…</span>
                  </div>
                ) : logs.map((log, i) => (
                  <div key={i} className="term-line">
                    <span className="term-idx">{String(i + 1).padStart(3, '0')}</span>
                    <span className="term-msg">{log}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Floating summary button ── */}
      {isCompleted && !showSummary && (
        <button className="float-summary-btn" onClick={() => setShowSummary(true)}>
          📊 View Results
        </button>
      )}

      {/* ── Summary Modal ── */}
      {isCompleted && finalReport && showSummary && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button className="modal-close" onClick={() => setShowSummary(false)}>✕</button>
            <div className="modal-header">
              <div className="modal-title">Benchmark Complete</div>
              <div className="modal-sub">
                Team <strong>{activeTest.teamId}</strong> — {activeTest.filename}
              </div>
            </div>

            <div className="modal-score-row">
              <GaugeRing value={Math.min(parseFloat(finalReport.composite_score), 100)}
                max={100} color="#00e5ff" size={80} label="Composite" />
              <GaugeRing value={parseFloat(finalReport.final_accuracy)}
                max={100} color="#22c55e" size={80} label="Accuracy" />
              <GaugeRing value={Math.min(parseFloat(finalReport.avg_p99_latency), 100)}
                max={200} color="#ef4444" size={80} label="p99 ms" />
              <GaugeRing value={Math.min(parseInt(finalReport.peak_tps)/1000, 100)}
                max={100} color="#f59e0b" size={80} label="Peak TPS/k" />
            </div>

            <div className="modal-metrics">
              {[
                { k: 'Peak TPS', v: `${parseInt(finalReport.peak_tps).toLocaleString()} ord/s`, c: '#00e5ff' },
                { k: 'p50 Latency', v: `${finalReport.avg_p50_latency} ms`, c: '#22c55e' },
                { k: 'p99 Latency', v: `${finalReport.avg_p99_latency} ms`, c: '#ef4444' },
                { k: 'Fill Accuracy', v: `${finalReport.final_accuracy}%`, c: '#f59e0b' },
                { k: 'Composite Score', v: `${finalReport.composite_score} / 1000`, c: '#818cf8' },
              ].map(m => (
                <div className="modal-metric-row" key={m.k}>
                  <span className="mmr-key">{m.k}</span>
                  <span className="mmr-val" style={{ color: m.c }}>{m.v}</span>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={handleDownloadPDF}>⬇ Download PDF</button>
              <button className="btn-secondary cyan-border" onClick={onViewLeaderboard}>⧖ Leaderboard</button>
              <button className="btn-ghost" onClick={onBackToUpload}>↩ New Test</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}