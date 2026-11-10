/**
 * Turns what the user has told Atlas (a PortfolioSpec) into a fully parameterized Portfolio.
 *
 * Rules that protect the user:
 *  - User holdings are always used when present. Sample data is never substituted for them.
 *  - When no holdings are given, a REPRESENTATIVE PROXY is built from the description and the
 *    portfolio is marked source='proxy' so every downstream view labels results as illustrative.
 *  - Every gap that Atlas fills is recorded as an explicit Assumption.
 */
import type { Assumption, Holding, HoldingInput, Portfolio, PortfolioSpec, SpecUpdate, StyleKey } from './types';
import { ARCHETYPES, STYLE_TEMPLATES, archetypeFromHint, fundParams, lookupFund, lookupSecurity, normalizeTicker, securityParams } from './universe';
import { formatMoney, styleEmphasis, styleLabel } from './parse';

export function emptySpec(): PortfolioSpec {
  return { description: '', aum: null, aumSource: null, holdings: [], styles: [], styleMix: {}, drawdownLimit: null, exampleId: null, holdingCountHint: null, sleeves: [] };
}

export function applyUpdate(spec: PortfolioSpec, u: SpecUpdate, text?: string): PortfolioSpec {
  const next: PortfolioSpec = { ...spec, holdings: spec.holdings.map(h => ({ ...h })), styleMix: { ...spec.styleMix }, styles: [...spec.styles] };
  if (text && text.trim()) next.description = [spec.description, text.trim()].filter(Boolean).join('\n');
  if (u.holdingsMode === 'replace') {
    next.holdings = u.holdings.map(h => ({ ...h, ticker: normalizeTicker(h.ticker) }));
    next.exampleId = null;
  } else if (u.holdingsMode === 'merge') {
    for (const h of u.holdings) {
      const t = normalizeTicker(h.ticker);
      const ex = next.holdings.find(x => x.ticker === t);
      if (ex) {
        if (h.weight != null) ex.weight = h.weight;
        if (h.value != null) ex.value = h.value;
        if (h.sectorHint) ex.sectorHint = h.sectorHint;
        if (h.name) ex.name = h.name;
      } else next.holdings.push({ ...h, ticker: t });
    }
    if (u.holdings.length) next.exampleId = null;
  }
  if (u.remove.length) next.holdings = next.holdings.filter(h => !u.remove.map(normalizeTicker).includes(h.ticker));
  if (u.aum != null) { next.aum = u.aum; next.aumSource = 'stated'; }
  if (u.styles.length) next.styles = Array.from(new Set([...(u.holdingsMode === 'replace' ? [] : next.styles), ...u.styles]));
  if (Object.keys(u.styleMix).length) next.styleMix = { ...u.styleMix };
  if (u.drawdownLimit != null) next.drawdownLimit = u.drawdownLimit;
  if (u.holdingCountHint != null) next.holdingCountHint = u.holdingCountHint;
  if (u.sleeves.length) next.sleeves = Array.from(new Set([...(next.sleeves ?? []), ...u.sleeves]));
  return next;
}

