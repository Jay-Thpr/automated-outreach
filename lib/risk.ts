/**
 * Deterministic analytics. Same inputs always produce the same outputs.
 * All results are MODELED ESTIMATES from the illustrative parameters in universe.ts:
 * no market data, no historical estimation, no forecasting.
 */
import type { Factor, FactorLoadings, Holding, Portfolio, Shock } from './types';
import { FACTORS, FACTOR_CORR, FACTOR_META, THEMES, lookupFund, lookupSecurity, securityParams } from './universe';

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// ---------- Concentration ----------

export function concentration(p: Portfolio) {
  const sorted = p.holdings.slice().sort((a, b) => b.weight - a.weight);
  const w = sorted.map(h => h.weight / 100);
  const hhi = w.reduce((s, x) => s + x * x, 0);
  return {
    count: p.holdings.length,
    top1: sorted[0]?.weight ?? 0,
    top1Ticker: sorted[0]?.ticker ?? '',
    top3: sorted.slice(0, 3).reduce((a, h) => a + h.weight, 0),
    top5: sorted.slice(0, 5).reduce((a, h) => a + h.weight, 0),
    hhi,
    effective: hhi > 0 ? 1 / hhi : 0,
  };
}

export function sectorWeights(p: Portfolio) {
  const m: Record<string, number> = {};
  p.holdings.forEach(h => (m[h.sector] = (m[h.sector] || 0) + h.weight));
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: round(value, 1) }));
}

export function kindWeights(p: Portfolio) {
  const m: Record<string, number> = {};
  p.holdings.forEach(h => {
    const k = h.kind === 'etf' ? 'equity' : h.kind;
    m[k] = (m[k] || 0) + h.weight;
  });
  return m;
}

// ---------- Factor exposure ----------

export function exposure(p: Portfolio): FactorLoadings {
  const e: FactorLoadings = { growth: 0, rates: 0, credit: 0, oil: 0 };
  for (const h of p.holdings) for (const k of FACTORS) e[k] += (h.weight / 100) * h.factors[k];
  for (const k of FACTORS) e[k] = round(e[k], 3);
  return e;
}

// ---------- Factor risk model ----------

function factorCov(a: Factor, b: Factor) {
  return FACTOR_CORR[a][b] * FACTOR_META[a].vol * FACTOR_META[b].vol;
}

function systematicVar(f: FactorLoadings) {
  let v = 0;
  for (const a of FACTORS) for (const b of FACTORS) v += f[a] * f[b] * factorCov(a, b);
  return v;
}

function idioFloorFor(h: Holding): number {
  if (h.kind === 'cash') return 1;
  if (h.kind === 'etf') return 0.12;
  if (h.kind === 'bond') return 0.1;
  const s = lookupSecurity(h.ticker);
  return s ? securityParams(s).idioFloor : 0.3;
}

export function idioVar(h: Holding) {
  const sys = systematicVar(h.factors);
  const floor = idioFloorFor(h) * h.vol;
  return Math.max(h.vol * h.vol - sys, floor * floor);
}

/** Modeled total volatility of a single holding (consistent with the covariance model). */
export function holdingVol(h: Holding) {
  return Math.sqrt(systematicVar(h.factors) + idioVar(h));
}

/** Covariance between two holdings: systematic via shared factors, plus idiosyncratic on the diagonal. */
export function covariance(a: Holding, b: Holding, same: boolean) {
  let c = 0;
  for (const x of FACTORS) for (const y of FACTORS) c += a.factors[x] * b.factors[y] * factorCov(x, y);
  // Holdings that share themes have an extra common component the factor model does not capture.
  if (!same) {
    const shared = a.themes.filter(t => b.themes.includes(t)).length;
    if (shared > 0) c += Math.min(0.25, 0.08 * shared) * Math.sqrt(idioVar(a) * idioVar(b));
  } else c += idioVar(a);
  return c;
}

export function correlation(a: Holding, b: Holding) {
  const c = covariance(a, b, a === b);
  return c / Math.sqrt(covariance(a, a, true) * covariance(b, b, true));
}

