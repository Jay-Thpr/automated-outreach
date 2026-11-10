'use client';
import type { ReactNode } from 'react';
import { Check, CircleDashed, FlaskConical, Info, ShieldCheck, Sparkles, Users } from 'lucide-react';
import type { Basis, Portfolio, TraceStep } from '../../lib/types';
import type { LookThroughRow } from '../../lib/risk';
import { FACTOR_META } from '../../lib/universe';
import type { Factor } from '../../lib/types';

export const COLORS = ['#b9a4ff', '#55d6c2', '#83a9ff', '#e5a4a4', '#e7c78c', '#8f96a5', '#d6a4e5', '#9fd68a'];
export const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
export const pct = (n: number, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}%`;
export const usd = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2).replace(/\.?0+$/, '')}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(1).replace(/\.0$/, '')}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}K` : `$${a.toFixed(0)}`;
  return n < 0 ? `−${s}` : s;
};

const BASIS: Record<Basis, { label: string; cls: string; tip: string }> = {
  portfolio: { label: 'Your portfolio', cls: 'basis-portfolio', tip: 'Computed from holdings you provided.' },
  assumption: { label: 'Assumption-sensitive', cls: 'basis-assumption', tip: 'Computed from your holdings, but depends on an assumption Atlas made.' },
  illustrative: { label: 'Illustrative', cls: 'basis-illustrative', tip: 'Computed from a representative proxy, not your actual holdings.' },
  example: { label: 'Example', cls: 'basis-example', tip: 'Computed from a built-in example portfolio.' },
};

export function BasisBadge({ basis }: { basis: Basis }) {
  const b = BASIS[basis];
  return <span className={`basis ${b.cls}`} title={b.tip}>{b.label}</span>;
}

export function SourcePill({ p }: { p: Portfolio }) {
  if (p.source === 'proxy') return <span className="source-pill src-proxy" title="Holdings are a representative proxy built from your description."><CircleDashed size={12} /> Illustrative proxy</span>;
  if (p.source === 'example') return <span className="source-pill src-example" title="A built-in example portfolio."><FlaskConical size={12} /> Example portfolio</span>;
  const assumed = p.assumptions.some(a => a.severity === 'high');
  return <span className={`source-pill ${assumed ? 'src-assumed' : 'src-user'}`} title={assumed ? 'Your holdings, with assumptions Atlas had to make.' : 'Built from holdings you provided.'}>{assumed ? <Info size={12} /> : <ShieldCheck size={12} />} {assumed ? 'Your holdings · with assumptions' : 'Your holdings'}</span>;
}

export function Kpi({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: ReactNode; tone?: 'purple' | 'red' | 'green' }) {
  return <div className="kpi"><div className="kpi-top"><span>{label}</span>{icon}</div><div className={`kpi-val ${tone === 'red' ? 'negative' : ''}`}>{value}</div><div className={`kpi-detail ${tone === 'purple' ? 'purple' : ''}`}>{detail}</div></div>;
}

export function TraceList({ steps, live }: { steps: TraceStep[]; live?: boolean }) {
  return <ol className={`trace ${live ? 'trace-live' : ''}`}>
    {steps.map((s, i) => <li key={s.id + i} className={`trace-step ${s.status}`}>
      <span className="trace-icon">{s.status === 'skipped' ? <CircleDashed size={12} /> : s.by === 'ai' ? <Sparkles size={12} /> : <Check size={12} />}</span>
      <div className="trace-body">
        <div className="trace-title">{s.title}{s.by === 'ai' && <span className="trace-ai">AI-chosen</span>}</div>
        <div className="trace-reason">{s.reason}</div>
        {s.status === 'done' && s.result !== '—' && <div className="trace-result">{s.result}</div>}
      </div>
    </li>)}
  </ol>;
}

export function Donut({ segments, center, sub }: { segments: { label: string; value: number }[]; center: string; sub: string }) {
  let sum = 0;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const grad = segments.map((s, i) => { const a = (sum / total) * 100; sum += s.value; return `${COLORS[i % COLORS.length]} ${a}% ${(sum / total) * 100}%`; }).join(',');
  return <div className="donut-shell"><div className="donut" style={{ background: `conic-gradient(${grad})` }}><div className="donut-hole"><span>{center}</span><small>{sub}</small></div></div></div>;
}

