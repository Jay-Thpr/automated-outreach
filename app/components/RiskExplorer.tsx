'use client';
import { ArrowRight, GitBranch, Pencil } from 'lucide-react';
import type { Portfolio } from '../../lib/types';
import type { Analysis } from '../../lib/agent';
import { correlationMatrix } from '../../lib/risk';
import { COLORS, FactorBars, Heatmap, LookThroughTable, SourcePill, VarianceBar, f1 } from './ui';

const CLASS_LABEL = { reference: 'Reference', 'sector-proxy': 'Sector proxy', unclassified: 'Generic proxy' } as const;
const WEIGHT_LABEL = { stated: 'Stated', 'from-value': 'From value', 'assumed-equal': 'Assumed', proxy: 'Proxy', example: 'Example' } as const;

export function RiskExplorer({ p, a, onAsk, onEdit }: { p: Portfolio; a: Analysis; onAsk: (q: string) => void; onEdit: () => void }) {
  const cm = correlationMatrix(p, 8);
  const themes = a.themes.filter(t => t.weight >= 5).slice(0, 6);
  return <div className="risk-grid">
    <section className="panel risk-factor-panel">
      <div className="panel-heading"><div><span className="kicker">THE HIDDEN DRIVERS</span><h2>Factor exposure map</h2></div><SourcePill p={p} /></div>
      <p className="panel-intro">Weighted sensitivities to four modeled macro factors. Growth and oil are betas; rates and credit are % moves per +100bp.</p>
      <FactorBars exp={a.exp} />
      <span className="kicker">WHERE THE VARIANCE COMES FROM</span>
      <VarianceBar shares={a.risk.factorShares} idio={a.risk.idioShare} />
      <div className="panel-method">Variance decomposition uses an illustrative factor covariance matrix plus stock-specific risk. Diversification ratio: {a.risk.diversificationRatio.toFixed(2)} (average position volatility ÷ portfolio volatility).</div>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><span className="kicker">SHARED ECONOMIC DRIVERS</span><h2>Themes that cut across sectors</h2></div></div>
      <p className="panel-intro">Holdings with different sector labels can depend on the same thing. Fund holdings are counted through their underlying companies.</p>
      {themes.length ? <div className="themes">{themes.map((t, i) => <button key={t.key} className="theme-row" onClick={() => onAsk(`Investigate my ${t.label} exposure`)}>
        <div className="theme-top"><strong>{t.label}</strong><span>{f1(t.weight)}%</span></div>
        <div className="theme-bar"><i style={{ width: `${Math.min(100, t.weight)}%`, background: COLORS[i % COLORS.length] }} /></div>
        <small>{t.holdings.slice(0, 6).map(h => h.ticker).join(', ')} · {t.sectors.length} sector{t.sectors.length > 1 ? 's' : ''}</small>
      </button>)}</div> : <p className="muted">No meaningful cross-sector themes detected.</p>}
    </section>

    {a.lt.hasFunds && <section className="panel">
      <div className="panel-heading"><div><span className="kicker">FUND LOOK-THROUGH</span><h2>Your true company exposure</h2></div></div>
      <p className="panel-intro">Direct positions plus what your funds hold. Fund compositions are approximate static snapshots of top constituents only.</p>
      <LookThroughTable rows={a.lt.rows} />
    </section>}

    {cm.tickers.length > 1 && <section className="panel">
      <div className="panel-heading"><div><span className="kicker">MODELED CORRELATIONS</span><h2>How your largest positions move together</h2></div></div>
      <p className="panel-intro">Implied by shared factor sensitivities and themes in the model. These are not historical correlations.</p>
      <Heatmap tickers={cm.tickers} matrix={cm.matrix} />
    </section>}

    <section className="panel holdings-panel">
      <div className="panel-heading"><div><span className="kicker">UNDER THE HOOD</span><h2>Every position and where its data came from</h2></div><button className="secondary-btn" onClick={onEdit}><Pencil size={13} /> Edit</button></div>
      <div className="holdings-table">
        <div className="holdings-header ht5"><span>ASSET</span><span>SECTOR</span><span>MODEL</span><span>WEIGHT</span><span>RISK</span></div>
        {p.holdings.slice().sort((x, y) => y.weight - x.weight).map((h, i) => {
          const rc = a.risk.contributions.find(c => c.ticker === h.ticker);
          return <div className="holdings-row ht5" key={h.ticker}>
            <div className="asset-cell"><span className="ticker-icon" style={{ background: `${COLORS[i % COLORS.length]}20`, color: COLORS[i % COLORS.length] }}>{h.ticker.slice(0, 2)}</span><div><strong>{h.ticker}</strong><small>{h.name}</small></div></div>
            <span className="asset-sector">{h.sector}</span>
            <span className={`model-tag ${h.classification}`}>{CLASS_LABEL[h.classification]}</span>
            <strong title={`Weight source: ${WEIGHT_LABEL[h.weightSource]}`}>{f1(h.weight)}%<small className={`wsrc ${h.weightSource}`}>{WEIGHT_LABEL[h.weightSource]}</small></strong>
            <strong>{rc ? `${f1(rc.riskShare)}%` : '—'}</strong>
          </div>;
        })}
      </div>
    </section>

    <section className="panel action-panel">
      <div className="action-panel-icon"><GitBranch size={24} /></div>
      <div><h3>Correlation isn’t obvious from sector labels.</h3><p>Ask Atlas which positions share drivers, and what would happen if the most crowded one broke.</p></div>
      <button className="primary-btn" onClick={() => onAsk('Which holdings share the same risk drivers?')}>Investigate overlap <ArrowRight size={15} /></button>
    </section>
  </div>;
}