function resolveHolding(h: HoldingInput): Omit<Holding, 'weight' | 'weightSource'> {
  const ticker = normalizeTicker(h.ticker);
  const fund = lookupFund(ticker);
  if (fund) {
    const fp = fundParams(fund);
    const kind = ARCHETYPES[fund.other.archetype].kind === 'equity' ? 'etf' : ARCHETYPES[fund.other.archetype].kind;
    return { ticker, name: fund.name, sector: fund.sector, kind, region: /World|Global|All Country/.test(fund.name) ? 'Global' : 'US', factors: fp.factors, vol: fund.vol, themes: fp.themes, classification: 'reference' };
  }
  const sec = lookupSecurity(ticker);
  if (sec) {
    const sp = securityParams(sec);
    return { ticker, name: sec.name, sector: sp.sector, kind: sp.kind, region: sp.region, factors: sp.factors, vol: sp.vol, themes: sp.themes, classification: 'reference' };
  }
  const arch = archetypeFromHint(h.sectorHint);
  if (arch) {
    const a = ARCHETYPES[arch];
    return { ticker, name: h.name || ticker, sector: a.sector, kind: a.kind, region: 'Unknown', factors: { ...a.factors }, vol: a.kind === 'equity' ? Math.round(a.vol * 1.15) : a.vol, themes: [...a.themes], classification: 'sector-proxy' };
  }
  const b = ARCHETYPES.broadequity;
  return { ticker, name: h.name || ticker, sector: 'Unclassified', kind: 'equity', region: 'Unknown', factors: { ...b.factors, growth: 1.1 }, vol: 35, themes: [], classification: 'unclassified' };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildPortfolio(spec: PortfolioSpec): Portfolio | null {
  const assumptions: Assumption[] = [];
  if (spec.holdings.length) {
    let aum = spec.aum;
    let valueSource: Portfolio['valueSource'] = spec.aumSource;
    let hs = spec.holdings;
    // Sleeves the user mentioned without naming positions are represented by a labeled proxy fund.
    const sleeveAdds: HoldingInput[] = [];
    const sleeves = (spec.sleeves ?? []).filter(k => SLEEVE_FUND[k] && !hs.some(h => normalizeTicker(h.ticker) === SLEEVE_FUND[k]));
    if (sleeves.length) {
      const givenSum = hs.reduce((s, h) => s + (h.weight ?? 0), 0);
      const allWeighted = hs.every(h => h.weight != null && h.weight > 0);
      for (const k of sleeves) {
        const weight = allWeighted && givenSum < 99.5 ? (100 - givenSum) / sleeves.length : null;
        sleeveAdds.push({ ticker: SLEEVE_FUND[k] as string, weight });
      }
      if (allWeighted && givenSum >= 99.5) sleeveAdds.length = 0;
      hs = [...hs, ...sleeveAdds];
    }
    const allValues = hs.every(h => h.value != null && h.value > 0);
    const anyWeight = hs.some(h => h.weight != null && h.weight > 0);
    let weights: number[] = [];
    let sources: Holding['weightSource'][] = [];
    const exampleMode = !!spec.exampleId;
    if (!anyWeight && allValues) {
      const tot = hs.reduce((s, h) => s + (h.value as number), 0);
      weights = hs.map(h => ((h.value as number) / tot) * 100);
      sources = hs.map(() => 'from-value');
      if (aum == null) { aum = tot; valueSource = 'file'; }
    } else if (anyWeight || hs.some(h => h.value != null)) {
      weights = hs.map(h => (h.weight != null && h.weight > 0 ? h.weight : h.value != null && aum ? (h.value / aum) * 100 : NaN));
      sources = hs.map((h, i) => (isNaN(weights[i]) ? 'assumed-equal' : h.weight != null ? 'stated' : 'from-value'));
      const known = weights.filter(w => !isNaN(w));
      const knownSum = known.reduce((a, b) => a + b, 0);
      const missing = weights.filter(w => isNaN(w)).length;
      if (missing) {
        const each = knownSum < 100 ? (100 - knownSum) / missing : knownSum / known.length;
        weights = weights.map(w => (isNaN(w) ? each : w));
        const names = hs.filter((_, i) => sources[i] === 'assumed-equal').map(h => h.ticker);
        assumptions.push({ id: 'partial-weights', severity: 'medium', text: `No weight given for ${names.join(', ')}; I assigned ${r1(each)}% each${knownSum < 100 ? ' from the unallocated remainder' : ''}.` });
      }
    } else {
      weights = hs.map(() => 100 / hs.length);
      sources = hs.map(() => 'assumed-equal');
      if (hs.length > 1) assumptions.push({ id: 'equal-weights', severity: 'high', text: `No weights provided, so I assumed equal weights (${r1(100 / hs.length)}% each). Concentration and risk-share findings depend on this.` });
    }
    const sum = weights.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.5 && sum > 0) {
      if (sum < 100) assumptions.push({ id: 'scaled-up', severity: sum < 80 ? 'high' : 'medium', text: `Your weights add up to ${r1(sum)}%. I scaled them to 100%; if the other ${r1(100 - sum)}% is held elsewhere, concentration is overstated.` });
      else assumptions.push({ id: 'scaled-down', severity: 'low', text: `Your weights add up to ${r1(sum)}%; I scaled them to 100%.` });
      weights = weights.map(w => (w / sum) * 100);
    }
    const sleeveSet = new Set(sleeveAdds.map(h => h.ticker));
    const holdings: Holding[] = hs.map((h, i) => ({ ...resolveHolding(h), weight: r1(weights[i] * 10) / 10, weightSource: exampleMode ? 'example' : sleeveSet.has(h.ticker) ? 'proxy' : sources[i] }));
    if (sleeveAdds.length) {
      const desc = holdings.filter(h => sleeveSet.has(h.ticker)).map(h => `${h.ticker} (${h.weight.toFixed(1)}%)`).join(', ');
      assumptions.push({ id: 'sleeve', severity: 'medium', text: `You mentioned ${sleeves.map(k => STYLE_TEMPLATES[k].label.toLowerCase()).join(' and ')} without specific positions, so I represented ${sleeveAdds.length > 1 ? 'them' : 'it'} with ${desc} as a proxy.` });
    }
    const unclassified = holdings.filter(h => h.classification === 'unclassified');
    const proxied = holdings.filter(h => h.classification === 'sector-proxy');
    if (unclassified.length) assumptions.push({ id: 'unclassified', severity: unclassified.reduce((s, h) => s + h.weight, 0) > 20 ? 'high' : 'medium', text: `${unclassified.map(h => h.ticker).join(', ')} ${unclassified.length > 1 ? "aren't" : "isn't"} in my reference set, so I modeled ${unclassified.length > 1 ? 'them' : 'it'} as a generic equity with above-market risk.` });
    if (proxied.length) assumptions.push({ id: 'sector-proxy', severity: 'low', text: `${proxied.map(h => `${h.ticker} (${h.sector})`).join(', ')} ${proxied.length > 1 ? 'are' : 'is'} modeled with a sector archetype, not security-specific parameters.` });
    const example = spec.exampleId ? EXAMPLES.find(e => e.id === spec.exampleId) : null;
    return {
      name: example ? example.name : 'Your portfolio',
      description: example ? example.description : summarize(holdings),
      source: example ? 'example' : 'user',
      value: aum,
      valueSource: example ? 'example' : valueSource,
      holdings,
      assumptions,
      drawdownLimit: spec.drawdownLimit,
      styles: spec.styles,
    };
  }

  // ----- Proxy from a description -----
  const mix = proxyMix(spec);
  if (!mix) return null;
  const acc = new Map<string, number>();
  for (const [style, w] of Object.entries(mix) as [StyleKey, number][]) {
    for (const [t, tw] of STYLE_TEMPLATES[style].holdings) acc.set(t, (acc.get(t) || 0) + (w * tw) / 100);
  }
  const total = Array.from(acc.values()).reduce((a, b) => a + b, 0);
  const holdings: Holding[] = Array.from(acc.entries())
    .map(([t, w]) => ({ ...resolveHolding({ ticker: t }), weight: r1((w / total) * 100 * 10) / 10, weightSource: 'proxy' as const }))
    .sort((a, b) => b.weight - a.weight);
  const label = proxyLabel(spec, mix);
  assumptions.push({ id: 'proxy', severity: 'high', text: `You haven't shared holdings, so I built a representative ${label} proxy (${holdings.length} positions) from my reference set. Holding-level results are illustrative, not about your actual positions.` });
  if (spec.holdingCountHint && Math.abs(spec.holdingCountHint - holdings.length) > 3) assumptions.push({ id: 'count', severity: 'medium', text: `You mentioned about ${spec.holdingCountHint} positions; the proxy has ${holdings.length}, so concentration may differ.` });
  return {
    name: `Illustrative ${label} portfolio`,
    description: `Representative proxy built from your description${spec.aum ? ` (${formatMoney(spec.aum)})` : ''}.`,
    source: 'proxy',
    value: spec.aum,
    valueSource: spec.aum ? 'stated' : null,
    holdings,
    assumptions,
    drawdownLimit: spec.drawdownLimit,
    styles: spec.styles,
  };
}

