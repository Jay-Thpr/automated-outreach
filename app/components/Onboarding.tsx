'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Compass, FileSpreadsheet, FlaskConical, ListPlus, MessageSquareText, Plus, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import type { HoldingInput, SpecUpdate } from '../../lib/types';
import { describeUpdate, emptyUpdate, parseCSV, parseMoney, parseText } from '../../lib/parse';
import { ALL_TICKERS, isKnownTicker } from '../../lib/universe';
import { EXAMPLES } from '../../lib/portfolio';
import { usd } from './ui';

type Tab = 'describe' | 'holdings' | 'upload';

const STARTERS = [
  'I manage a $500M tech-heavy equity portfolio',
  '40% QQQ, 25% NVDA, 15% SMH, 20% TLT',
  '$2B balanced fund, 60/40, max drawdown 15%',
  'Mostly dividend stocks: JNJ, PG, KO, XOM, VZ',
];

const PLACEHOLDERS = [
  'e.g. “I manage a $500M tech-heavy equity portfolio”',
  'e.g. “30% Nvidia, 20% Tesla, rest in index funds”',
  'e.g. “$40M family portfolio, 70% stocks / 30% bonds, can’t lose more than 20%”',
  'e.g. “AAPL 12%, MSFT 10%, JPM 8%, XOM 6%, …”',
];

export function Onboarding({ onText, onUpdate, onExample, pending, clarify, mode }: {
  onText: (text: string) => void;
  onUpdate: (u: SpecUpdate, label: string) => void;
  onExample: (id: string) => void;
  pending: boolean;
  clarify: { text: string; options: string[] } | null;
  mode: 'ai' | 'demo' | null;
}) {
  const [tab, setTab] = useState<Tab>('describe');
  const [text, setText] = useState('');
  const [ph, setPh] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = setInterval(() => setPh(p => (p + 1) % PLACEHOLDERS.length), 3800); return () => clearInterval(t); }, []);
  useEffect(() => { if (clarify) ta.current?.focus(); }, [clarify]);
  const live = useMemo(() => (text.trim().length > 2 ? parseText(text) : null), [text]);

  const submit = (t = text) => { if (t.trim() && !pending) onText(t.trim()); };

  return <div className="onboard">
    <header className="onboard-top">
      <div className="brand"><div className="brand-logo"><Compass size={20} strokeWidth={2.2} /></div><div><div className="brand-title">atlas<span className="brand-dot">.</span></div><div className="brand-caption">PORTFOLIO INTELLIGENCE</div></div></div>
      <span className="onboard-mode">{mode === 'ai' ? <><Sparkles size={13} /> AI-enhanced analysis</> : mode === 'demo' ? <><span className="status-pulse" /> Demo mode · deterministic analysis</> : null}</span>
    </header>

    <main className="onboard-main">
      <div className="eyebrow"><span className="eyebrow-dot" /> AN AUTONOMOUS PORTFOLIO ANALYST</div>
      <h1 className="onboard-title">What does your portfolio look like?</h1>
      <p className="onboard-sub">Describe it in a sentence, list a few positions, or drop in a file. Atlas runs the analysis itself and reports what it finds, starting with whatever you give it.</p>

      <div className="composer">
        <div className="composer-tabs" role="tablist">
          {([['describe', 'Describe it', MessageSquareText], ['holdings', 'Enter holdings', ListPlus], ['upload', 'Upload CSV', UploadCloud]] as const).map(([id, label, Icon]) =>
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={15} /> {label}</button>)}
        </div>

        {tab === 'describe' && <div className="composer-body">
          {clarify && <div className="clarify"><Sparkles size={15} /><div><p>{clarify.text}</p><div className="clarify-options">{clarify.options.map(o => <button key={o} onClick={() => { if (/paste|holdings/i.test(o)) setTab('holdings'); else { setText(o); submit(o); } }}>{o}</button>)}</div></div></div>}
          <textarea ref={ta} autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={PLACEHOLDERS[ph]} rows={3} maxLength={4000} aria-label="Describe your portfolio"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <div className="understood-row" aria-live="polite">
            {live && live.understood.length > 0
              ? <><span className="understood-label">Atlas understood</span>{live.understood.map(u => <span key={u.label} className="chip"><small>{u.label}</small>{u.value}</span>)}</>
              : <span className="understood-hint">Mention a size, a style, tickers or weights. Anything helps.</span>}
          </div>
          <div className="composer-foot">
            <div className="starters">{STARTERS.map(s => <button key={s} onClick={() => setText(s)}>{s}</button>)}</div>
            <button className="primary-btn investigate-btn" disabled={!text.trim() || pending} onClick={() => submit()}>{pending ? 'Investigating…' : <>Investigate <ArrowRight size={16} /></>}</button>
          </div>
        </div>}

        {tab === 'holdings' && <HoldingsForm pending={pending} onSubmit={(u, label) => onUpdate(u, label)} />}
        {tab === 'upload' && <CsvUpload pending={pending} onSubmit={(u, label) => onUpdate(u, label)} />}
      </div>

      <div className="examples">
        <div className="examples-head"><FlaskConical size={14} /> <span>No data handy? Explore an example portfolio</span><small>Clearly labeled as an example throughout</small></div>
        <div className="example-grid">{EXAMPLES.map(e => <button key={e.id} className="example-card" disabled={pending} onClick={() => onExample(e.id)}>
          <strong>{e.name}</strong><span>{e.short}</span>
          <small>{e.holdings.slice(0, 4).map(h => h[0]).join(' · ')}{e.holdings.length > 4 ? ' …' : ''} · {usd(e.aum)}</small>
        </button>)}</div>
      </div>

      <div className="promises">
        <div><strong>Real calculations</strong><span>Every number comes from a deterministic risk model, not generated text.</span></div>
        <div><strong>Shows its assumptions</strong><span>Results built on a proxy or an assumption are labeled as such.</span></div>
        <div><strong>Gets sharper as you share</strong><span>Each follow-up request says exactly which conclusion it would change.</span></div>
      </div>
    </main>

    <footer className="onboard-foot"><ShieldCheck size={13} /> Independent concept demo. Model parameters are illustrative, not market data; not investment advice. {mode === 'ai' ? 'With AI enabled, what you type is sent to the configured model provider.' : 'Your inputs are analyzed on this app’s server and not stored.'}</footer>
  </div>;
}

