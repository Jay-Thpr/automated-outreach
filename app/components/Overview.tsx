'use client';
import { useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, ChevronDown, GitBranch, KeyRound, Layers3, Lock, Sparkles, Target, TrendingDown } from 'lucide-react';
import type { Finding, Portfolio, SpecUpdate, TraceStep, Unlock } from '../../lib/types';
import type { Analysis } from '../../lib/agent';
import type { InvestigationPayload } from '../../lib/protocol';
import { emptyUpdate, describeUpdate } from '../../lib/parse';
import { ARCHETYPES } from '../../lib/universe';
import { BasisBadge, Donut, Kpi, RiskWeightChart, SourcePill, TraceList, f1, pct, usd } from './ui';
import { parseAum } from './Onboarding';

const KIND_ICON: Record<Finding['kind'], typeof Target> = { concentration: Layers3, risk: Target, factor: GitBranch, overlap: Layers3, theme: GitBranch, stress: TrendingDown, hedge: AlertTriangle, whatif: Activity, drawdown: AlertTriangle, data: KeyRound };

export function Overview({ p, a, inv, trace, onUnlock, onEditHoldings, onAsk, busy }: {
  p: Portfolio;
  a: Analysis;
  inv: InvestigationPayload | null;
  trace: TraceStep[];
  onUnlock: (u: SpecUpdate, label: string) => void;
  onEditHoldings: () => void;
  onAsk: (q: string) => void;
  busy: boolean;
}) {
  const [showTrace, setShowTrace] = useState(false);
  const headline = inv?.findings.find(f => f.id === inv.headlineId) ?? inv?.findings[0] ?? null;
  const rest = inv?.findings.filter(f => f !== headline) ?? [];
  const worst = a.scenarios[0];
  const domFactor = a.risk.factorShares.slice().sort((x, y) => y.share - x.share)[0];
  return <>
    {inv && headline && <section className="briefing">
      <div className="briefing-top">
        <span className="kicker"><Sparkles size={12} /> ATLAS BRIEFING</span>
        <div className="briefing-tags"><BasisBadge basis={headline.basis} />{inv.narrativeBy === 'ai' && <span className="quiet-pill">AI narrative · verified against computed figures</span>}</div>
      </div>
      <h2 className="briefing-headline">{headline.title}</h2>
      <p className="briefing-detail">{headline.detail}</p>
      <p className="briefing-narrative">{inv.narrative}</p>
      {inv.delta.length > 0 && <div className="delta">
        <span className="kicker">WHAT CHANGED WITH YOUR NEW INFORMATION</span>
        <div className="delta-grid">{inv.delta.map(d => <div key={d.label} className="delta-row"><span>{d.label}</span><s>{d.before}</s><ArrowRight size={12} /><strong>{d.after}</strong></div>)}</div>
      </div>}
      <div className="briefing-actions">
        <button className="primary-btn" onClick={() => onAsk(headline.followup)}>{headline.followup} <ArrowRight size={15} /></button>
        <button className="secondary-btn" onClick={() => setShowTrace(s => !s)}>How I investigated ({trace.filter(t => t.status === 'done').length} steps) <ChevronDown size={14} style={{ transform: showTrace ? 'rotate(180deg)' : undefined }} /></button>
      </div>
      {showTrace && <div className="briefing-trace"><TraceList steps={trace} /></div>}
      {p.assumptions.length > 0 && <div className="assumptions">
        <span className="kicker">ASSUMPTIONS I MADE</span>
        {p.assumptions.map(x => <div key={x.id} className={`assumption sev-${x.severity}`}><AlertTriangle size={13} /><span>{x.text}</span></div>)}
      </div>}
    </section>}

    {inv && inv.unlocks.length > 0 && <section className="unlocks">
      <div className="insights-title-row"><div><span className="kicker">SHARPEN THE ANALYSIS</span><h2>What would change my conclusions</h2></div></div>
      <div className="unlock-grid">{inv.unlocks.map(u => <UnlockCard key={u.id} u={u} p={p} onApply={onUnlock} onEditHoldings={onEditHoldings} busy={busy} />)}</div>
    </section>}

    <div className="kpi-grid">
      <Kpi label="Modeled volatility" value={`${f1(a.risk.vol)}%`} detail={`1-in-20 annual loss ≈ ${f1(a.tail)}% (modeled)`} icon={<Activity size={17} />} />
      <Kpi label="Top risk contributor" value={a.risk.contributions[0]?.ticker ?? '—'} detail={a.risk.contributions[0] ? `${f1(a.risk.contributions[0].riskShare)}% of risk on ${f1(a.risk.contributions[0].weight)}% of capital` : ''} icon={<Target size={17} />} tone="purple" />
      <Kpi label="Effective bets" value={f1(a.risk.effectiveBets)} detail={`From ${a.conc.count} positions · ${f1(domFactor.share)}% ${domFactor.label.split(' ')[0].toLowerCase()} factor`} icon={<Layers3 size={17} />} />
      <Kpi label="Worst modeled scenario" value={pct(worst.result.pct)} detail={worst.result.dollars != null ? `${worst.name} · ${usd(worst.result.dollars)}` : worst.name} icon={<TrendingDown size={17} />} tone="red" />
    </div>

    <div className="primary-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="kicker">WEIGHT IS NOT RISK</span><h2>Capital vs. modeled risk contribution</h2></div><SourcePill p={p} /></div>
        <p className="panel-intro">Each position's share of portfolio volatility from the factor model, next to its capital weight. Ratios above 1× mean a position drives more risk than its size suggests.</p>
        <RiskWeightChart rows={a.risk.contributions} />
      </section>
      <section className="panel allocations">
        <div className="panel-heading"><div><span className="kicker">PORTFOLIO COMPOSITION</span><h2>Where capital sits</h2></div></div>
        <Donut segments={a.sectors.slice(0, 7).concat(a.sectors.length > 7 ? [{ name: 'Other', value: a.sectors.slice(7).reduce((s, x) => s + x.value, 0) }] : []).map(s => ({ label: s.name, value: s.value }))} center={String(a.conc.count)} sub={a.conc.count === 1 ? 'position' : 'positions'} />
        <div className="sector-list">{a.sectors.slice(0, 6).map((s, i) => <div key={s.name} className="sector-row"><span className="sector-name"><i style={{ background: ['#b9a4ff', '#55d6c2', '#83a9ff', '#e5a4a4', '#e7c78c', '#8f96a5'][i] }} />{s.name}</span><strong>{f1(s.value)}%</strong></div>)}</div>
      </section>
    </div>

    {rest.length > 0 && <>
      <div className="insights-title-row"><div><span className="kicker">EVERYTHING ATLAS FOUND</span><h2>Ranked by how non-obvious they are</h2></div><button className="text-link" onClick={() => onAsk('What am I missing in this portfolio?')}>Ask Atlas to dig further <ArrowRight size={15} /></button></div>
      <div className="insight-grid">{rest.map(f => {
        const Icon = KIND_ICON[f.kind] ?? Target;
        return <button key={f.id} className="insight-card" onClick={() => onAsk(f.followup)}>
          <div className="insight-card-head"><span className="signal-type"><Icon size={14} /> {f.kind.toUpperCase()}</span><BasisBadge basis={f.basis} /></div>
          <h3>{f.title}</h3><p>{f.detail}</p>
          <span className="insight-cta">{f.followup} <ArrowUpRight size={14} /></span>
        </button>;
      })}</div>
    </>}
  </>;
}