/** Decide the sleeve weights for a proxy portfolio. Returns null when there is nothing to go on. */
const SLEEVE_FUND: Partial<Record<StyleKey, string>> = { broad: 'SPY', bonds: 'AGG', cash: 'CASH', international: 'VXUS', emerging: 'VWO', gold: 'GLD', crypto: 'IBIT', tech: 'QQQ', dividend: 'SCHD' };

export function proxyMix(spec: PortfolioSpec): Partial<Record<StyleKey, number>> | null {
  const mixEntries = Object.entries(spec.styleMix).filter(([, v]) => (v ?? 0) > 0) as [StyleKey, number][];
  if (mixEntries.length) {
    const mix: Partial<Record<StyleKey, number>> = {};
    let sum = 0;
    for (const [k, v] of mixEntries) { mix[k] = v; sum += v; }
    if (sum < 99.5) {
      const extra = spec.styles.filter(s => !mix[s]);
      const rest = 100 - sum;
      if (extra.length) extra.forEach(s => (mix[s] = rest / extra.length));
      else mix.broad = (mix.broad ?? 0) + rest;
    }
    // Refine generic "stocks" with a stated equity style, e.g. "70% tech-heavy stocks".
    const eqStyle = spec.styles.find(s => ['tech', 'semis', 'growth', 'dividend', 'value', 'healthcare', 'financials', 'energy', 'transition'].includes(s));
    if (eqStyle && mix.broad && !mix[eqStyle]) {
      const b = mix.broad;
      const e = styleEmphasis(spec.description);
      mix[eqStyle] = b * (e < 1 ? e : 1);
      mix.broad = b - mix[eqStyle]!;
      if (mix.broad! <= 0.01) delete mix.broad;
    }
    return mix;
  }
  const styles = spec.styles.length ? spec.styles : [];
  if (!styles.length) return null;
  const e = styleEmphasis(spec.description);
  if (styles.length === 1) {
    const s = styles[0];
    if (e < 1 && !['balanced', 'broad'].includes(s)) return { [s]: e * 100, broad: (1 - e) * 100 };
    return { [s]: 100 };
  }
  const primary = styles[0];
  if (e < 1) {
    const mix: Partial<Record<StyleKey, number>> = { [primary]: e * 100 };
    styles.slice(1).forEach(s => (mix[s] = ((1 - e) * 100) / (styles.length - 1)));
    return mix;
  }
  const mix: Partial<Record<StyleKey, number>> = {};
  styles.forEach(s => (mix[s] = 100 / styles.length));
  return mix;
}

