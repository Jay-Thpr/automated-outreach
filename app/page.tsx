'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Compass, Download, FileText, FlaskConical, GitBranch, Layers3, Menu, Pencil, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { PortfolioSpec, SpecUpdate, TraceStep } from '../lib/types';
import type { AgentEvent, AgentRequest, InvestigationPayload } from '../lib/protocol';
import { readAgentStream } from '../lib/protocol';
import { buildPortfolio, EXAMPLES } from '../lib/portfolio';
import { analyze } from '../lib/agent';
import { Onboarding, HoldingsForm, CsvUpload } from './components/Onboarding';
import { RunView } from './components/RunView';
import { Overview } from './components/Overview';
import { ScenarioLab } from './components/ScenarioLab';
import { RiskExplorer } from './components/RiskExplorer';
import { Investigator, type Turn } from './components/Investigator';
import { ModeBadge, SourcePill, usd } from './components/ui';

type Stage = 'onboard' | 'running' | 'workspace';
type View = 'overview' | 'investigate' | 'scenarios' | 'exposures';
type Saved = { v: 2; spec: PortfolioSpec; inv: InvestigationPayload | null; trace: TraceStep[]; thread: Turn[]; input: string };

const STORE = 'atlas.session.v2';
const TITLES: Record<View, [string, string]> = {
  overview: ['Briefing', 'What Atlas found, how it found it, and what would sharpen it.'],
  investigate: ['AI Investigator', 'Ask a question or add information. Atlas decides which analyses to run.'],
  scenarios: ['Scenario Lab', 'Reprice every position under a market shock, then adjust it yourself.'],
  exposures: ['Risk Explorer', 'Factors, shared themes, fund look-through and modeled correlations.'],
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<Stage>('onboard');
  const [view, setView] = useState<View>('overview');
  const [mobile, setMobile] = useState(false);
  const [mode, setMode] = useState<'ai' | 'demo' | null>(null);
  const [spec, setSpec] = useState<PortfolioSpec | null>(null);
  const [inv, setInv] = useState<InvestigationPayload | null>(null);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [thread, setThread] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [understood, setUnderstood] = useState<{ label: string; value: string }[]>([]);
  const [runSteps, setRunSteps] = useState<TraceStep[]>([]);
  const [runDone, setRunDone] = useState(false);
  const [runError, setRunError] = useState('');
  const [clarify, setClarify] = useState<{ text: string; options: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [scenarioFocus, setScenarioFocus] = useState<string | undefined>();
  const [toast, setToast] = useState<{ steps: TraceStep[]; label: string } | null>(null);
  const specRef = useRef<PortfolioSpec | null>(null);
  specRef.current = spec;

  // ---------- persistence ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const s: Saved = JSON.parse(raw);
        if (s.v === 2 && s.spec && buildPortfolio(s.spec)) {
          setSpec(s.spec); setInv(s.inv); setTrace(s.trace || []); setThread((s.thread || []).filter(t => !t.pending)); setInput(s.input || ''); setStage('workspace');
        }
      }
    } catch { /* storage unavailable */ }
    setHydrated(true);
    fetch('/api/agent').then(r => r.json()).then(j => setMode(j.ai ? 'ai' : 'demo')).catch(() => setMode('demo'));
  }, []);
  useEffect(() => {
    if (!hydrated || stage !== 'workspace' || !spec) return;
    try { localStorage.setItem(STORE, JSON.stringify({ v: 2, spec, inv, trace, thread: thread.filter(t => !t.pending), input } satisfies Saved)); } catch { /* ignore */ }
  }, [hydrated, stage, spec, inv, trace, thread, input]);

  const portfolio = useMemo(() => (spec ? buildPortfolio(spec) : null), [spec]);
  const analysis = useMemo(() => (portfolio ? analyze(portfolio) : null), [portfolio]);

  // ---------- agent calls ----------
  const call = useCallback(async (req: AgentRequest, on: (e: AgentEvent) => void | Promise<void>) => {
    const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    if (!res.ok) throw new Error('The investigation service returned an error.');
    await readAgentStream(res, on);
  }, []);

  const startOnboarding = async (req: AgentRequest, label: string) => {
    setInput(label); setUnderstood([]); setRunSteps([]); setRunDone(false); setRunError(''); setClarify(null); setBusy(true);
    let gotInvestigation = false;
    let newSpec: PortfolioSpec | null = null;
    let payload: InvestigationPayload | null = null;
    const steps: TraceStep[] = [];
    let switched = false;
    try {
      await call(req, async e => {
        if (e.t === 'mode') setMode(e.mode);
        else if (e.t === 'understood') { setUnderstood(e.items); }
        else if (e.t === 'question') { setClarify({ text: e.text, options: e.options }); }
        else if (e.t === 'spec') { newSpec = e.spec; if (!switched) { setStage('running'); switched = true; } setSpec(e.spec); }
        else if (e.t === 'step') {
          if (!switched) { setStage('running'); switched = true; }
          steps.push(e.step); setRunSteps([...steps]);
          await sleep(e.step.status === 'skipped' ? 160 : 380);
        }
        else if (e.t === 'investigation') { payload = e.payload; gotInvestigation = true; }
        else if (e.t === 'error') throw new Error(e.message);
      });
      if (gotInvestigation && newSpec && payload) {
        const pl = payload as InvestigationPayload;
        setInv(pl); setTrace(steps); setRunDone(true);
        setThread([{ id: uid(), user: label, steps, investigation: pl, notices: [], pending: false }]);
        setView('overview');
        if (pl.focusScenario) setScenarioFocus(pl.focusScenario);
      } else if (switched) {
        setStage('onboard');
      }
    } catch (err) {
      if (switched) setRunError(err instanceof Error ? err.message : 'Something went wrong.');
      else setClarify({ text: 'I couldn’t reach the analysis service. Please try again.', options: [] });
    } finally { setBusy(false); }
  };

  /** Workspace messages: questions, new information, and unlock submissions. */
  const send = async (req: AgentRequest, label: string, opts: { toView?: View; toast?: boolean } = {}) => {
    if (busy) return;
    const id = uid();
    setBusy(true);
    if (opts.toView) setView(opts.toView);
    setThread(t => [...t, { id, user: label, steps: [], notices: [], pending: true }]);
    const patch = (fn: (t: Turn) => Turn) => setThread(ts => ts.map(t => (t.id === id ? fn(t) : t)));
    if (opts.toast) setToast({ steps: [], label });
    const steps: TraceStep[] = [];
    try {
      await call({ ...req, spec: specRef.current ?? undefined, history: thread.slice(-4).flatMap(t => [{ role: 'user' as const, text: t.user }, { role: 'atlas' as const, text: t.answer?.lead ?? t.investigation?.narrative ?? '' }]) }, async e => {
        if (e.t === 'mode') setMode(e.mode);
        else if (e.t === 'step') { steps.push(e.step); patch(t => ({ ...t, steps: [...steps] })); if (opts.toast) setToast({ steps: [...steps], label }); await sleep(e.step.status === 'skipped' ? 100 : 220); }
        else if (e.t === 'spec') setSpec(e.spec);
        else if (e.t === 'investigation') { setInv(e.payload); setTrace([...steps]); patch(t => ({ ...t, investigation: e.payload })); if (e.payload.focusScenario) setScenarioFocus(e.payload.focusScenario); }
        else if (e.t === 'answer') { patch(t => ({ ...t, answer: e.payload })); if (e.payload.focus?.scenario) setScenarioFocus(e.payload.focus.scenario); }
        else if (e.t === 'question') patch(t => ({ ...t, question: { text: e.text, options: e.options } }));
        else if (e.t === 'notice') patch(t => ({ ...t, notices: [...t.notices, e.text] }));
        else if (e.t === 'error') throw new Error(e.message);
      });
      patch(t => ({ ...t, pending: false }));
    } catch (err) {
      patch(t => ({ ...t, pending: false, error: err instanceof Error ? err.message : 'Something went wrong.' }));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 900);
    }
  };

  const ask = (q: string) => send({ kind: 'chat', text: q }, q, { toView: 'investigate' });
  const applyUpdate = (u: SpecUpdate, label: string) => { setEditing(false); send({ kind: 'apply', update: u }, label, { toast: view !== 'investigate' }); };

  const reset = () => {
    try { localStorage.removeItem(STORE); } catch { /* ignore */ }
    setSpec(null); setInv(null); setTrace([]); setThread([]); setInput(''); setUnderstood([]); setRunSteps([]); setRunDone(false); setClarify(null); setStage('onboard'); setView('overview'); setMobile(false);
  };

  const exportReport = () => {
    if (!portfolio || !analysis) return;
    const data = { generatedAt: new Date().toISOString(), disclaimer: 'Illustrative factor model with hand-set parameters; not market data; not investment advice.', basis: portfolio.source, portfolio, assumptions: portfolio.assumptions, metrics: { concentration: analysis.conc, risk: analysis.risk, exposures: analysis.exp }, themes: analysis.themes, lookThrough: analysis.lt.rows, scenarios: analysis.scenarios.map(s => ({ name: s.name, shock: s.shock, themeShocks: s.themeShocks, pct: s.result.pct, dollars: s.result.dollars })), briefing: inv, investigations: thread.map(t => ({ input: t.user, trace: t.steps, answer: t.answer, investigation: t.investigation })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const el = document.createElement('a'); el.href = url; el.download = 'atlas-investigation.json'; el.click(); URL.revokeObjectURL(url);
  };

  if (!hydrated) return <div className="boot"><Compass size={22} /></div>;

  if (stage === 'onboard') return <Onboarding mode={mode} pending={busy} clarify={clarify}
    onText={t => startOnboarding({ kind: 'onboard', text: t }, t)}
    onUpdate={(u, label) => startOnboarding({ kind: 'onboard', update: u }, label)}
    onExample={id => startOnboarding({ kind: 'onboard', exampleId: id }, `Explore the example portfolio: ${EXAMPLES.find(e => e.id === id)?.name}`)} />;

  if (stage === 'running') return <RunView input={input} understood={understood} steps={runSteps} portfolio={portfolio}
    headline={inv && runDone ? inv.findings.find(f => f.id === inv.headlineId) ?? inv.findings[0] ?? null : null}
    done={runDone} error={runError} onOpen={() => setStage('workspace')} onBack={reset} />;

  if (!portfolio || !analysis) return <div className="boot"><button className="primary-btn" onClick={reset}>Start a new analysis</button></div>;

  const suggestions = Array.from(new Set([...(inv?.findings.slice(0, 3).map(f => f.followup) ?? []), 'Compare against the S&P 500', 'How could I hedge my worst scenario?'])).slice(0, 5);
  const nav: [View, string, typeof Layers3][] = [['overview', 'Briefing', Layers3], ['investigate', 'AI Investigator', Sparkles], ['scenarios', 'Scenario Lab', FlaskConical], ['exposures', 'Risk Explorer', GitBranch]];

  return <div className="app-shell">
    <div className={`sidebar-cover ${mobile ? 'show' : ''}`} onClick={() => setMobile(false)} />
    <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
      <div className="brand"><div className="brand-logo"><Compass size={20} strokeWidth={2.2} /></div><div><div className="brand-title">atlas<span className="brand-dot">.</span></div><div className="brand-caption">PORTFOLIO INTELLIGENCE</div></div><button className="close-mobile" onClick={() => setMobile(false)} aria-label="Close menu"><X size={18} /></button></div>
      <button className="workspace-tag" onClick={() => { setEditing(true); setMobile(false); }}><span className="ws-icon">{portfolio.source === 'proxy' ? '~' : portfolio.source === 'example' ? 'E' : 'P'}</span><span><strong>{portfolio.name}</strong><small>{analysis.conc.count} positions{portfolio.value != null ? ` · ${usd(portfolio.value)}` : ''}</small></span><Pencil size={13} /></button>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav-list">{nav.map(([id, title, Icon]) => <button key={id} onClick={() => { setView(id); setMobile(false); }} className={`nav-item ${view === id ? 'active' : ''}`}><Icon size={17} /><span>{title}</span>{id === 'investigate' && <span className="ai-mini">{busy ? '…' : 'AI'}</span>}</button>)}</nav>
      <div className="nav-label lower">PORTFOLIO</div>
      <div className="nav-list">
        <button className="nav-item" onClick={() => { setEditing(true); setMobile(false); }}><Pencil size={17} /><span>Edit holdings</span></button>
        <button className="nav-item" onClick={reset}><RotateCcw size={17} /><span>New analysis</span></button>
        <button className="nav-item" onClick={() => document.getElementById('methodology')?.scrollIntoView({ behavior: 'smooth' })}><FileText size={17} /><span>Methodology</span></button>
      </div>
      <div className="sidebar-bottom">
        <div className="demo-notice"><span className="status-pulse" /><span>{mode === 'ai' ? 'AI-ENHANCED' : 'DEMO MODE'}</span></div>
        <p>{mode === 'ai' ? 'A language model chooses investigations and writes narratives. Every number comes from deterministic tools.' : 'Deterministic extraction, planning and analysis. Add an API key for AI-driven investigation.'}</p>
        <div className="side-footer"><ShieldCheck size={14} /> Modeled estimates, not market data</div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="crumbs"><button className="menu-button" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu size={20} /></button><span className="crumb-hide">Workspace</span><ChevronRight size={14} className="crumb-hide" /><strong>{TITLES[view][0]}</strong></div>
        <div className="top-actions"><ModeBadge mode={mode} /><button className="icon-button" title="Download investigation (JSON)" onClick={exportReport}><Download size={17} /></button></div>
      </header>
      <div className="content">
        <div className="portfolio-bar">
          <div className="portfolio-bar-left"><div className="portfolio-icon"><Layers3 size={19} /></div><div><span className="small-label">ANALYZING</span><strong className="portfolio-name">{portfolio.name}</strong></div></div>
          <div className="portfolio-bar-right">
            <SourcePill p={portfolio} />
            <div className="portfolio-aum"><small>{portfolio.valueSource === 'example' ? 'EXAMPLE AUM' : 'PORTFOLIO SIZE'}</small><strong>{portfolio.value != null ? usd(portfolio.value) : '—'}</strong></div>
            <button className="secondary-btn" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</button>
          </div>
        </div>
        {portfolio.source === 'proxy' && <div className="proxy-banner"><span><strong>You’re viewing an illustrative proxy.</strong> These holdings represent the portfolio you described; they aren’t yours. Share real holdings and every figure here recalculates for your portfolio.</span><button className="primary-btn" onClick={() => setEditing(true)}>Add holdings</button></div>}
        <div className="headline-row"><div><h1>{TITLES[view][0]}</h1><p className="page-subtitle">{TITLES[view][1]}</p></div></div>

        {view === 'overview' && <Overview p={portfolio} a={analysis} inv={inv} trace={trace} onUnlock={applyUpdate} onEditHoldings={() => setEditing(true)} onAsk={ask} busy={busy} />}
        {view === 'investigate' && <Investigator p={portfolio} a={analysis} thread={thread} onAsk={ask} busy={busy} suggestions={suggestions} />}
        {view === 'scenarios' && <ScenarioLab p={portfolio} initial={scenarioFocus} onAsk={ask} />}
        {view === 'exposures' && <RiskExplorer p={portfolio} a={analysis} onAsk={ask} onEdit={() => setEditing(true)} />}

        <footer id="methodology">
          <div><strong>ATLAS</strong><span>Independent concept demo. Not affiliated with any index or data provider. Risk figures come from a deterministic linear factor model (growth, rates, credit, oil) with hand-set, illustrative sensitivities, a factor covariance matrix, and theme-based co-movement. Fund look-through uses approximate static compositions. Nothing here is live market data or investment advice.</span></div>
          <span>Volatility = √(wᵀΣw) · Risk share = wᵢ(Σw)ᵢ / σ² · Scenario move = Σ sensitivity × shock (+ theme shock) · 1-in-20 loss = 1.645σ</span>
        </footer>
      </div>
    </main>

    {editing && <div className="modal-cover" onClick={() => setEditing(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Edit holdings">
        <div className="modal-head"><div><span className="kicker">YOUR HOLDINGS</span><h2>{portfolio.source === 'user' ? 'Edit positions' : 'Replace the proxy with your positions'}</h2></div><button className="icon-button" onClick={() => setEditing(false)} aria-label="Close"><X size={18} /></button></div>
        <p className="panel-intro">Atlas re-runs the full investigation and shows you what changed.</p>
        <EditTabs spec={spec!} busy={busy} onApply={applyUpdate} />
      </div>
    </div>}

    {toast && <div className="run-toast"><div className="run-toast-head"><span className="loader small" /><strong>Re-investigating</strong><small>{toast.label}</small></div>{toast.steps.slice(-3).map(s => <div key={s.id} className="run-toast-step">✓ {s.title}</div>)}</div>}
  </div>;
}

function EditTabs({ spec, busy, onApply }: { spec: PortfolioSpec; busy: boolean; onApply: (u: SpecUpdate, label: string) => void }) {
  const [tab, setTab] = useState<'form' | 'csv'>('form');
  const initial = spec.exampleId || !spec.holdings.length ? (spec.exampleId ? spec.holdings : []) : spec.holdings;
  return <>
    <div className="composer-tabs inline"><button className={tab === 'form' ? 'active' : ''} onClick={() => setTab('form')}>Enter positions</button><button className={tab === 'csv' ? 'active' : ''} onClick={() => setTab('csv')}>Upload CSV</button></div>
    {tab === 'form' ? <HoldingsForm compact pending={busy} initial={initial} initialAum={spec.aum} submitLabel="Re-investigate" onSubmit={onApply} /> : <CsvUpload pending={busy} onSubmit={onApply} />}
  </>;
}
