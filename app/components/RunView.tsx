'use client';
import { ArrowRight, Compass, Sparkles } from 'lucide-react';
import type { Finding, Portfolio, TraceStep } from '../../lib/types';
import { BasisBadge, SourcePill, TraceList, f1, usd } from './ui';

export function RunView({ input, understood, steps, portfolio, headline, done, onOpen, error, onBack }: {
  input: string;
  understood: { label: string; value: string }[];
  steps: TraceStep[];
  portfolio: Portfolio | null;
  headline: Finding | null;
  done: boolean;
  onOpen: () => void;
  error: string;
  onBack: () => void;
}) {
  return <div className="run">
    <header className="onboard-top"><div className="brand"><div className="brand-logo"><Compass size={20} strokeWidth={2.2} /></div><div><div className="brand-title">atlas<span className="brand-dot">.</span></div><div className="brand-caption">PORTFOLIO INTELLIGENCE</div></div></div></header>
    <div className="run-grid">
      <section className="run-main">
        <div className="run-input"><span>YOU</span><p>{input}</p></div>
        <div className="run-agent">
          <div className="run-agent-head"><span className={`agent-avatar ${done ? '' : 'pulsing'}`}><Sparkles size={18} /></span><div><strong>{done ? 'Investigation complete' : 'Atlas is investigating'}</strong><small>{done ? `${steps.filter(s => s.status === 'done').length} analyses run · ${steps.filter(s => s.status === 'skipped').length} skipped by choice` : 'Deciding what to analyze, and why'}</small></div></div>
          <TraceList steps={steps} live />
          {!done && !error && <div className="working"><span className="loader" /><div><strong>Working…</strong><small>Each step runs a real calculation</small></div></div>}
          {error && <div className="error-text">{error} <button className="text-link" onClick={onBack}>Go back</button></div>}
          {done && headline && <div className="run-headline">
            <div className="run-headline-top"><span className="kicker">WHAT I FOUND</span><BasisBadge basis={headline.basis} /></div>
            <h2>{headline.title}</h2>
            <p>{headline.detail}</p>
            <button className="primary-btn" onClick={onOpen}>Open the full briefing <ArrowRight size={16} /></button>
          </div>}
        </div>
      </section>
      <aside className="run-side">
        <div className="panel side-panel">
          <span className="kicker">WHAT I UNDERSTOOD</span>
          {understood.length ? understood.map(u => <div className="context-row" key={u.label}><span>{u.label}</span><strong>{u.value}</strong></div>) : <p>Reading your input…</p>}
        </div>
        {portfolio && <div className="panel side-panel">
          <div className="run-side-head"><span className="kicker">PORTFOLIO UNDER ANALYSIS</span><SourcePill p={portfolio} /></div>
          {portfolio.value != null && <div className="context-row"><span>Size</span><strong>{usd(portfolio.value)}</strong></div>}
          <div className="run-holdings">{portfolio.holdings.slice().sort((a, b) => b.weight - a.weight).slice(0, 10).map(h => <div key={h.ticker} className="run-holding"><strong>{h.ticker}</strong><span className="run-hbar"><i style={{ width: `${Math.min(100, h.weight * 2.5)}%` }} /></span><small>{f1(h.weight)}%</small></div>)}{portfolio.holdings.length > 10 && <small className="muted">+{portfolio.holdings.length - 10} more</small>}</div>
          {portfolio.source === 'proxy' && <p className="proxy-note">These are representative positions for the portfolio you described, not your holdings. Results based on them are marked <em>Illustrative</em>.</p>}
        </div>}
      </aside>
    </div>
  </div>;
}