export function RiskWeightChart({ rows, max = 8 }: { rows: { ticker: string; weight: number; riskShare: number }[]; max?: number }) {
  const shown = rows.slice(0, max);
  const top = Math.max(...shown.map(r => Math.max(r.weight, r.riskShare)), 1);
  return <div className="rw-chart">
    <div className="rw-legend"><span><i className="rw-sw weight" /> Capital weight</span><span><i className="rw-sw risk" /> Share of modeled risk</span></div>
    {shown.map(r => {
      const ratio = r.weight > 0 ? r.riskShare / r.weight : 0;
      return <div className="rw-row" key={r.ticker}>
        <strong className="rw-ticker">{r.ticker}</strong>
        <div className="rw-bars">
          <div className="rw-bar weight" style={{ width: `${(r.weight / top) * 100}%` }}><span>{f1(r.weight)}%</span></div>
          <div className="rw-bar risk" style={{ width: `${(Math.max(r.riskShare, 0) / top) * 100}%` }}><span>{f1(r.riskShare)}%</span></div>
        </div>
        <span className={`rw-ratio ${ratio >= 1.25 ? 'hot' : ratio <= 0.6 ? 'cool' : ''}`}>{ratio ? `${ratio.toFixed(1)}×` : '—'}</span>
      </div>;
    })}
    {rows.length > max && <div className="rw-more">+ {rows.length - max} smaller positions</div>}
  </div>;
}

const FACTOR_SCALE: Record<Factor, number> = { growth: 2.2, rates: 16, credit: 16, oil: 0.6 };
export function FactorBars({ exp }: { exp: Record<Factor, number> }) {
  const order: Factor[] = ['growth', 'rates', 'credit', 'oil'];
  return <div className="factor-chart">{order.map((k, i) => {
    const w = Math.min(48, (Math.abs(exp[k]) / FACTOR_SCALE[k]) * 48);
    return <div className="factor-bar-row" key={k}>
      <div className="factor-bar-label"><span>{FACTOR_META[k].label} <small>{FACTOR_META[k].unit}</small></span><strong>{exp[k] >= 0 ? '+' : '−'}{Math.abs(exp[k]).toFixed(k === 'growth' || k === 'oil' ? 2 : 1)}{k === 'growth' ? ' β' : k === 'oil' ? ' β' : '%'}</strong></div>
      <div className="factor-bar-track"><div className="zero-line" /><div className="factor-bar-fill" style={{ width: `${w}%`, left: exp[k] < 0 ? `${50 - w}%` : '50%', background: COLORS[i] }} /></div>
    </div>;
  })}</div>;
}

export function VarianceBar({ shares, idio }: { shares: { factor: Factor; share: number }[]; idio: number }) {
  const parts = [...shares.map((s, i) => ({ label: FACTOR_META[s.factor].short, value: Math.max(0, s.share), color: COLORS[i] })), { label: 'Stock-specific', value: Math.max(0, idio), color: '#4a5166' }];
  const total = parts.reduce((s, x) => s + x.value, 0) || 1;
  return <div className="var-bar-wrap">
    <div className="var-bar">{parts.map(p => <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${f1(p.value)}%`} />)}</div>
    <div className="var-legend">{parts.map(p => <span key={p.label}><i style={{ background: p.color }} />{p.label} <strong>{f1((p.value / total) * 100)}%</strong></span>)}</div>
  </div>;
}

export function Heatmap({ tickers, matrix }: { tickers: string[]; matrix: number[][] }) {
  const color = (c: number) => (c >= 0 ? `rgba(188,168,255,${Math.min(1, c) * 0.85})` : `rgba(96,217,189,${Math.min(1, -c) * 0.85})`);
  return <div className="heatmap" style={{ gridTemplateColumns: `54px repeat(${tickers.length}, minmax(0,1fr))` }}>
    <span />{tickers.map(t => <span key={t} className="hm-head">{t}</span>)}
    {tickers.map((r, i) => [<span key={r} className="hm-row">{r}</span>, ...matrix[i].map((c, j) => <span key={r + j} className="hm-cell" style={{ background: i === j ? '#252a38' : color(c) }} title={`${r} / ${tickers[j]}: ${c.toFixed(2)}`}>{i === j ? '' : c.toFixed(2)}</span>)])}
  </div>;
}

export function LookThroughTable({ rows }: { rows: LookThroughRow[] }) {
  return <div className="lt-table">
    <div className="lt-head"><span>COMPANY</span><span>DIRECT</span><span>VIA FUNDS</span><span>TRUE</span></div>
    {rows.slice(0, 10).map(r => <div className="lt-row" key={r.ticker}>
      <span className="lt-name"><strong>{r.ticker}</strong><small>{r.name}</small></span>
      <span>{r.direct ? `${f1(r.direct)}%` : '—'}</span>
      <span className={r.viaFunds ? 'purple-text' : ''}>{r.viaFunds ? `+${f1(r.viaFunds)}%` : '—'}</span>
      <strong>{f1(r.total)}%</strong>
    </div>)}
  </div>;
}

export function ModeBadge({ mode }: { mode: 'ai' | 'demo' | null }) {
  if (!mode) return null;
  return mode === 'ai'
    ? <span className="live-demo" title="A language model extracts information, chooses extra investigations and writes narratives. All numbers come from deterministic tools."><Sparkles size={12} /> AI-ENHANCED</span>
    : <span className="live-demo" title="No API key configured. Extraction, planning and narratives are deterministic."><span /> DEMO MODE</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-note"><Users size={14} />{children}</div>;
}