function proxyLabel(spec: PortfolioSpec, mix: Partial<Record<StyleKey, number>>): string {
  const keys = Object.keys(mix) as StyleKey[];
  if (Object.keys(spec.styleMix).length) {
    return keys.sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0)).map(k => `${Math.round(mix[k] ?? 0)}% ${STYLE_TEMPLATES[k].label.toLowerCase()}`).join(' / ');
  }
  return styleLabel(spec.styles, spec.description.toLowerCase());
}

function summarize(hs: Holding[]): string {
  const sectors = new Set(hs.map(h => h.sector));
  return `${hs.length} position${hs.length === 1 ? '' : 's'} across ${sectors.size} sector${sectors.size === 1 ? '' : 's'}`;
}

// ----- Built-in examples (clearly labeled as examples everywhere they appear) -----

export const EXAMPLES: { id: string; name: string; short: string; description: string; aum: number; holdings: [string, number][] }[] = [
  { id: 'ai', name: 'AI & Technology Growth', short: 'Concentrated mega-cap tech', description: 'Six large-cap innovation leaders', aum: 500_000_000, holdings: [['NVDA', 24], ['MSFT', 20], ['AMZN', 16], ['GOOGL', 15], ['META', 13], ['AVGO', 12]] },
  { id: 'core', name: 'ETF Core + Conviction', short: 'Index funds plus favorite stocks', description: 'Broad index funds with high-conviction single stocks', aum: 75_000_000, holdings: [['QQQ', 25], ['SPY', 25], ['NVDA', 10], ['AAPL', 10], ['MSFT', 10], ['SMH', 10], ['TLT', 10]] },
  { id: 'balanced', name: 'Global Balanced Allocation', short: 'Multi-asset 60/40-style', description: 'Global equities, Treasuries, credit and gold', aum: 320_000_000, holdings: [['VT', 34], ['IEF', 28], ['LQD', 15], ['VXUS', 12], ['GLD', 6], ['CASH', 5]] },
  { id: 'transition', name: 'Energy Transition Leaders', short: 'Thematic clean energy', description: 'Clean power, grid infrastructure and electrification', aum: 180_000_000, holdings: [['NEE', 16], ['FSLR', 14], ['ENPH', 10], ['TSLA', 14], ['GRID', 18], ['LIT', 10], ['ICLN', 12], ['CASH', 6]] },
];

export function exampleSpec(id: string): PortfolioSpec {
  const e = EXAMPLES.find(x => x.id === id) ?? EXAMPLES[0];
  return { ...emptySpec(), description: `Example: ${e.name}`, aum: e.aum, aumSource: 'example', exampleId: e.id, holdings: e.holdings.map(([ticker, weight]) => ({ ticker, weight })) };
}
