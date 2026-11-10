'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import type { Portfolio, TraceStep } from '../../lib/types';
import type { Analysis } from '../../lib/agent';
import type { AnswerPayload, InvestigationPayload } from '../../lib/protocol';
import { BasisBadge, SourcePill, TraceList, f1, usd } from './ui';

export type Turn = {
  id: string;
  user: string;
  steps: TraceStep[];
  answer?: AnswerPayload;
  investigation?: InvestigationPayload;
  question?: { text: string; options: string[] };
  notices: string[];
  pending: boolean;
  error?: string;
};

export function Investigator({ p, a, thread, onAsk, busy, suggestions }: { p: Portfolio; a: Analysis; thread: Turn[]; onAsk: (q: string) => void; busy: boolean; suggestions: string[] }) {
  const [q, setQ] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [thread]);
  const send = (text = q) => { if (text.trim() && !busy) { onAsk(text.trim()); setQ(''); } };
  return <div className="investigate-layout">
    <section className="panel investigator-panel">
      <div className="investigator-head"><div className="agent-avatar"><Sparkles size={20} /></div><div><h2>Atlas Investigator</h2><p>Ask a question or tell Atlas something new. It decides which analyses to run.</p></div><span className="investigator-state"><span /> {busy ? 'Investigating' : 'Ready'}</span></div>
      <div className="conversation">
        {thread.map(t => <div className="conversation-turn" key={t.id}>
          <div className="user-msg"><span>YOU</span><p>{t.user}</p></div>
          <div className="agent-msg">
            <div className="result-header"><span className="agent-avatar small"><Sparkles size={15} /></span><div><strong>Atlas</strong><small>{t.answer?.by === 'ai' || t.investigation?.narrativeBy === 'ai' ? 'AI reasoning · deterministic calculations' : 'Deterministic planner · deterministic calculations'}</small></div>{!t.pending && !t.error && <span className="done-tag"><Check size={12} /> {t.investigation ? 'Portfolio re-analyzed' : 'Analysis complete'}</span>}</div>
            {t.steps.length > 0 && <details className="steps-box" open={t.pending}><summary>Investigation trace · {t.steps.filter(s => s.status === 'done').length} steps</summary><TraceList steps={t.steps} live={t.pending} /></details>}
            {t.pending && <div className="working"><span className="loader" /><div><strong>Atlas is investigating…</strong><small>Choosing tools and running calculations</small></div></div>}
            {t.question && <div className="clarify"><Sparkles size={15} /><div><p>{t.question.text}</p><div className="clarify-options">{t.question.options.map(o => <button key={o} onClick={() => send(o)}>{o}</button>)}</div></div></div>}
            {t.investigation && <InvestigationSummary inv={t.investigation} onAsk={send} />}
            {t.answer && <>
              <p className="result-lead">{t.answer.lead}</p>
              {t.answer.findings.length > 0 && <><div className="findings-header">KEY FINDINGS <span>{t.answer.findings.length}</span></div>{t.answer.findings.map((f, j) => <div className="finding" key={j}><div className="finding-index">{String(j + 1).padStart(2, '0')}</div><p>{f}</p></div>)}</>}
              <div className="followups"><span>GO DEEPER</span>{t.answer.followups.map(f => <button onClick={() => send(f)} key={f} disabled={busy}>{f} <ArrowUpRight size={13} /></button>)}</div>
            </>}
            {t.notices.map(n => <div key={n} className="result-foot"><ShieldCheck size={13} />{n}</div>)}
            {t.error && <div className="error-text">{t.error}</div>}
          </div>
        </div>)}
        <div ref={end} />
      </div>
      <form className="investigate-compose" onSubmit={e => { e.preventDefault(); send(); }}>
        <div className="compose-box"><Sparkles size={18} /><input id="atlas-question" placeholder="Ask a question, or add information (e.g. “my AUM is $1.2B”, “add 10% TLT”)…" value={q} onChange={e => setQ(e.target.value)} maxLength={1200} aria-label="Message Atlas" /><button aria-label="Send" disabled={busy || !q.trim()}><ArrowRight size={17} /></button></div>
        <div className="compose-footer"><span><ShieldCheck size={13} /> Numbers come only from Atlas’s calculation tools</span><span>New information re-runs the full investigation</span></div>
      </form>
    </section>
    <aside className="investigate-right">
      <div className="panel side-panel">
        <div className="run-side-head"><span className="kicker">RESEARCH CONTEXT</span><SourcePill p={p} /></div>
        <h3>{p.name}</h3><p>{p.description}</p>
        <div className="context-row"><span>Positions</span><strong>{a.conc.count}</strong></div>
        <div className="context-row"><span>Size</span><strong>{p.value != null ? usd(p.value) : 'Unknown'}</strong></div>
        <div className="context-row"><span>Modeled volatility</span><strong>{f1(a.risk.vol)}%</strong></div>
        <div className="context-row"><span>Top risk contributor</span><strong>{a.risk.contributions[0]?.ticker} · {f1(a.risk.contributions[0]?.riskShare ?? 0)}%</strong></div>
        <div className="context-row"><span>Loss limit</span><strong>{p.drawdownLimit != null ? `${p.drawdownLimit}%` : 'Not set'}</strong></div>
      </div>
      <div className="panel side-panel suggestion-panel"><span className="kicker">WORTH INVESTIGATING</span>{suggestions.map(s => <button key={s} onClick={() => send(s)} disabled={busy}>{s}<ArrowUpRight size={14} /></button>)}</div>
    </aside>
  </div>;
}

function InvestigationSummary({ inv, onAsk }: { inv: InvestigationPayload; onAsk: (q: string) => void }) {
  const head = inv.findings.find(f => f.id === inv.headlineId) ?? inv.findings[0];
  return <div className="inv-summary">
    {inv.delta.length > 0 && <div className="delta compact"><span className="kicker"><RefreshCw size={11} /> WHAT CHANGED</span><div className="delta-grid">{inv.delta.map(d => <div key={d.label} className="delta-row"><span>{d.label}</span><s>{d.before}</s><ArrowRight size={12} /><strong>{d.after}</strong></div>)}</div></div>}
    {head && <div className="inv-head"><BasisBadge basis={head.basis} /><h3>{head.title}</h3><p>{head.detail}</p></div>}
    <p className="result-lead">{inv.narrative}</p>
    <div className="followups"><span>GO DEEPER</span>{inv.findings.slice(0, 3).map(f => <button key={f.id} onClick={() => onAsk(f.followup)}>{f.followup} <ArrowUpRight size={13} /></button>)}</div>
  </div>;
}
