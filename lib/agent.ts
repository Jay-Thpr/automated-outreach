/**
 * The Atlas investigation agent (deterministic core).
 *
 * The planner inspects the portfolio, decides which analyses are worth running (and which to skip),
 * records WHY for each decision, ranks findings by how non-obvious they are, and proposes the specific
 * additional information that would most improve the analysis.
 *
 * Every number in every finding comes from the tools in risk.ts. When an AI model is configured, it
 * can call the same tools (see llm.ts) and write the narrative, but it never supplies numbers.
 */
import type { Basis, Finding, Portfolio, PortfolioSpec, TraceStep, Unlock } from './types';
import { FACTOR_META, THEMES, lookupFund, lookupSecurity } from './universe';
import { allScenarios, capHolding, concentration, correlationMatrix, exposure, holdingShock, impact, lookThrough, modeledTailLoss, riskModel, scenarioByKey, SCENARIOS, sectorWeights, themeExposure } from './risk';
import { formatMoney } from './parse';
import { buildPortfolio } from './portfolio';

const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
const pct = (n: number) => `${n >= 0 ? '+' : '−'}${f1(Math.abs(n))}%`;
/** Lowercase the first letter of each word unless the word is an acronym. */
const lc = (s: string) => s.split(' ').map(w => (/^[A-Z0-9&\-]{2,}$/.test(w) ? w : w.charAt(0).toLowerCase() + w.slice(1))).join(' ');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const money = (p: Portfolio, pctMove: number) => (p.value != null ? `${pctMove < 0 ? '−' : '+'}${formatMoney(Math.abs((p.value * pctMove) / 100))}` : null);

export type Analysis = ReturnType<typeof analyze>;

export function analyze(p: Portfolio) {
  const conc = concentration(p);
  const risk = riskModel(p);
  const exp = exposure(p);
  const lt = lookThrough(p);
  const themes = themeExposure(p);
  const scenarios = allScenarios(p);
  const sectors = sectorWeights(p);
  const defensive = p.holdings.filter(h => h.kind === 'bond' || h.kind === 'cash' || h.sector === 'Gold').reduce((s, h) => s + h.weight, 0);
  const bonds = p.holdings.filter(h => h.kind === 'bond').reduce((s, h) => s + h.weight, 0);
  const tail = modeledTailLoss(risk.vol);
  return { conc, risk, exp, lt, themes, scenarios, sectors, defensive, bonds, tail };
}

export type WhatIf = { ticker: string; from: number; to: number; volBefore: number; volAfter: number; worstBefore: number; worstAfter: number; scenario: string };

export function runWhatIf(p: Portfolio, ticker: string, cap: number): WhatIf | null {
  const h = p.holdings.find(x => x.ticker === ticker);
  if (!h || h.weight <= cap) return null;
  const before = riskModel(p);
  const capped = capHolding(p, ticker, cap);
  const after = riskModel(capped);
  const worst = allScenarios(p)[0];
  const worstAfter = impact(capped, worst.shock, worst.themeShocks).pct;
  return { ticker, from: h.weight, to: cap, volBefore: before.vol, volAfter: after.vol, worstBefore: worst.result.pct, worstAfter, scenario: worst.name };
}

export type HedgeCheck = { sleeve: number; byScenario: { key: string; name: string; sleeveMove: number; restMove: number; offsets: boolean }[]; anyGainer: boolean; gainers: string[] };

export function hedgeCheck(p: Portfolio): HedgeCheck {
  const isDef = (h: Portfolio['holdings'][number]) => h.kind === 'bond' || h.kind === 'cash' || h.sector === 'Gold';
  const def = p.holdings.filter(isDef), rest = p.holdings.filter(h => !isDef(h));
  const dw = def.reduce((s, h) => s + h.weight, 0), rw = rest.reduce((s, h) => s + h.weight, 0);
  const byScenario = SCENARIOS.map(s => {
    const sm = dw ? def.reduce((a, h) => a + h.weight * holdingShock(h, s.shock, s.themeShocks), 0) / dw : 0;
    const rm = rw ? rest.reduce((a, h) => a + h.weight * holdingShock(h, s.shock, s.themeShocks), 0) / rw : 0;
    return { key: s.key, name: s.name, sleeveMove: Math.round(sm * 10) / 10, restMove: Math.round(rm * 10) / 10, offsets: sm > 0.25 && rm < 0 };
  });
  const gainers = p.holdings.filter(h => h.kind !== 'cash' && SCENARIOS.some(s => holdingShock(h, s.shock, s.themeShocks) > 0.5)).map(h => h.ticker);
  return { sleeve: dw, byScenario, anyGainer: gainers.length > 0, gainers };
}