type Row = { ticker: string; weight: string };

export function HoldingsForm({ pending, onSubmit, initial, initialAum, submitLabel = 'Investigate', compact }: { pending: boolean; onSubmit: (u: SpecUpdate, label: string) => void; initial?: HoldingInput[]; initialAum?: number | null; submitLabel?: string; compact?: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => initial?.length ? initial.map(h => ({ ticker: h.ticker, weight: h.weight != null ? String(Math.round(h.weight * 100) / 100) : '' })) : [{ ticker: '', weight: '' }, { ticker: '', weight: '' }, { ticker: '', weight: '' }]);
  const [aum, setAum] = useState(initialAum ? String(initialAum) : '');
  const [paste, setPaste] = useState('');
  const valid = rows.filter(r => r.ticker.trim());
  const sum = valid.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);
  const update = (i: number, k: keyof Row, v: string) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: k === 'ticker' ? v.toUpperCase().replace(/[^A-Z.\-]/g, '') : v.replace(/[^\d.]/g, '') } : r)));
  const importPaste = () => {
    const u = parseText(paste);
    if (u.holdings.length) setRows(u.holdings.map(h => ({ ticker: h.ticker, weight: h.weight != null ? String(h.weight) : '' })));
    if (u.aum) setAum(String(u.aum));
    setPaste('');
  };
  const submit = () => {
    const u = emptyUpdate();
    u.holdings = valid.map(r => ({ ticker: r.ticker.trim(), weight: parseFloat(r.weight) > 0 ? parseFloat(r.weight) : null }));
    u.holdingsMode = 'replace';
    const a = aum.trim() ? parseAum(aum) : null;
    if (a) u.aum = a;
    u.understood = describeUpdate(u);
    onSubmit(u, `${u.holdings.length} holdings entered${a ? ` · ${usd(a)}` : ''}`);
  };
  return <div className={`composer-body holdings-form ${compact ? 'compact' : ''}`}>
    <datalist id="tickers">{ALL_TICKERS.map(t => <option key={t.ticker} value={t.ticker}>{t.name}</option>)}</datalist>
    <div className="hf-head"><span>TICKER</span><span>WEIGHT %</span><span /></div>
    <div className="hf-rows">{rows.map((r, i) => <div className="hf-row" key={i}>
      <div className="hf-ticker"><input list="tickers" value={r.ticker} placeholder="e.g. NVDA" onChange={e => update(i, 'ticker', e.target.value)} aria-label={`Ticker ${i + 1}`} />{r.ticker && !isKnownTicker(r.ticker) && r.ticker.length > 0 && <small title="Not in Atlas's reference set; it will be modeled with a proxy.">proxy</small>}</div>
      <input value={r.weight} placeholder="optional" inputMode="decimal" onChange={e => update(i, 'weight', e.target.value)} aria-label={`Weight ${i + 1}`} />
      <button className="icon-button" onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs)} aria-label="Remove row"><Trash2 size={14} /></button>
    </div>)}</div>
    <div className="hf-actions">
      <button className="text-link" onClick={() => setRows(rs => [...rs, { ticker: '', weight: '' }])}><Plus size={14} /> Add position</button>
      <span className={`hf-sum ${valid.length && sum > 0 && Math.abs(sum - 100) > 0.5 ? 'warn' : ''}`}>{sum > 0 ? `Weights total ${Math.round(sum * 10) / 10}%${Math.abs(sum - 100) > 0.5 ? ', will be scaled to 100%' : ''}` : 'No weights? Atlas will assume equal weights and say so.'}</span>
    </div>
    {!compact && <div className="hf-paste"><input value={paste} onChange={e => setPaste(e.target.value)} placeholder="Or paste a list: “NVDA 24%, MSFT 20%, …”" aria-label="Paste a holdings list" onKeyDown={e => { if (e.key === 'Enter') importPaste(); }} /><button className="secondary-btn" disabled={!paste.trim()} onClick={importPaste}>Fill rows</button></div>}
    <div className="composer-foot">
      <label className="hf-aum">Portfolio size <input value={aum} onChange={e => setAum(e.target.value)} placeholder="optional, e.g. $250M" aria-label="Portfolio size" /></label>
      <button className="primary-btn investigate-btn" disabled={!valid.length || pending} onClick={submit}>{pending ? 'Investigating…' : <>{submitLabel} <ArrowRight size={16} /></>}</button>
    </div>
  </div>;
}