export function riskModel(p: Portfolio) {
  const hs = p.holdings;
  const w = hs.map(h => h.weight / 100);
  const n = hs.length;
  const cov: number[][] = hs.map((a, i) => hs.map((b, j) => covariance(a, b, i === j)));
  const sigmaW = cov.map(row => row.reduce((s, c, j) => s + c * w[j], 0));
  const variance = w.reduce((s, wi, i) => s + wi * sigmaW[i], 0);
  const vol = Math.sqrt(Math.max(variance, 0));
  const contributions = hs.map((h, i) => ({
    ticker: h.ticker,
    name: h.name,
    weight: h.weight,
    riskShare: variance > 0 ? (w[i] * sigmaW[i]) / variance * 100 : 0,
  }));
  // Factor decomposition of variance.
  const e = exposure(p);
  const factorShares = FACTORS.map(k => {
    const c = FACTORS.reduce((s, j) => s + e[j] * factorCov(k, j), 0);
    return { factor: k, label: FACTOR_META[k].label, share: variance > 0 ? (e[k] * c) / variance * 100 : 0 };
  });
  const systematic = factorShares.reduce((s, f) => s + f.share, 0);
  const weightedVol = hs.reduce((s, h, i) => s + w[i] * holdingVol(h), 0);
  const rs = contributions.map(c => Math.max(c.riskShare, 0) / 100);
  const rsSum = rs.reduce((a, b) => a + b, 0) || 1;
  const effectiveBets = 1 / rs.reduce((s, x) => s + (x / rsSum) ** 2, 0);
  return {
    vol: round(vol, 2),
    weightedVol: round(weightedVol, 2),
    diversificationRatio: vol > 0 ? round(weightedVol / vol, 2) : 1,
    contributions: contributions.map(c => ({ ...c, riskShare: round(c.riskShare, 1) })).sort((a, b) => b.riskShare - a.riskShare),
    factorShares: factorShares.map(f => ({ ...f, share: round(f.share, 1) })),
    idioShare: round(100 - systematic, 1),
    effectiveBets: round(n ? effectiveBets : 0, 1),
  };
}

/** Pairwise modeled correlations among the largest holdings. */
export function correlationMatrix(p: Portfolio, max = 8) {
  const top = p.holdings.slice().sort((a, b) => b.weight - a.weight).slice(0, max);
  return { tickers: top.map(h => h.ticker), matrix: top.map(a => top.map(b => round(correlation(a, b), 2))) };
}

// ---------- Look-through ----------

export type LookThroughRow = { ticker: string; name: string; direct: number; viaFunds: number; total: number; sources: { fund: string; weight: number }[] };

export function lookThrough(p: Portfolio) {
  const rows = new Map<string, LookThroughRow>();
  const get = (ticker: string, name: string) => {
    if (!rows.has(ticker)) rows.set(ticker, { ticker, name, direct: 0, viaFunds: 0, total: 0, sources: [] });
    return rows.get(ticker)!;
  };
  const funds: { ticker: string; weight: number; covered: number }[] = [];
  for (const h of p.holdings) {
    const f = lookupFund(h.ticker);
    if (f) {
      let covered = 0;
      for (const [t, cw] of f.constituents) {
        const s = lookupSecurity(t);
        const r = get(t, s?.name ?? t);
        const eff = (h.weight * cw) / 100;
        r.viaFunds += eff;
        r.sources.push({ fund: f.ticker, weight: round(eff, 2) });
        covered += cw;
      }
      funds.push({ ticker: f.ticker, weight: h.weight, covered });
    } else if (h.kind !== 'cash' && h.kind !== 'bond') {
      get(h.ticker, h.name).direct += h.weight;
    }
  }
  const list = Array.from(rows.values()).map(r => ({ ...r, direct: round(r.direct, 2), viaFunds: round(r.viaFunds, 2), total: round(r.direct + r.viaFunds, 2) })).sort((a, b) => b.total - a.total);
  return { funds, rows: list, hasFunds: funds.length > 0 };
}

// ---------- Themes (shared hidden drivers) ----------

export type ThemeExposure = { key: string; label: string; driver: string; weight: number; holdings: { ticker: string; weight: number }[]; sectors: string[] };

export function themeExposure(p: Portfolio): ThemeExposure[] {
  const acc = new Map<string, { weight: number; holdings: Map<string, number>; sectors: Set<string> }>();
  const add = (theme: string, ticker: string, w: number, sector: string) => {
    if (!THEMES[theme]) return;
    if (!acc.has(theme)) acc.set(theme, { weight: 0, holdings: new Map(), sectors: new Set() });
    const a = acc.get(theme)!;
    a.weight += w;
    a.holdings.set(ticker, (a.holdings.get(ticker) || 0) + w);
    a.sectors.add(sector);
  };
  for (const h of p.holdings) {
    const f = lookupFund(h.ticker);
    if (f) {
      for (const [t, cw] of f.constituents) {
        const s = lookupSecurity(t);
        if (!s) continue;
        const sp = securityParams(s);
        for (const th of sp.themes) add(th, h.ticker, (h.weight * cw) / 100, sp.sector);
      }
      for (const th of f.themes ?? []) add(th, h.ticker, h.weight * 0.5, f.sector);
    } else {
      for (const th of h.themes) add(th, h.ticker, h.weight, h.sector);
    }
  }
  return Array.from(acc.entries()).map(([key, a]) => ({
    key,
    label: THEMES[key].label,
    driver: THEMES[key].driver,
    weight: round(a.weight, 1),
    holdings: Array.from(a.holdings.entries()).map(([ticker, weight]) => ({ ticker, weight: round(weight, 1) })).sort((x, y) => y.weight - x.weight),
    sectors: Array.from(a.sectors),
  })).sort((x, y) => y.weight - x.weight);
}

// ---------- Scenarios ----------