function basisFor(p: Portfolio, weightSensitive = true): Basis {
  if (p.source === 'proxy') return 'illustrative';
  if (p.source === 'example') return 'example';
  if (weightSensitive && p.assumptions.some(a => a.severity === 'high')) return 'assumption';
  return 'portfolio';
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

export type Investigation = {
  trace: TraceStep[];
  findings: Finding[];
  headline: Finding | null;
  narrative: string;
  unlocks: Unlock[];
  delta: { label: string; before: string; after: string }[];
  whatIf: WhatIf | null;
  hedge: HedgeCheck | null;
  focusScenario: string;
};

/** Run the full autonomous first-pass investigation. */
export function investigate(p: Portfolio, spec: PortfolioSpec, prev?: Portfolio | null): Investigation {
  const a = analyze(p);
  const trace: TraceStep[] = [];
  const findings: Finding[] = [];
  const step = (tool: string, title: string, reason: string, result: string, status: TraceStep['status'] = 'done') =>
    trace.push({ id: `${tool}-${trace.length}`, tool, title, reason, result, status, by: 'planner' });
  const isProxy = p.source === 'proxy';
  const subject = isProxy ? 'this proxy' : p.source === 'example' ? 'this example portfolio' : 'your portfolio';

  // 1. Understand the input
  if (isProxy) {
    step('build_portfolio', 'Built an illustrative proxy', 'You described the portfolio but didn’t list holdings. A representative proxy lets me run real calculations now; I’ll flag which results depend on it.', `${p.holdings.length} representative positions${p.value ? ` · ${formatMoney(p.value)} stated AUM` : ''}`);
  } else {
    const unknown = p.holdings.filter(h => h.classification !== 'reference');
    step('resolve_holdings', p.source === 'example' ? 'Loaded example holdings' : 'Resolved your holdings', 'I need each position’s sector, factor sensitivities and themes before any risk math is meaningful.', `${p.holdings.length} positions matched${unknown.length ? ` · ${unknown.length} modeled with proxies (${unknown.map(h => h.ticker).join(', ')})` : ' · all in reference set'}${p.value ? ` · ${formatMoney(p.value)}` : ''}`);
  }

  // 2. Concentration
  step('concentration', 'Measured concentration', 'Position count can hide concentration, so I checked weight-based breadth first.', `Top 3 = ${f1(a.conc.top3)}% · behaves like ${f1(a.conc.effective)} equal-weight positions (of ${a.conc.count})`);

  // 3. Look-through
  let overlapRow: (typeof a.lt.rows)[number] | null = null;
  if (a.lt.hasFunds) {
    overlapRow = a.lt.rows.filter(r => r.viaFunds >= 1).sort((x, y) => (y.viaFunds + (y.direct > 0 ? 3 : 0)) - (x.viaFunds + (x.direct > 0 ? 3 : 0)))[0] ?? null;
    const top = a.lt.rows[0];
    step('look_through', 'Looked through your funds', `You hold ${a.lt.funds.length} fund${a.lt.funds.length > 1 ? 's' : ''} (${a.lt.funds.map(f => f.ticker).join(', ')}). Funds often own the same companies you hold directly, which statements don’t show.`, top ? `Largest true company exposure: ${top.ticker} ${f1(top.total)}% (${f1(top.direct)}% direct + ${f1(top.viaFunds)}% via funds)` : 'No overlapping constituents found');
  } else {
    step('look_through', 'Fund look-through', 'Skipped: no funds detected, so direct weights are the true company exposures.', '—', 'skipped');
  }

  // 4. Risk decomposition
  const topRisk = a.risk.contributions[0];
  const domFactor = a.risk.factorShares.slice().sort((x, y) => y.share - x.share)[0];
  step('risk_decomposition', 'Decomposed modeled risk', 'Weight isn’t risk. I split modeled volatility by position and by factor to see what actually drives it.', `Modeled volatility ${f1(a.risk.vol)}% · ${topRisk.ticker} = ${f1(topRisk.weight)}% of capital, ${f1(topRisk.riskShare)}% of risk · ${FACTOR_META[domFactor.factor].short} factor = ${f1(domFactor.share)}% of variance`);

  // 5. Themes
  const sig = a.themes.filter(t => t.weight >= 15 && t.holdings.length >= 2 && t.key !== 'megacap-crowding');
  const topTheme = sig.sort((x, y) => (y.weight * (1 + y.sectors.length * 0.25)) - (x.weight * (1 + x.sectors.length * 0.25)))[0] ?? null;
  step('theme_scan', 'Scanned for hidden shared drivers', 'Sector labels can hide common economic drivers. I checked which themes link holdings across sectors.', topTheme ? `${topTheme.label}: ${f1(topTheme.weight)}% of the portfolio across ${topTheme.sectors.length} sector${topTheme.sectors.length > 1 ? 's' : ''}` : 'No theme links more than 15% of the portfolio');

  // 6. Stress tests: choose focus scenario
  const worst = a.scenarios[0];
  let focus = worst;
  if (topTheme?.key === 'ai-capex') focus = a.scenarios.find(s => s.key === 'ai') ?? worst;
  else if (topTheme?.key === 'taiwan-fab') focus = a.scenarios.find(s => s.key === 'taiwan') ?? worst;
  else if (a.exp.rates < -6) focus = a.scenarios.find(s => s.key === 'rates') ?? worst;
  const focusWhy = focus.key === worst.key ? 'it produces the largest modeled loss' : `it targets your largest hidden exposure (${focus.key === 'rates' ? 'interest-rate sensitivity' : lc(topTheme?.label ?? '')})`;
  step('stress_test', 'Ran 5 stress scenarios', `I ran all five scenarios and focused on “${focus.name}” because ${focusWhy}.`, `${focus.name}: ${pct(focus.result.pct)}${money(p, focus.result.pct) ? ` (${money(p, focus.result.pct)})` : ''} · worst overall: ${worst.name} ${pct(worst.result.pct)}`);

  // 7. Hedge check
  let hedge: HedgeCheck | null = null;
  if (a.defensive >= 10) {
    hedge = hedgeCheck(p);
    const fails = hedge.byScenario.filter(s => !s.offsets && s.restMove < -2);
    step('hedge_check', 'Tested your defensive sleeve', `${f1(a.defensive)}% sits in bonds, cash or gold. I checked whether it actually offsets losses in each scenario.`, `Offsets losses in ${hedge.byScenario.filter(s => s.offsets).length} of 5 scenarios${fails.length ? ` · fails in: ${fails.map(s => s.name).join(', ')}` : ''}`);
  } else {
    hedge = hedgeCheck(p);
    step('hedge_check', 'Looked for natural offsets', `Less than 10% is in defensive assets, so I checked whether any position gains in a downturn.`, hedge.anyGainer ? `${plural(hedge.gainers.length, 'position')} ${hedge.gainers.length === 1 ? 'gains' : 'gain'} in at least one scenario (${hedge.gainers.slice(0, 4).join(', ')})` : 'No position gains in any of the 5 scenarios');
  }

  // 8. What-if
  let whatIf: WhatIf | null = null;
  if (topRisk && (topRisk.riskShare >= 25 || topRisk.riskShare >= topRisk.weight * 1.4) && topRisk.weight >= 8) {
    const cap = Math.max(5, Math.round(topRisk.weight / 2));
    whatIf = runWhatIf(p, topRisk.ticker, cap);
    if (whatIf) step('what_if', `Tested capping ${topRisk.ticker}`, `${topRisk.ticker} drives an outsized share of risk, so I tested what halving it to ${cap}% would change (excess redistributed pro-rata).`, `Volatility ${f1(whatIf.volBefore)}% → ${f1(whatIf.volAfter)}% · ${whatIf.scenario} ${pct(whatIf.worstBefore)} → ${pct(whatIf.worstAfter)}`);
  } else {
    step('what_if', 'Rebalancing test', 'Skipped: no single position dominates risk enough to make a cap test informative.', '—', 'skipped');
  }

  // 9. Drawdown limit
  const breaches = p.drawdownLimit != null ? a.scenarios.filter(s => s.result.pct <= -p.drawdownLimit!) : [];
  if (p.drawdownLimit != null) step('drawdown_check', `Checked your ${f1(p.drawdownLimit)}% loss limit`, 'You told me your loss tolerance, so I checked every scenario against it.', breaches.length ? `${breaches.length} of 5 scenarios breach it: ${breaches.map(s => `${s.name} ${pct(s.result.pct)}`).join(', ')}` : 'All 5 scenarios stay within the limit');

  // ---------- Findings ----------
  const b = basisFor(p);
  const bNoWeights = basisFor(p, false);

  if (topRisk) {
    const ratio = topRisk.weight > 0 ? topRisk.riskShare / topRisk.weight : 1;
    if (ratio >= 1.2 && topRisk.riskShare >= 15) {
      findings.push({ id: 'risk-share', kind: 'risk', basis: b, surprise: clamp((ratio - 1) / 1.1) * 0.6 + clamp(topRisk.riskShare / 50) * 0.4,
        title: `${topRisk.ticker} is ${f1(topRisk.weight)}% of capital but ${f1(topRisk.riskShare)}% of risk`,
        detail: `${topRisk.name}'s higher volatility and its correlation with the rest of ${subject} mean it contributes ${f1(ratio)}× its weight to modeled volatility. Position sizes understate how much it drives outcomes.`,
        metric: { label: 'Risk share', value: `${f1(topRisk.riskShare)}%` }, followup: `What happens if I reduce ${topRisk.ticker}?` });
    }
  }
  if (domFactor.share >= 55) {
    findings.push({ id: 'factor', kind: 'factor', basis: b, surprise: clamp((domFactor.share - 50) / 35) * 0.7 + clamp((a.sectors.length - 1) / 6) * 0.3,
      title: `One factor drives ${f1(domFactor.share)}% of your risk`,
      detail: `Despite ${a.conc.count} positions across ${a.sectors.length} sector${a.sectors.length > 1 ? 's' : ''}, ${f1(domFactor.share)}% of modeled variance traces to ${FACTOR_META[domFactor.factor].label.toLowerCase()}. Stock-specific risk is only ${f1(Math.max(a.risk.idioShare, 0))}%.`,
      metric: { label: FACTOR_META[domFactor.factor].short, value: `${f1(domFactor.share)}%` }, followup: 'Which holdings share the same risk drivers?' });
  }
  if (a.conc.count >= 5 && a.risk.effectiveBets <= a.conc.count * 0.55) {
    findings.push({ id: 'bets', kind: 'concentration', basis: b, surprise: clamp(1 - a.risk.effectiveBets / a.conc.count) * 0.7,
      title: `${a.conc.count} positions, but only ${f1(a.risk.effectiveBets)} effective bets`,
      detail: `Weighted by risk contribution, ${subject} behaves like ${f1(a.risk.effectiveBets)} independent positions. Adding names that share drivers hasn't diversified it.`,
      metric: { label: 'Effective bets', value: f1(a.risk.effectiveBets) }, followup: 'Where am I actually concentrated?' });
  }
  if (overlapRow && overlapRow.viaFunds >= 1.5) {
    const ratio = overlapRow.direct > 0 ? overlapRow.total / overlapRow.direct : Infinity;
    const srcs = Array.from(new Set(overlapRow.sources.map(s => s.fund))).join(' and ');
    findings.push({ id: 'overlap', kind: 'overlap', basis: bNoWeights, surprise: overlapRow.direct > 0 ? clamp((ratio - 1) / 0.8) * 0.65 + clamp(overlapRow.total / 25) * 0.35 : clamp(overlapRow.total / 10) * 0.6,
      title: overlapRow.direct > 0 ? `Your real ${overlapRow.ticker} exposure is ${f1(overlapRow.total)}%, not ${f1(overlapRow.direct)}%` : `You own ${f1(overlapRow.total)}% ${overlapRow.ticker} without holding it directly`,
      detail: `${srcs} add ${f1(overlapRow.viaFunds)}% of ${overlapRow.name} on top of ${overlapRow.direct > 0 ? 'your direct position' : 'nothing held directly'}. Based on approximate static fund compositions.`,
      metric: { label: 'Look-through', value: `${f1(overlapRow.total)}%` }, followup: `Show me my true exposure to ${overlapRow.ticker}` });
  }
  if (topTheme && topTheme.weight >= 20 && (topTheme.sectors.length >= 2 || a.lt.hasFunds)) {
    const isFund = (t: string) => !!lookupFund(t);
    const direct = topTheme.holdings.filter(h => !isFund(h.ticker)).map(h => h.ticker);
    const viaFunds = topTheme.holdings.filter(h => isFund(h.ticker)).map(h => h.ticker);
    const who = [direct.length ? `${direct.slice(0, 5).join(', ')}${direct.length > 5 ? ` and ${direct.length - 5} more` : ''}` : '', viaFunds.length ? `${direct.length ? 'plus ' : ''}the linked companies inside ${viaFunds.join(' and ')}` : ''].filter(Boolean).join(', ');
    const secs = topTheme.sectors.length > 4 ? `${topTheme.sectors.slice(0, 4).join(', ')} and ${topTheme.sectors.length - 4} more` : topTheme.sectors.join(', ');
    findings.push({ id: 'theme', kind: 'theme', basis: b, surprise: clamp(topTheme.weight / 70) * 0.6 + clamp((topTheme.sectors.length - 1) / 4) * 0.4,
      title: `${f1(topTheme.weight)}% of ${isProxy ? 'the portfolio' : 'your portfolio'} depends on ${topTheme.driver}`,
      detail: `${who} span ${plural(topTheme.sectors.length, 'sector')} (${secs}) but share one economic driver. A shock to ${topTheme.driver} would hit them together, regardless of sector labels.`,
      metric: { label: 'Theme weight', value: `${f1(topTheme.weight)}%` }, followup: topTheme.key === 'ai-capex' ? 'Simulate an AI valuation reset' : topTheme.key === 'taiwan-fab' ? 'Simulate a Taiwan supply disruption' : `Investigate my ${lc(THEMES[topTheme.key].label)} exposure` });
  }
  {
    const drivers = focus.result.holdings.slice(0, 3).map(h => `${h.ticker} ${pct(h.impact)}`).join(', ');
    const dollars = money(p, focus.result.pct);
    findings.push({ id: 'stress', kind: 'stress', basis: bNoWeights === 'portfolio' ? b : bNoWeights, surprise: clamp(Math.abs(focus.result.pct) / 45) * 0.55,
      title: `${focus.name}: ${pct(focus.result.pct)}${dollars ? ` (${dollars})` : ''}`,
      detail: `${focus.description} Biggest modeled drags: ${drivers}. ${focus.key !== worst.key ? `The worst scenario overall is ${worst.name} at ${pct(worst.result.pct)}.` : ''}`.trim(),
      metric: { label: 'Modeled move', value: pct(focus.result.pct) }, followup: `Which positions drive the ${focus.name.toLowerCase()} loss?` });
  }
  if (hedge && a.defensive >= 10) {
    const rates = hedge.byScenario.find(s => s.key === 'rates')!;
    const fails = hedge.byScenario.filter(s => !s.offsets && s.restMove < -2);
    if (fails.length) {
      findings.push({ id: 'hedge', kind: 'hedge', basis: b, surprise: 0.45 + clamp(fails.length / 3) * 0.35,
        title: rates && !rates.offsets && a.bonds >= 10 ? 'Your bonds fall with your stocks in a rates shock' : `Your defensive sleeve fails in ${fails.length} of 5 scenarios`,
        detail: `In ${fails.map(s => `“${s.name}” (defensive ${pct(s.sleeveMove)}, rest ${pct(s.restMove)})`).join(', ')}, the ${f1(a.defensive)}% defensive allocation doesn't offset equity losses. It protects best in a recession.`,
        metric: { label: 'Offsets', value: `${5 - fails.length}/5` }, followup: 'How could I hedge a rates shock?' });
    }
  } else if (hedge && !hedge.anyGainer) {
    findings.push({ id: 'hedge', kind: 'hedge', basis: b, surprise: 0.55,
      title: 'Nothing in this portfolio gains in any stress scenario',
      detail: `Across all 5 scenarios, every position is modeled to fall at the same time. There is no internal offset when markets turn.`,
      metric: { label: 'Natural hedges', value: '0' }, followup: 'What would hedge this portfolio?' });
  }
  if (whatIf) {
    findings.push({ id: 'whatif', kind: 'whatif', basis: b, surprise: clamp((whatIf.volBefore - whatIf.volAfter) / whatIf.volBefore / 0.25) * 0.45,
      title: `Halving ${whatIf.ticker} cuts modeled volatility ${f1(whatIf.volBefore)}% → ${f1(whatIf.volAfter)}%`,
      detail: `Capping ${whatIf.ticker} at ${whatIf.to}% (from ${f1(whatIf.from)}%) and spreading the rest pro-rata moves the ${whatIf.scenario} loss from ${pct(whatIf.worstBefore)} to ${pct(whatIf.worstAfter)}. Analysis only, not a recommendation.`,
      metric: { label: 'Vol reduction', value: `−${f1(whatIf.volBefore - whatIf.volAfter)} pts` }, followup: `What if I cap ${whatIf.ticker} at 10%?` });
  }
  if (p.drawdownLimit != null) {
    findings.push({ id: 'drawdown', kind: 'drawdown', basis: b, surprise: breaches.length ? 0.6 + clamp(breaches.length / 5) * 0.3 : 0.25,
      title: breaches.length ? `${breaches.length} of 5 scenarios breach your ${f1(p.drawdownLimit)}% loss limit` : `All 5 scenarios stay within your ${f1(p.drawdownLimit)}% loss limit`,
      detail: breaches.length ? `${breaches.map(s => `${s.name} (${pct(s.result.pct)})`).join(', ')} exceed the limit. Modeled 1-in-20 annual loss is about ${f1(a.tail)}%.` : `The worst scenario is ${worst.name} at ${pct(worst.result.pct)}. Modeled 1-in-20 annual loss is about ${f1(a.tail)}%.`,
      metric: { label: 'Breaches', value: `${breaches.length}/5` }, followup: 'What would it take to stay within my loss limit?' });
  }
  // Mega-cap crowding is worth mentioning when it is extreme.
  const crowd = a.themes.find(t => t.key === 'megacap-crowding');
  if (crowd && crowd.weight >= 45 && !findings.some(f => f.id === 'theme')) {
    findings.push({ id: 'crowding', kind: 'theme', basis: b, surprise: 0.35,
      title: `${f1(crowd.weight)}% sits in the most crowded mega-cap trade`,
      detail: `${crowd.holdings.slice(0, 5).map(h => h.ticker).join(', ')} are the same names that dominate most index funds, so your returns depend heavily on ${crowd.driver}.`,
      metric: { label: 'Mega-cap', value: `${f1(crowd.weight)}%` }, followup: 'What would break this strategy?' });
  }

  findings.sort((x, y) => y.surprise - x.surprise);
  const headline = findings[0] ?? null;
  const unlocks = buildUnlocks(p, spec, a, topTheme, topRisk);
  step('assess_gaps', 'Identified what would sharpen this', 'Each piece of extra information should change a specific conclusion, so I only ask for what moves the analysis.', unlocks.length ? unlocks.map(u => u.title).join(' · ') : 'Nothing essential missing');

  const delta = prev ? diff(prev, p) : [];
  return { trace, findings, headline, narrative: narrate(p, a, findings, unlocks, delta), unlocks, delta, whatIf, hedge, focusScenario: focus.key };
}

function buildUnlocks(p: Portfolio, spec: PortfolioSpec, a: Analysis, topTheme: ReturnType<typeof themeExposure>[number] | null, topRisk: ReturnType<typeof riskModel>['contributions'][number] | undefined): Unlock[] {
  const out: Unlock[] = [];
  const worst = a.scenarios[0];
  if (p.source === 'proxy') {
    const hook = topTheme
      ? `A typical portfolio like the one you described carries about ${f1(topTheme.weight)}% exposure to ${topTheme.driver}. With your actual holdings I can measure your real exposure and name the positions behind it.`
      : `Every holding-level result above comes from a proxy. With your actual positions I can replace each one with a figure about your portfolio.`;
    out.push({ id: 'holdings', input: 'holdings', title: 'Share your actual holdings', why: hook, unlocks: 'Portfolio-specific concentration, overlap and risk contribution', priority: 100 });
  }
  if (p.assumptions.some(x => x.id === 'equal-weights') && topRisk) {
    // Quantify sensitivity: what if the top risk holding were twice the average weight?
    const doubled = { ...p, holdings: p.holdings.map(h => (h.ticker === topRisk.ticker ? { ...h, weight: h.weight * 2 } : h)) };
    const tot = doubled.holdings.reduce((s, h) => s + h.weight, 0);
    doubled.holdings = doubled.holdings.map(h => ({ ...h, weight: (h.weight / tot) * 100 }));
    const rs = riskModel(doubled).contributions.find(c => c.ticker === topRisk.ticker)?.riskShare ?? topRisk.riskShare;
    out.push({ id: 'weights', input: 'weights', title: 'Add position weights', why: `I assumed equal weights. If ${topRisk.ticker} were actually twice the average position, its share of risk would rise from ${f1(topRisk.riskShare)}% to ${f1(rs)}%. Real weights settle that.`, unlocks: 'Accurate concentration and risk shares', priority: 95 });
  }
  if (p.assumptions.some(x => x.id === 'scaled-up' && x.severity === 'high')) {
    out.push({ id: 'rest', input: 'holdings', title: 'Add the rest of the portfolio', why: 'The weights you gave cover less than 80% of the portfolio, and I scaled them up, which likely overstates concentration.', unlocks: 'Concentration figures that reflect the whole portfolio', priority: 85 });
  }
  const unclassified = p.holdings.filter(h => h.classification === 'unclassified');
  if (unclassified.length) {
    out.push({ id: 'sectors', input: 'sectors', title: `Tell me what ${unclassified.map(h => h.ticker).slice(0, 3).join(', ')} ${unclassified.length > 1 ? 'are' : 'is'}`, why: `I modeled ${unclassified.length > 1 ? 'them' : 'it'} as generic equity (${f1(unclassified.reduce((s, h) => s + h.weight, 0))}% of the portfolio). A sector determines which themes and shocks apply.`, unlocks: 'Correct factor and theme exposures for those positions', priority: 75 });
  }
  if (p.value == null) {
    out.push({ id: 'aum', input: 'aum', title: 'Tell me the portfolio size', why: `“${worst.name}” is modeled at ${pct(worst.result.pct)}. With the portfolio’s size I can express every scenario as a dollar loss.`, unlocks: 'Dollar impacts across all scenarios', priority: 60 });
  }
  if (p.drawdownLimit == null) {
    out.push({ id: 'drawdown', input: 'drawdown', title: 'Set a loss limit', why: `Your worst modeled scenario is ${pct(worst.result.pct)}. Tell me the largest loss you could tolerate and I’ll test every scenario against it.`, unlocks: 'Pass/fail checks against your own tolerance', priority: 50 });
  }
  void spec;
  return out.sort((x, y) => y.priority - x.priority).slice(0, 3);
}

function diff(prev: Portfolio, next: Portfolio) {
  const a = analyze(prev), b = analyze(next);
  const rows: { label: string; before: string; after: string }[] = [];
  const add = (label: string, x: string, y: string) => { if (x !== y) rows.push({ label, before: x, after: y }); };
  const srcLabel = (p: Portfolio) => (p.source === 'proxy' ? 'Illustrative proxy' : p.source === 'example' ? 'Example' : p.assumptions.some(x => x.severity === 'high') ? 'Yours (with assumptions)' : 'Your holdings');
  add('Basis', srcLabel(prev), srcLabel(next));
  add('Positions', String(a.conc.count), String(b.conc.count));
  add('Modeled volatility', `${f1(a.risk.vol)}%`, `${f1(b.risk.vol)}%`);
  add('Top risk contributor', `${a.risk.contributions[0]?.ticker} ${f1(a.risk.contributions[0]?.riskShare ?? 0)}%`, `${b.risk.contributions[0]?.ticker} ${f1(b.risk.contributions[0]?.riskShare ?? 0)}%`);
  add('Worst scenario', `${pct(a.scenarios[0].result.pct)}`, `${pct(b.scenarios[0].result.pct)}`);
  const ta = a.themes[0], tb = b.themes.find(t => t.key === ta?.key);
  if (ta) add(ta.label, `${f1(ta.weight)}%`, `${f1(tb?.weight ?? 0)}%`);
  if (prev.value !== next.value) add('Portfolio size', prev.value ? formatMoney(prev.value) : 'Unknown', next.value ? formatMoney(next.value) : 'Unknown');
  if (prev.drawdownLimit !== next.drawdownLimit) add('Loss limit', prev.drawdownLimit ? `${prev.drawdownLimit}%` : 'Not set', next.drawdownLimit ? `${next.drawdownLimit}%` : 'Not set');
  return rows.slice(0, 6);
}

function narrate(p: Portfolio, a: Analysis, findings: Finding[], unlocks: Unlock[], delta: { label: string }[]): string {
  const lead = findings[0];
  const second = findings[1];
  const parts: string[] = [];
  if (delta.length) parts.push('I re-ran the full investigation with your new information.');
  if (p.source === 'proxy') parts.push(`You haven’t shared holdings yet, so I built a representative proxy and investigated it. Treat holding-level specifics as illustrative.`);
  else if (p.source === 'example') parts.push(`This is a built-in example portfolio, not your own.`);
  else parts.push(`I analyzed your ${a.conc.count} position${a.conc.count === 1 ? '' : 's'}${p.assumptions.length ? ', noting the assumptions I had to make' : ''}.`);
  if (lead) parts.push(`The most important finding: ${lowerFirst(lead.title)}.`);
  if (second) parts.push(`I also found that ${lowerFirst(second.title)}.`);
  if (unlocks[0]) parts.push(`Next step: ${lowerFirst(unlocks[0].title)}. ${unlocks[0].why}`);
  return parts.join(' ');
}

const lowerFirst = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

// ---------------- Follow-up questions (deterministic router) ----------------

export type Answer = { lead: string; findings: string[]; trace: TraceStep[]; followups: string[]; focus?: { view: 'scenarios' | 'exposures' | 'overview'; scenario?: string } };

export function answerQuestion(p: Portfolio, question: string): Answer {
  const q = question.toLowerCase();
  const a = analyze(p);
  const trace: TraceStep[] = [];
  const step = (tool: string, title: string, reason: string, result: string) => trace.push({ id: `${tool}-${trace.length}`, tool, title, reason, result, status: 'done', by: 'planner' });
  const caveat = p.source === 'proxy' ? ' (illustrative proxy)' : '';
  const mentioned = p.holdings.map(h => h.ticker).filter(t => new RegExp(`\\b${t.replace('.', '\\.')}\\b`, 'i').test(question));
  const fundMentioned = mentioned.length ? null : a.lt.rows.find(r => new RegExp(`\\b${r.ticker}\\b`, 'i').test(question));

  // What-if cap / reduce
  const capMatch = q.match(/(?:cap|reduce|trim|cut|halve)\s+(?:my\s+)?([a-z.]{1,6})?(?:\s+(?:to|at)\s+(\d+(?:\.\d+)?)\s*%)?/i);
  if (/what if|\bcap\b|reduce|trim|\bcut\b|halve/.test(q) && (mentioned.length || capMatch)) {
    const target = mentioned[0] ?? a.risk.contributions[0].ticker;
    const h = p.holdings.find(x => x.ticker === target)!;
    const capVal = capMatch?.[2] ? parseFloat(capMatch[2]) : Math.max(2, Math.round(h.weight / 2));
    const w = runWhatIf(p, target, capVal);
    step('what_if', `Tested capping ${target} at ${capVal}%`, `You asked about reducing ${target}; I recomputed risk and scenarios with the excess redistributed pro-rata.`, w ? `Vol ${f1(w.volBefore)}% → ${f1(w.volAfter)}%` : `${target} is already at or below ${capVal}%`);
    if (!w) return { lead: `${target} is already ${f1(h.weight)}% of the portfolio, at or below ${capVal}%, so a cap there wouldn't change anything.`, findings: [], trace, followups: ['Where am I actually concentrated?', 'What would break this strategy?'] };
    const before = a.risk.contributions.find(c => c.ticker === target)!;
    const after = riskModel(capHolding(p, target, capVal)).contributions.find(c => c.ticker === target)!;
    return {
      lead: `Capping ${target} at ${capVal}% lowers modeled volatility from ${f1(w.volBefore)}% to ${f1(w.volAfter)}%${caveat}. This is an analysis of the trade-off, not a recommendation.`,
      findings: [
        `${target}'s risk share drops from ${f1(before.riskShare)}% to ${f1(after.riskShare)}%.`,
        `${w.scenario} moves from ${pct(w.worstBefore)} to ${pct(w.worstAfter)}${p.value ? ` (${money(p, w.worstBefore)} → ${money(p, w.worstAfter)})` : ''}.`,
        `The ${f1(w.from - w.to)} points of freed weight were spread across the other positions in proportion to their current weights.`,
      ], trace, followups: [`What if I cap ${target} at 5%?`, 'Which holdings share the same risk drivers?', 'Simulate a global recession'],
    };
  }

  // Holding detail
  if (mentioned.length || fundMentioned) {
    const t = mentioned[0] ?? fundMentioned!.ticker;
    const h = p.holdings.find(x => x.ticker === t);
    const ltRow = a.lt.rows.find(r => r.ticker === t);
    const rc = a.risk.contributions.find(c => c.ticker === t);
    const sc = SCENARIOS.map(s => ({ s, v: h ? holdingShock(h, s.shock, s.themeShocks) : null }));
    const sec = lookupSecurity(t), fund = lookupFund(t);
    step('holding_detail', `Profiled ${t}`, `You asked about ${t}; I pulled its weight, look-through exposure, risk contribution and scenario sensitivity.`, `${h ? `${f1(h.weight)}% direct` : 'not held directly'}${ltRow ? ` · ${f1(ltRow.total)}% look-through` : ''}${rc ? ` · ${f1(rc.riskShare)}% of risk` : ''}`);
    const out: string[] = [];
    if (ltRow && ltRow.viaFunds > 0) out.push(`True exposure: ${f1(ltRow.total)}% (${f1(ltRow.direct)}% direct + ${ltRow.sources.map(s => `${f1(s.weight)}% via ${s.fund}`).join(' + ')}).`);
    if (rc) out.push(`It contributes ${f1(rc.riskShare)}% of modeled portfolio risk on ${f1(rc.weight)}% of capital.`);
    if (h) out.push(`Modeled standalone moves: ${sc.map(x => `${x.s.name} ${pct(x.v!)}`).join(' · ')}.`);
    if (h?.themes.length) out.push(`Linked themes: ${h.themes.map(th => THEMES[th]?.label).filter(Boolean).join(', ')}.`);
    if (h && h.classification !== 'reference') out.push(`${t} isn't in my reference set; it's modeled with ${h.classification === 'sector-proxy' ? `a ${h.sector} archetype` : 'a generic equity proxy'}.`);
    return { lead: `${sec?.name ?? fund?.name ?? h?.name ?? t}: here is how it fits into ${p.source === 'proxy' ? 'the proxy portfolio' : 'your portfolio'}.`, findings: out, trace, followups: [`What if I cap ${t} at 10%?`, 'Which holdings share the same risk drivers?', 'What would break this strategy?'] };
  }

  // Market comparison
  if (/peer|benchmark|compare|versus|vs\.?|s&p|market|index/.test(q)) {
    const mkt = buildPortfolio({ description: '', aum: null, aumSource: null, holdings: [{ ticker: 'SPY', weight: 100 }], styles: [], styleMix: {}, drawdownLimit: null, exampleId: null, holdingCountHint: null, sleeves: [] })!;
    const m = analyze(mkt);
    step('compare_market', 'Compared against an S&P 500 proxy', 'No licensed peer or benchmark data is connected, so I compared against an S&P 500 proxy built from the same model.', `Vol ${f1(a.risk.vol)}% vs ${f1(m.risk.vol)}%`);
    const worstMine = a.scenarios[0], worstMkt = m.scenarios.find(s => s.key === worstMine.key)!;
    return {
      lead: `Against an S&P 500 proxy (same model, no peer data), ${p.source === 'proxy' ? 'this proxy' : 'your portfolio'} runs ${a.risk.vol > m.risk.vol ? 'hotter' : 'cooler'}: ${f1(a.risk.vol)}% vs ${f1(m.risk.vol)}% modeled volatility.`,
      findings: [
        `Growth-factor beta ${a.exp.growth.toFixed(2)} vs ${m.exp.growth.toFixed(2)}; rate sensitivity ${a.exp.rates.toFixed(1)} vs ${m.exp.rates.toFixed(1)} (% per +100bp).`,
        `${worstMine.name}: ${pct(worstMine.result.pct)} vs ${pct(worstMkt.result.pct)} for the S&P 500 proxy.`,
        `Largest three companies (look-through): ${f1(top3LT(a))}% vs ${f1(top3LT(m))}% for the index proxy.`,
        'A licensed peer dataset would add percentile ranks, tracking error and attribution; I won\'t invent those.',
      ], trace, followups: ['Where am I actually concentrated?', 'What would break this strategy?', 'Simulate rates higher for longer'],
    };
  }

  // Hedge
  if (/hedge|protect|defensive|offset|insurance|safe/.test(q)) {
    const hc = hedgeCheck(p);
    const target = /rate|yield|inflation/.test(q) ? scenarioByKey('rates') : /oil|energy/.test(q) ? scenarioByKey('energy') : /taiwan|chip/.test(q) ? scenarioByKey('taiwan') : /ai|valuation/.test(q) ? scenarioByKey('ai') : /recession|crash/.test(q) ? scenarioByKey('recession') : SCENARIOS.find(s => s.key === a.scenarios[0].key)!;
    const now = impact(p, target.shock, target.themeShocks).pct;
    const candidates = [['TLT', 'long Treasuries'], ['SHY', 'short-term Treasuries'], ['GLD', 'gold'], ['XLE', 'energy stocks'], ['CASH', 'cash']] as const;
    const tests = candidates.map(([t, label]) => {
      const h = hypotheticalSleeve(p, t, 15);
      return { t, label, target: h.scenarios.find(s => s.key === target.key)!.pct, worst: Math.min(...h.scenarios.map(s => s.pct)), vol: h.vol };
    }).sort((x, y) => y.target - x.target);
    step('hedge_check', 'Checked existing offsets', 'First I checked whether anything you already hold moves against the rest of the portfolio.', hc.sleeve ? `${hc.byScenario.filter(s => s.offsets).length} of 5 scenarios have a working offset` : 'No defensive sleeve held');
    step('hedge_explorer', `Tested 5 hypothetical 15% sleeves against “${target.name}”`, 'To see what would actually offset this scenario, I added each candidate sleeve (scaling everything else down) and re-ran the model.', `Best: ${tests[0].label} (${pct(now)} → ${pct(tests[0].target)})`);
    const existing = hc.sleeve ? hc.byScenario.find(s => s.key === target.key)! : null;
    return {
      lead: `Under “${target.name}” ${p.source === 'proxy' ? 'the proxy' : 'your portfolio'} is modeled at ${pct(now)}${caveat}. Of five hypothetical 15% sleeves, ${tests[0].label} would offset it best (${pct(tests[0].target)}). This is analysis, not advice.`,
      findings: [
        existing ? `Today your ${f1(hc.sleeve)}% defensive sleeve moves ${pct(existing.sleeveMove)} in this scenario while the rest moves ${pct(existing.restMove)}${existing.offsets ? ', so it does offset' : ', so it does not offset'}.` : 'You hold no bonds, cash or gold today, so nothing offsets losses internally.',
        ...tests.map(x => `+15% ${x.label}: ${target.name} ${pct(x.target)}, worst scenario ${pct(x.worst)}, modeled volatility ${f1(x.vol)}%.`),
        `Trade-off: long Treasuries help in growth shocks but hurt when yields rise. Cash dampens every scenario only by diluting exposure.`,
      ], trace, followups: ['Simulate rates higher for longer', 'Simulate a global recession', 'What would break this strategy?'], focus: { view: 'scenarios', scenario: target.key },
    };
  }

  // Specific scenario
  const sk = /taiwan|chip supply|tsmc/.test(q) ? 'taiwan' : /recession|downturn|crash|bear/.test(q) ? 'recession' : /rate|yield|inflation|fed/.test(q) ? 'rates' : /oil|energy shock|energy supply/.test(q) ? 'energy' : /ai |ai$|a\.i\.|valuation|bubble/.test(q) ? 'ai' : null;
  if (sk || /stress|scenario|break|shock|downside|worst|lose|drawdown|fall|drop/.test(q)) {
    const s = sk ? scenarioByKey(sk) : a.scenarios[0];
    const r = sk ? impact(p, s.shock, s.themeShocks) : a.scenarios[0].result;
    step('stress_test', `Ran “${s.name}”`, sk ? `You asked about this scenario directly.` : `You asked what could break the portfolio; I ran all 5 scenarios and report the worst.`, `${pct(r.pct)}${money(p, r.pct) ? ` (${money(p, r.pct)})` : ''}`);
    const biggest = r.contributions.slice().sort((x, y) => x.value - y.value)[0];
    return {
      lead: `“${s.name}” produces a modeled ${pct(r.pct)} move${money(p, r.pct) ? ` (${money(p, r.pct)})` : ''}${caveat}. ${s.description}`,
      findings: [
        `Largest driver: ${biggest.label} (${pct(biggest.value)} contribution).`,
        `Worst-hit positions: ${r.holdings.slice(0, 3).map(h => `${h.ticker} ${pct(h.impact)}`).join(', ')}.`,
        r.holdings.some(h => h.impact > 0) ? `Positions that gain: ${r.holdings.filter(h => h.impact > 0).map(h => h.ticker).join(', ')}.` : 'No position gains in this scenario.',
        p.drawdownLimit != null ? (r.pct <= -p.drawdownLimit ? `This breaches your ${p.drawdownLimit}% loss limit.` : `This stays within your ${p.drawdownLimit}% loss limit.`) : `Shock: growth ${pct(s.shock.growth)}, yields ${s.shock.rates >= 0 ? '+' : '−'}${Math.abs(s.shock.rates * 100)}bp, spreads ${s.shock.credit >= 0 ? '+' : '−'}${Math.abs(s.shock.credit * 100)}bp, oil ${pct(s.shock.oil)}.`,
      ], trace, followups: ['How could I hedge this?', `Which holdings share the same risk drivers?`, 'Compare against the S&P 500'], focus: { view: 'scenarios', scenario: s.key },
    };
  }

  // Factors / drivers / correlation
  if (/factor|driver|correlat|hidden|share|common|overlap|concentrat|diversif|exposure|where/.test(q)) {
    const cm = correlationMatrix(p, 8);
    const pairs: { a: string; b: string; c: number }[] = [];
    cm.tickers.forEach((x, i) => cm.tickers.forEach((y, j) => { if (j > i) pairs.push({ a: x, b: y, c: cm.matrix[i][j] }); }));
    pairs.sort((x, y) => y.c - x.c);
    step('risk_decomposition', 'Decomposed risk and correlations', 'Shared drivers show up as factor concentration and high pairwise correlation.', `Top pair ${pairs[0] ? `${pairs[0].a}/${pairs[0].b} ρ=${pairs[0].c.toFixed(2)}` : 'n/a'}`);
    const theme = a.themes.filter(t => t.key !== 'megacap-crowding')[0];
    return {
      lead: `${f1(a.risk.factorShares.slice().sort((x, y) => y.share - x.share)[0].share)}% of modeled risk comes from a single factor, and ${p.source === 'proxy' ? 'the proxy' : 'your portfolio'} behaves like ${f1(a.risk.effectiveBets)} independent bets${caveat}.`,
      findings: [
        `Factor shares of variance: ${a.risk.factorShares.map(fs => `${FACTOR_META[fs.factor].short} ${f1(fs.share)}%`).join(', ')}, stock-specific ${f1(Math.max(0, a.risk.idioShare))}%.`,
        pairs.length ? `Most correlated pairs (modeled): ${pairs.slice(0, 3).map(x => `${x.a}/${x.b} ${x.c.toFixed(2)}`).join(', ')}.` : 'Only one position, so no pairwise correlations.',
        theme ? `Shared theme: ${theme.label} links ${f1(theme.weight)}% (${theme.holdings.slice(0, 4).map(h => h.ticker).join(', ')}).` : 'No dominant cross-sector theme.',
        `Top 3 positions are ${f1(a.conc.top3)}% of capital; effective breadth by weight is ${f1(a.conc.effective)}.`,
      ], trace, followups: ['What would break this strategy?', `What if I reduce ${a.risk.contributions[0].ticker}?`, 'Compare against the S&P 500'], focus: { view: 'exposures' },
    };
  }

  // Default: summarize top findings again
  const inv = investigate(p, { description: '', aum: p.value, aumSource: null, holdings: [], styles: [], styleMix: {}, drawdownLimit: p.drawdownLimit, exampleId: null, holdingCountHint: null, sleeves: [] });
  return {
    lead: 'Here are the most important things I see right now.',
    findings: inv.findings.slice(0, 4).map(fd => `${fd.title}. ${fd.detail}`),
    trace: inv.trace.filter(t => t.status === 'done').slice(1, 5),
    followups: inv.findings.slice(0, 3).map(fd => fd.followup),
  };
}

function top3LT(a: Analysis) {
  return a.lt.rows.slice(0, 3).reduce((s, r) => s + r.total, 0);
}

/** Hypothetically add a sleeve (scaling everything else down) and measure scenario changes. */
export function hypotheticalSleeve(p: Portfolio, ticker: string, weight: number) {
  const base = p.holdings.filter(h => h.ticker !== ticker);
  const existing = p.holdings.find(h => h.ticker === ticker)?.weight ?? 0;
  const scale = (100 - weight) / (100 - existing || 100);
  const add = buildPortfolio({ description: '', aum: null, aumSource: null, holdings: [{ ticker, weight: 100 }], styles: [], styleMix: {}, drawdownLimit: null, exampleId: null, holdingCountHint: null, sleeves: [] })!.holdings[0];
  const q: Portfolio = { ...p, holdings: [...base.map(h => ({ ...h, weight: h.weight * scale })), { ...add, weight }] };
  return { portfolio: q, vol: riskModel(q).vol, scenarios: SCENARIOS.map(s => ({ key: s.key, name: s.name, pct: impact(q, s.shock, s.themeShocks).pct })) };
}

/** Compact evidence object handed to the language model (all numbers pre-computed). */
export function evidenceSummary(p: Portfolio, inv: Investigation) {
  const a = analyze(p);
  return {
    portfolio: { name: p.name, source: p.source, aum: p.value, positions: a.conc.count, holdings: p.holdings.slice(0, 25).map(h => ({ t: h.ticker, w: h.weight, sector: h.sector, cls: h.classification })) },
    assumptions: p.assumptions.map(x => x.text),
    metrics: { top3: a.conc.top3, effectivePositions: Math.round(a.conc.effective * 10) / 10, modeledVol: a.risk.vol, effectiveBets: a.risk.effectiveBets, tail1in20: a.tail },
    riskContributions: a.risk.contributions.slice(0, 6),
    factorShares: a.risk.factorShares,
    themes: a.themes.slice(0, 4).map(t => ({ label: t.label, weight: t.weight, sectors: t.sectors.length, holdings: t.holdings.slice(0, 5).map(h => h.ticker) })),
    lookThrough: a.lt.rows.slice(0, 5).map(r => ({ t: r.ticker, direct: r.direct, viaFunds: r.viaFunds, total: r.total })),
    scenarios: a.scenarios.map(s => ({ key: s.key, name: s.name, pct: s.result.pct, dollars: s.result.dollars })),
    findings: inv.findings.map(fd => ({ id: fd.id, title: fd.title, detail: fd.detail, basis: fd.basis })),
    unlocks: inv.unlocks.map(u => ({ title: u.title, why: u.why })),
  };
}