export function parseAum(s: string): number | null {
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k|m|mm|b|bn|t|thousand|million|billion|trillion)?/i);
  if (!m) return null;
  const v = parseMoney(m[1], m[2]);
  return v > 0 ? v : null;
}

const TEMPLATE = 'ticker,weight\nNVDA,24\nMSFT,20\nAMZN,16\nGOOGL,15\nMETA,13\nAVGO,12\n';

export function CsvUpload({ pending, onSubmit }: { pending: boolean; onSubmit: (u: SpecUpdate, label: string) => void }) {
  const [parsed, setParsed] = useState<{ name: string; u: SpecUpdate } | null>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const read = (file: File) => {
    setErr('');
    if (file.size > 2_000_000) { setErr('That file is larger than 2MB.'); return; }
    const r = new FileReader();
    r.onload = () => {
      const u = parseCSV(String(r.result || ''));
      if (!u.holdings.length) setErr('I couldn’t find a ticker column in that file. A column named “ticker” or “symbol” plus “weight” or “market value” works best.');
      else setParsed({ name: file.name, u });
    };
    r.readAsText(file);
  };
  return <div className="composer-body">
    {!parsed ? <label className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) read(f); }}>
      <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={e => { const f = e.target.files?.[0]; if (f) read(f); }} />
      <FileSpreadsheet size={28} />
      <strong>Drop a CSV of holdings, or click to choose</strong>
      <span>Columns like ticker / symbol plus weight, market value, or shares and price. Broker exports usually work.</span>
      <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="atlas-holdings-template.csv" onClick={e => e.stopPropagation()}>Download a template</a>
    </label> : <div className="csv-preview">
      <div className="csv-head"><FileSpreadsheet size={16} /><strong>{parsed.name}</strong><span>{parsed.u.holdings.length} holdings{parsed.u.aum ? ` · ${usd(parsed.u.aum)} total` : ''}</span><button className="icon-button" onClick={() => setParsed(null)} aria-label="Remove file"><X size={15} /></button></div>
      <div className="csv-rows">{parsed.u.holdings.slice(0, 12).map(h => <span key={h.ticker} className={`chip ${isKnownTicker(h.ticker) ? '' : 'chip-warn'}`}>{h.ticker}<small>{h.weight != null ? `${Math.round(h.weight * 10) / 10}%` : h.value != null ? usd(h.value) : 'no weight'}</small></span>)}{parsed.u.holdings.length > 12 && <span className="chip">+{parsed.u.holdings.length - 12} more</span>}</div>
      {parsed.u.notes.map(n => <p key={n} className="csv-note">{n}</p>)}
      <div className="composer-foot"><span className="understood-hint">Weights are computed from the file. Nothing is stored.</span><button className="primary-btn investigate-btn" disabled={pending} onClick={() => onSubmit(parsed.u, `Uploaded ${parsed.name}`)}>{pending ? 'Investigating…' : <>Investigate {parsed.u.holdings.length} holdings <ArrowRight size={16} /></>}</button></div>
    </div>}
    {err && <p className="error-text">{err}</p>}
  </div>;
}