export type Scenario = { key: string; name: string; description: string; shock: Shock; themeShocks: Record<string, number> };

export const SCENARIOS: Scenario[] = [
  { key: 'ai', name: 'AI valuation reset', description: 'AI-linked equities de-rate as returns on data-center spending disappoint; quality bonds rally modestly.', shock: { growth: -18, rates: -0.3, credit: 0.4, oil: -5 }, themeShocks: { 'ai-capex': -15 } },
  { key: 'rates', name: 'Rates higher for longer', description: 'Sticky inflation pushes yields up 125bp; long-duration assets re-price.', shock: { growth: -8, rates: 1.25, credit: 0.3, oil: 5 }, themeShocks: {} },
  { key: 'recession', name: 'Global recession', description: 'Growth contracts, credit spreads widen sharply, oil falls and yields drop.', shock: { growth: -25, rates: -1.5, credit: 2.0, oil: -35 }, themeShocks: { 'consumer-credit': -8 } },
  { key: 'energy', name: 'Energy supply shock', description: 'A supply disruption sends oil up 45%, lifting yields and hurting growth.', shock: { growth: -8, rates: 0.5, credit: 0.5, oil: 45 }, themeShocks: {} },
  { key: 'taiwan', name: 'Taiwan supply disruption', description: 'Advanced chip production is interrupted; hardware supply chains stall and investors seek safety.', shock: { growth: -12, rates: -0.5, credit: 0.6, oil: 8 }, themeShocks: { 'taiwan-fab': -25 } },
];

export function scenarioByKey(key: string) {
  return SCENARIOS.find(s => s.key === key) ?? SCENARIOS[0];
}

function themeHit(h: Holding, themeShocks: Record<string, number>) {
  // Funds: apply theme shocks via look-through constituents.
  const f = lookupFund(h.ticker);
  if (f) {
    let t = 0;
    for (const [tk, cw] of f.constituents) {
      const s = lookupSecurity(tk);
      if (!s) continue;
      const th = securityParams(s).themes;
      for (const k of Object.keys(themeShocks)) if (th.includes(k)) t += (cw / 100) * themeShocks[k];
    }
    return t;
  }
  return Object.keys(themeShocks).reduce((t, k) => t + (h.themes.includes(k) ? themeShocks[k] : 0), 0);
}

export function holdingShock(h: Holding, shock: Shock, themeShocks: Record<string, number> = {}) {
  const factorPart = FACTORS.reduce((s, k) => s + h.factors[k] * shock[k], 0);
  return factorPart + themeHit(h, themeShocks);
}

/** Linear factor-shock model. Returns modeled % change. Floors single holdings at -95%. */
export function impact(p: Portfolio, shock: Shock, themeShocks: Record<string, number> = {}) {
  const e = exposure(p);
  const contributions: { key: string; label: string; value: number }[] = FACTORS.map(k => ({ key: k, label: FACTOR_META[k].label, value: round(e[k] * shock[k], 2) }));
  for (const k of Object.keys(themeShocks)) {
    const v = p.holdings.reduce((s, h) => s + (h.weight / 100) * themeHit(h, { [k]: themeShocks[k] }), 0);
    contributions.push({ key: 'theme:' + k, label: `${THEMES[k]?.label ?? k} (theme shock)`, value: round(v, 2) });
  }
  const holdings = p.holdings.map(h => {
    const raw = holdingShock(h, shock, themeShocks);
    const imp = Math.max(-95, raw);
    return { ticker: h.ticker, name: h.name, weight: h.weight, impact: round(imp, 2), contribution: round((h.weight / 100) * imp, 2) };
  }).sort((a, b) => a.impact - b.impact);
  const pct = round(holdings.reduce((s, h) => s + h.contribution, 0), 2);
  return { pct, dollars: p.value != null ? (p.value * pct) / 100 : null, contributions, holdings };
}

export function allScenarios(p: Portfolio) {
  return SCENARIOS.map(s => ({ ...s, result: impact(p, s.shock, s.themeShocks) })).sort((a, b) => a.result.pct - b.result.pct);
}

// ---------- What-if ----------

/** Cap one holding's weight and redistribute the excess pro-rata to the others. */
export function capHolding(p: Portfolio, ticker: string, cap: number): Portfolio {
  const target = p.holdings.find(h => h.ticker === ticker);
  if (!target || target.weight <= cap) return p;
  const excess = target.weight - cap;
  const othersTotal = p.holdings.filter(h => h.ticker !== ticker).reduce((s, h) => s + h.weight, 0);
  if (othersTotal <= 0) return p;
  return {
    ...p,
    holdings: p.holdings.map(h => (h.ticker === ticker ? { ...h, weight: cap } : { ...h, weight: h.weight + (excess * h.weight) / othersTotal })),
  };
}

/** Modeled 1-in-20 annual loss (parametric, normal approximation): 1.645 × σ. Illustrative only. */
export function modeledTailLoss(vol: number) {
  return round(1.645 * vol, 1);
}