function UnlockCard({ u, p, onApply, onEditHoldings, busy }: { u: Unlock; p: Portfolio; onApply: (u: SpecUpdate, label: string) => void; onEditHoldings: () => void; busy: boolean }) {
  const [val, setVal] = useState('');
  const unclassified = p.holdings.filter(h => h.classification === 'unclassified');
  const [sectors, setSectors] = useState<Record<string, string>>({});
  const apply = (fn: (x: SpecUpdate) => void, label: string) => { const x = emptyUpdate(); fn(x); x.understood = describeUpdate(x); onApply(x, label); setVal(''); };
  return <div className="unlock-card">
    <div className="unlock-head"><Lock size={14} /><h3>{u.title}</h3></div>
    <p className="unlock-why">{u.why}</p>
    <p className="unlock-gain"><Sparkles size={12} /> Unlocks: {u.unlocks}</p>
    {u.input === 'aum' && <div className="unlock-input"><input value={val} onChange={e => setVal(e.target.value)} placeholder="e.g. $250M" aria-label="Portfolio size" onKeyDown={e => { if (e.key === 'Enter' && parseAum(val)) apply(x => (x.aum = parseAum(val)), `Portfolio size ${usd(parseAum(val)!)}`); }} /><button className="primary-btn" disabled={busy || !parseAum(val)} onClick={() => apply(x => (x.aum = parseAum(val)), `Portfolio size ${usd(parseAum(val)!)}`)}>Apply</button></div>}
    {u.input === 'drawdown' && <div className="unlock-input"><input value={val} onChange={e => setVal(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Max loss, e.g. 20" inputMode="decimal" aria-label="Maximum tolerable loss in percent" /><span className="unlock-suffix">%</span><button className="primary-btn" disabled={busy || !(parseFloat(val) > 0 && parseFloat(val) < 100)} onClick={() => apply(x => (x.drawdownLimit = parseFloat(val)), `Loss limit ${val}%`)}>Check</button></div>}
    {(u.input === 'holdings' || u.input === 'weights') && <button className="primary-btn unlock-btn" disabled={busy} onClick={onEditHoldings}>{u.input === 'weights' ? 'Add weights' : 'Enter or upload holdings'} <ArrowRight size={14} /></button>}
    {u.input === 'sectors' && <div className="unlock-sectors">
      {unclassified.map(h => <label key={h.ticker}><strong>{h.ticker}</strong><select value={sectors[h.ticker] ?? ''} onChange={e => setSectors(s => ({ ...s, [h.ticker]: e.target.value }))}><option value="">Choose sector…</option>{Object.values(ARCHETYPES).filter(x => x.key !== 'cash').map(x => <option key={x.key} value={x.key}>{x.sector}</option>)}</select></label>)}
      <button className="primary-btn" disabled={busy || !Object.values(sectors).some(Boolean)} onClick={() => apply(x => { x.holdingsMode = 'merge'; x.holdings = Object.entries(sectors).filter(([, v]) => v).map(([ticker, sectorHint]) => ({ ticker, sectorHint })); }, 'Classified unknown holdings')}>Apply</button>
    </div>}
  </div>;
}
