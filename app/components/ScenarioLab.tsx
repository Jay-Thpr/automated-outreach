'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, CircleHelp, RefreshCw, Sparkles } from 'lucide-react';
import type { Factor, Portfolio, Shock } from '../../lib/types';
import { impact, SCENARIOS, scenarioByKey } from '../../lib/risk';
import { FACTOR_META, THEMES } from '../../lib/universe';
import { SourcePill, pct, usd } from './ui';

const RANGES: Record<Factor, [number, number, number]> = { growth: [-40, 20, 1], rates: [-2.5, 2.5, 0.05], credit: [-1, 3, 0.05], oil: [-60, 80, 1] };
const fmtShock = (k: Factor, v: number) => (FACTOR_META[k].shockUnit === 'bp' ? `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}bp` : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}%`);
const LABEL: Record<Factor, string> = { growth: 'Equity growth / tech factor', rates: 'Government bond yields', credit: 'Credit spreads', oil: 'Oil price' };

export function ScenarioLab({ p, initial, onAsk }: { p: Portfolio; initial?: string; onAsk: (q: string) => void }) {
  const [key, setKey] = useState(initial ?? SCENARIOS[0].key);
  const base = scenarioByKey(key);
  const [shock, setShock] = useState<Shock>({ ...base.shock });
  const [useTheme, setUseTheme] = useState(true);
  useEffect(() => { if (initial) setKey(initial); }, [initial]);
  useEffect(() => { setShock({ ...scenarioByKey(key).shock }); setUseTheme(true); }, [key]);
  const themeShocks = useMemo(() => (useTheme ? base.themeShocks : {}), [useTheme, base]);
  const r = useMemo(() => impact(p, shock, themeShocks), [p, shock, themeShocks]);
  const modified = (Object.keys(shock) as Factor[]).some(k => shock[k] !== base.shock[k]);
  const maxAbs = Math.max(...r.holdings.map(h => Math.abs(h.impact)), 1);
  const breach = p.drawdownLimit != null && r.pct <= -p.drawdownLimit;
  return <div className="scenario-layout">
    <section className="panel scenario-main">
      <div className="panel-heading"><div><span className="kicker">STRESS TEST WORKBENCH</span><h2>Model a market shock</h2></div><SourcePill p={p} /></div>
      <p className="panel-intro">Pick a scenario, then adjust the shocks. Every position is repriced through its modeled factor sensitivities. The model is linear and illustrative. It is not a forecast.</p>
      <div className="scenario-options">{SCENARIOS.map(s => <button key={s.key} className={`scenario-option ${key === s.key ? 'selected' : ''}`} onClick={() => setKey(s.key)}><span>{s.name}<small>{s.description}</small></span>{key === s.key ? <CheckCircle2 size={16} /> : <ArrowUpRight size={15} />}</button>)}</div>
      <div className="sliders-heading"><h3>Fine-tune the shock{modified && <small className="modified"> · modified</small>}</h3><button onClick={() => { setShock({ ...base.shock }); setUseTheme(true); }}><RefreshCw size={13} /> Reset</button></div>
      <div className="sliders">{(Object.keys(RANGES) as Factor[]).map(k => <div className="slider-row" key={k}>
        <div className="slider-label"><span>{LABEL[k]}</span><strong>{fmtShock(k, shock[k])}</strong></div>
        <input type="range" min={RANGES[k][0]} max={RANGES[k][1]} step={RANGES[k][2]} value={shock[k]} onChange={e => setShock(s => ({ ...s, [k]: Number(e.target.value) }))} aria-label={LABEL[k]} />
      </div>)}</div>
      {Object.keys(base.themeShocks).length > 0 && <label className="theme-toggle"><input type="checkbox" checked={useTheme} onChange={e => setUseTheme(e.target.checked)} /> Include theme shock: {Object.entries(base.themeShocks).map(([t, v]) => `${THEMES[t]?.label} ${pct(v, 0)}`).join(', ')} <small>(extra hit to linked holdings, applied through fund look-through)</small></label>}
      <div className="small-caveat"><CircleHelp size={14} /> Each position moves by Σ(sensitivity × shock) plus any theme shock, floored at −95%. Sensitivities are hand-set model parameters, not estimates from market data.</div>
    </section>
    <aside className="scenario-results">
      <section className="panel impact-panel">
        <span className="kicker">MODELED PORTFOLIO IMPACT</span>
        <div className={`impact-number ${r.pct >= 0 ? 'positive' : 'negative'}`}>{pct(r.pct)}</div>
        <div className="impact-currency">{r.dollars != null ? <>{usd(r.dollars)} <span>on {usd(p.value!)}</span></> : <span>Add the portfolio size to see dollar impact</span>}</div>
        {p.drawdownLimit != null && <div className={`limit-line ${breach ? 'breach' : 'ok'}`}>{breach ? `Breaches your ${p.drawdownLimit}% loss limit` : `Within your ${p.drawdownLimit}% loss limit`}</div>}
        <div className="impact-divider" />
        <h3>Contribution by driver</h3>
        {r.contributions.filter(c => Math.abs(c.value) >= 0.05).map(c => <div className="contribution-row" key={c.key}><span>{c.label}</span><strong className={c.value < 0 ? 'negative' : 'positive'}>{pct(c.value)}</strong></div>)}
        <button className="scenario-ask" onClick={() => onAsk(`Investigate the ${modified ? 'modified ' : ''}${base.name} scenario and which positions drive it`)}><Sparkles size={15} /> Ask Atlas to investigate <ArrowRight size={15} /></button>
      </section>
      <section className="panel holdings-impact">
        <span className="kicker">MODELED POSITION IMPACTS</span>
        {r.holdings.slice(0, 14).map(h => <div className="holding-impact" key={h.ticker}><strong>{h.ticker}</strong><div className="impact-track"><span style={{ width: `${(Math.abs(h.impact) / maxAbs) * 100}%`, background: h.impact < 0 ? '#ef8f9d' : '#66d9bc' }} /></div><span className={h.impact < 0 ? 'negative' : 'positive'}>{pct(h.impact)}</span></div>)}
        {r.holdings.length > 14 && <small className="muted">+{r.holdings.length - 14} more positions</small>}
      </section>
    </aside>
  </div>;
}
