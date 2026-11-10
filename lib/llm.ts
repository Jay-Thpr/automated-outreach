/**
 * Optional AI layer (server-only). Activated when OPENAI_API_KEY is set.
 *
 * The model has three jobs, none of which involve producing numbers:
 *   1. Extract structured portfolio information from free-form language.
 *   2. Decide which extra deterministic tools to run, and explain why.
 *   3. Write the narrative, which is rejected if it contains figures not present in tool output.
 */
import type { Finding, Portfolio, PortfolioSpec, SpecUpdate, StyleKey, TraceStep } from './types';
import { analyze, answerQuestion, evidenceSummary, hypotheticalSleeve, runWhatIf, type Answer, type Investigation } from './agent';
import { correlationMatrix, impact, scenarioByKey, SCENARIOS, themeExposure } from './risk';
import { describeUpdate, emptyUpdate, formatMoney } from './parse';
import { archetypeFromHint, isKnownTicker, normalizeTicker, STYLE_TEMPLATES } from './universe';

const STYLE_KEYS = Object.keys(STYLE_TEMPLATES) as StyleKey[];

export function aiEnabled() {
  return !!process.env.OPENAI_API_KEY;
}

type Msg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

async function chat(body: Record<string, unknown>, timeoutMs = 20000): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', temperature: 0.2, ...body }),
    });
    if (!res.ok) throw new Error(`Model request failed (${res.status})`);
    const json = await res.json();
    const msg = json?.choices?.[0]?.message;
    if (!msg) throw new Error('Empty model response');
    return msg;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- extraction

const nullable = (t: string) => ({ type: [t, 'null'] });

const EXTRACT_SCHEMA = {
  name: 'portfolio_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'holdings_mode', 'holdings', 'remove', 'aum_usd', 'styles', 'sleeve_mix', 'unspecified_sleeves', 'drawdown_limit_percent', 'question_text', 'clarifying_question'],
    properties: {
      intent: { type: 'string', enum: ['portfolio_info', 'question', 'both', 'unclear'] },
      holdings_mode: { type: 'string', enum: ['replace', 'merge', 'none'] },
      holdings: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['ticker', 'weight_percent', 'value_usd', 'name', 'sector'],
          properties: { ticker: { type: 'string' }, weight_percent: nullable('number'), value_usd: nullable('number'), name: nullable('string'), sector: nullable('string') },
        },
      },
      remove: { type: 'array', items: { type: 'string' } },
      aum_usd: nullable('number'),
      styles: { type: 'array', items: { type: 'string', enum: STYLE_KEYS } },
      sleeve_mix: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['style', 'percent'], properties: { style: { type: 'string', enum: STYLE_KEYS }, percent: { type: 'number' } } } },
      unspecified_sleeves: { type: 'array', items: { type: 'string', enum: STYLE_KEYS } },
      drawdown_limit_percent: nullable('number'),
      question_text: nullable('string'),
      clarifying_question: nullable('string'),
    },
  },
};

const EXTRACT_PROMPT = `You extract portfolio information for Atlas, a portfolio analytics tool. Return JSON only.
Rules:
- holdings: only positions the user explicitly names. Map company names to US tickers (e.g. "Nvidia" -> NVDA, "Google" -> GOOGL). Never invent positions.
- weight_percent: the stated percent of the portfolio, else null. value_usd: a stated dollar amount, else null. Do not compute missing values.
- sector: for tickers you are confident about but that are unusual, give a short sector (e.g. "semiconductors", "regional bank"); otherwise null.
- holdings_mode: "replace" if the user gives a portfolio list; "merge" if they add or change a few positions in an existing portfolio; "none" if no positions are named.
- styles: the investment styles described (tech, semis, growth, broad, dividend, value, balanced, bonds, credit, energy, transition, healthcare, financials, international, emerging, realestate, crypto, gold, cash). Order by emphasis.
- sleeve_mix: explicit allocations to asset classes or styles without named positions (e.g. "60% stocks 40% bonds" -> broad 60, bonds 40).
- unspecified_sleeves: sleeves mentioned without a size alongside named holdings (e.g. "plus some bonds" -> bonds).
- aum_usd: total portfolio size if stated. drawdown_limit_percent: maximum tolerable loss if stated (positive number).
- intent: "question" if the user is asking something about an existing portfolio rather than giving information; "both" if they do both (put the question in question_text).
- clarifying_question: ONLY if the message contains nothing usable about a portfolio. Ask one short, specific question. Otherwise null.`;

export async function aiExtract(text: string, spec: PortfolioSpec): Promise<{ update: SpecUpdate; intent: 'info' | 'question' | 'both' | 'unclear'; question: string | null; clarify: string | null } | null> {
  try {
    const ctx = spec.holdings.length ? `Current holdings: ${spec.holdings.map(h => h.ticker).join(', ')}` : spec.styles.length ? `Current description: ${spec.description.slice(0, 300)}` : 'No portfolio yet.';
    const msg = await chat({ response_format: { type: 'json_schema', json_schema: EXTRACT_SCHEMA }, messages: [{ role: 'system', content: EXTRACT_PROMPT }, { role: 'user', content: `${ctx}\n\nUser message:\n${text.slice(0, 4000)}` }] }, 15000);
    const j = JSON.parse(msg.content || '{}');
    const u = emptyUpdate();
    const tick = (t: string) => normalizeTicker(String(t || '')).replace(/[^A-Z.\-]/g, '');
    const okNum = (n: unknown, max: number) => (typeof n === 'number' && isFinite(n) && n > 0 && n <= max ? n : null);
    u.holdings = (Array.isArray(j.holdings) ? j.holdings : []).slice(0, 200).map((h: Record<string, unknown>) => ({
      ticker: tick(h.ticker as string),
      weight: okNum(h.weight_percent, 100),
      value: okNum(h.value_usd, 1e13),
      name: typeof h.name === 'string' ? h.name.slice(0, 60) : undefined,
      sectorHint: !isKnownTicker(tick(h.ticker as string)) && typeof h.sector === 'string' ? archetypeFromHint(h.sector) ?? undefined : undefined,
    })).filter((h: { ticker: string }) => /^[A-Z][A-Z.\-]{0,6}$/.test(h.ticker));
    u.holdingsMode = u.holdings.length ? (j.holdings_mode === 'merge' && spec.holdings.length ? 'merge' : 'replace') : 'none';
    u.remove = (Array.isArray(j.remove) ? j.remove : []).map(tick).filter(Boolean);
    if (u.remove.length && u.holdingsMode === 'none') u.holdingsMode = 'merge';
    u.aum = okNum(j.aum_usd, 1e13);
    u.styles = (Array.isArray(j.styles) ? j.styles : []).filter((s: string) => STYLE_KEYS.includes(s as StyleKey));
    for (const m of Array.isArray(j.sleeve_mix) ? j.sleeve_mix : []) if (STYLE_KEYS.includes(m.style) && okNum(m.percent, 100)) u.styleMix[m.style as StyleKey] = m.percent;
    u.sleeves = (Array.isArray(j.unspecified_sleeves) ? j.unspecified_sleeves : []).filter((s: string) => STYLE_KEYS.includes(s as StyleKey));
    u.drawdownLimit = okNum(j.drawdown_limit_percent, 99);
    u.understood = describeUpdate(u, text.toLowerCase());
    const intent = j.intent === 'question' ? 'question' : j.intent === 'both' ? 'both' : j.intent === 'unclear' ? 'unclear' : 'info';
    return { update: u, intent, question: typeof j.question_text === 'string' ? j.question_text : null, clarify: typeof j.clarifying_question === 'string' ? j.clarifying_question : null };
  } catch {
    return null;
  }
}

/** Combine AI extraction with the deterministic parse. Explicit numbers the parser found win. */
export function mergeUpdates(det: SpecUpdate, ai: SpecUpdate, text: string): SpecUpdate {
  const u: SpecUpdate = { ...ai, styleMix: { ...ai.styleMix }, holdings: ai.holdings.map(h => ({ ...h })) };
  if (det.aum != null) u.aum = det.aum;
  if (det.drawdownLimit != null) u.drawdownLimit = det.drawdownLimit;
  if (!u.holdings.length && det.holdings.length) { u.holdings = det.holdings; u.holdingsMode = det.holdingsMode; }
  // If the parser read an explicit weight for a ticker, prefer it.
  for (const h of u.holdings) {
    const d = det.holdings.find(x => x.ticker === h.ticker);
    if (d?.weight != null) h.weight = d.weight;
    if (d?.value != null && h.value == null) h.value = d.value;
  }
  if (!u.styles.length) u.styles = det.styles;
  if (!Object.keys(u.styleMix).length) u.styleMix = det.styleMix;
  if (!u.sleeves.length) u.sleeves = det.sleeves;
  u.holdingCountHint = det.holdingCountHint;
  u.notes = det.notes;
  u.understood = describeUpdate(u, text.toLowerCase());
  return u;
}

// ---------------------------------------------------------------- tools

const reason = { type: 'string', description: 'One sentence, addressed to the user, explaining why this investigation is worth running for THIS portfolio.' };

const TOOLS = [
  { type: 'function', function: { name: 'run_stress_test', description: 'Run a named scenario or a custom factor shock through the linear factor model. Custom units: growth = % factor move, rates = change in yields in percentage points (1 = +100bp), credit = change in spreads in percentage points, oil = % oil move.', parameters: { type: 'object', additionalProperties: false, required: ['scenario', 'reason'], properties: { scenario: { type: 'string', enum: [...SCENARIOS.map(s => s.key), 'custom'] }, name: { type: 'string' }, growth: { type: 'number' }, rates: { type: 'number' }, credit: { type: 'number' }, oil: { type: 'number' }, reason } } } },
  { type: 'function', function: { name: 'holding_detail', description: 'Weight, look-through exposure, risk contribution, themes and scenario sensitivity of one ticker.', parameters: { type: 'object', additionalProperties: false, required: ['ticker', 'reason'], properties: { ticker: { type: 'string' }, reason } } } },
  { type: 'function', function: { name: 'what_if_cap', description: 'Cap one holding at a weight (excess redistributed pro-rata) and measure the change in volatility and worst-scenario loss.', parameters: { type: 'object', additionalProperties: false, required: ['ticker', 'cap_percent', 'reason'], properties: { ticker: { type: 'string' }, cap_percent: { type: 'number' }, reason } } } },
  { type: 'function', function: { name: 'test_hedge', description: 'Hypothetically add a sleeve (scaling other holdings down) and re-run all scenarios.', parameters: { type: 'object', additionalProperties: false, required: ['sleeve', 'weight_percent', 'reason'], properties: { sleeve: { type: 'string', enum: ['TLT', 'SHY', 'GLD', 'XLE', 'CASH', 'XLU', 'XLV'] }, weight_percent: { type: 'number' }, reason } } } },
  { type: 'function', function: { name: 'compare_to_market', description: 'Compare modeled volatility, factor exposures and scenarios against an S&P 500 proxy built with the same model.', parameters: { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason } } } },
  { type: 'function', function: { name: 'correlations', description: 'Modeled pairwise correlations among the largest holdings and the most correlated pairs.', parameters: { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason } } } },
];

const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 10) / 10)}%`;

function execTool(p: Portfolio, name: string, args: Record<string, unknown>): { result: unknown; title: string; summary: string; finding?: Omit<Finding, 'basis'> } {
  const a = analyze(p);
  switch (name) {
    case 'run_stress_test': {
      const key = String(args.scenario);
      let s = scenarioByKey(key);
      if (key === 'custom') s = { key: 'custom', name: String(args.name || 'Custom scenario').slice(0, 60), description: 'Custom shock chosen by Atlas.', shock: { growth: clampN(args.growth, -60, 40), rates: clampN(args.rates, -4, 4), credit: clampN(args.credit, -2, 6), oil: clampN(args.oil, -80, 150) }, themeShocks: {} };
      const r = impact(p, s.shock, s.themeShocks);
      const top = r.holdings.slice(0, 3).map(h => `${h.ticker} ${pct(h.impact)}`).join(', ');
      return {
        result: { scenario: s.name, shock: s.shock, themeShocks: s.themeShocks, portfolioPct: r.pct, dollars: r.dollars, dollarsLabel: r.dollars != null ? formatMoney(Math.abs(r.dollars)) : null, worstHoldings: r.holdings.slice(0, 4), contributions: r.contributions },
        title: `Ran “${s.name}”`, summary: `${pct(r.pct)}${r.dollars != null ? ` (${r.dollars < 0 ? '−' : '+'}${formatMoney(Math.abs(r.dollars))})` : ''} · worst: ${top}`,
        finding: key === 'custom' ? { id: `ai-stress-${Math.round(Math.abs(r.pct) * 10)}`, kind: 'stress', title: `${s.name}: ${pct(r.pct)}${r.dollars != null ? ` (${r.dollars < 0 ? '−' : '+'}${formatMoney(Math.abs(r.dollars))})` : ''}`, detail: `Custom shock: growth ${pct(s.shock.growth)}, yields ${s.shock.rates >= 0 ? '+' : '−'}${Math.round(Math.abs(s.shock.rates) * 100)}bp, spreads ${s.shock.credit >= 0 ? '+' : '−'}${Math.round(Math.abs(s.shock.credit) * 100)}bp, oil ${pct(s.shock.oil)}. Worst-hit: ${top}.`, metric: { label: 'Modeled move', value: pct(r.pct) }, surprise: 0.3, followup: 'How could I hedge this?' } : undefined,
      };
    }
    case 'holding_detail': {
      const t = normalizeTicker(String(args.ticker || ''));
      const ans = answerQuestion(p, `Tell me about ${t}`);
      return { result: ans.findings, title: `Profiled ${t}`, summary: ans.trace[0]?.result ?? 'No data' };
    }
    case 'what_if_cap': {
      const t = normalizeTicker(String(args.ticker || ''));
      const cap = clampN(args.cap_percent, 0, 100);
      const w = runWhatIf(p, t, cap);
      if (!w) return { result: { note: `${t} is not held or already at or below ${cap}%` }, title: `Tested capping ${t}`, summary: 'No change' };
      return { result: w, title: `Tested capping ${t} at ${cap}%`, summary: `Volatility ${w.volBefore}% → ${w.volAfter}% · ${w.scenario} ${pct(w.worstBefore)} → ${pct(w.worstAfter)}`,
        finding: { id: `ai-cap-${t}`, kind: 'whatif', title: `Capping ${t} at ${cap}% cuts modeled volatility ${w.volBefore}% → ${w.volAfter}%`, detail: `${w.scenario} moves from ${pct(w.worstBefore)} to ${pct(w.worstAfter)} with the excess spread pro-rata. Analysis only, not a recommendation.`, metric: { label: 'Vol change', value: `${Math.round((w.volAfter - w.volBefore) * 10) / 10} pts` }, surprise: 0.3, followup: `What if I cap ${t} at 5%?` } };
    }
    case 'test_hedge': {
      const t = String(args.sleeve);
      const wt = clampN(args.weight_percent, 1, 50);
      const h = hypotheticalSleeve(p, t, wt);
      const before = a.scenarios.map(s => ({ key: s.key, pct: s.result.pct }));
      const rows = h.scenarios.map(s => ({ name: s.name, before: before.find(b => b.key === s.key)!.pct, after: s.pct }));
      const best = rows.slice().sort((x, y) => (y.after - y.before) - (x.after - x.before))[0];
      return { result: { sleeve: t, weight: wt, volBefore: a.risk.vol, volAfter: h.vol, scenarios: rows }, title: `Tested a hypothetical ${wt}% ${t} sleeve`, summary: `Volatility ${a.risk.vol}% → ${h.vol}% · biggest help: ${best.name} ${pct(best.before)} → ${pct(best.after)}`,
        finding: { id: `ai-hedge-${t}`, kind: 'hedge', title: `A ${wt}% ${t} sleeve would move ${best.name} from ${pct(best.before)} to ${pct(best.after)}`, detail: rows.map(r => `${r.name}: ${pct(r.before)} → ${pct(r.after)}`).join(' · ') + '. Hypothetical, not a recommendation.', metric: { label: 'Vol after', value: `${h.vol}%` }, surprise: 0.3, followup: 'How could I hedge a rates shock?' } };
    }
    case 'compare_to_market': {
      const ans = answerQuestion(p, 'compare to the S&P 500');
      return { result: { lead: ans.lead, findings: ans.findings }, title: 'Compared against an S&P 500 proxy', summary: ans.trace[0]?.result ?? '' };
    }
    case 'correlations': {
      const cm = correlationMatrix(p, 8);
      const pairs: { a: string; b: string; c: number }[] = [];
      cm.tickers.forEach((x, i) => cm.tickers.forEach((y, j) => { if (j > i) pairs.push({ a: x, b: y, c: cm.matrix[i][j] }); }));
      pairs.sort((x, y) => y.c - x.c);
      return { result: { top: pairs.slice(0, 5), bottom: pairs.slice(-3), themes: themeExposure(p).slice(0, 3).map(t => ({ label: t.label, weight: t.weight })) }, title: 'Computed modeled correlations', summary: pairs[0] ? `Highest: ${pairs[0].a}/${pairs[0].b} ${pairs[0].c.toFixed(2)} · lowest: ${pairs[pairs.length - 1].a}/${pairs[pairs.length - 1].b} ${pairs[pairs.length - 1].c.toFixed(2)}` : 'Single holding' };
    }
  }
  return { result: { error: 'Unknown tool' }, title: name, summary: 'Unknown tool' };
}

function clampN(v: unknown, lo: number, hi: number) {
  const n = typeof v === 'number' && isFinite(v) ? v : 0;
  return Math.max(lo, Math.min(hi, n));
}

// ---------------------------------------------------------------- grounding

/** Every number in the model's prose must appear in the evidence (allowing rounding). */
export function isGrounded(text: string, evidence: unknown): boolean {
  const evNums = new Set<number>();
  const raw = JSON.stringify(evidence);
  for (const m of raw.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []) {
    const n = Math.abs(parseFloat(m));
    if (!isFinite(n)) continue;
    [n, n / 1e3, n / 1e6, n / 1e9, n * 100].forEach(x => evNums.add(Math.round(x * 10) / 10));
  }
  const found = text.replace(/,(?=\d{3})/g, '').match(/\d+(?:\.\d+)?/g) ?? [];
  let misses = 0;
  for (const s of found) {
    const n = parseFloat(s);
    if (n <= 12 && Number.isInteger(n)) continue; // counts like "5 scenarios", "3 holdings"
    const ok = Array.from(evNums).some(e => Math.abs(e - n) <= Math.max(0.15, n * 0.012));
    if (!ok) misses++;
  }
  return misses === 0;
}

// ---------------------------------------------------------------- agent loops

type Emit = (step: TraceStep) => void;

const BRIEF_PROMPT = `You are Atlas, an autonomous portfolio analyst. A deterministic first pass has already run; its evidence is below.
Your job:
1. Decide whether 1–2 additional investigations (tool calls) would reveal something non-obvious and specific to THIS portfolio. Prefer custom stress tests targeting its dominant theme or factor, hedge tests for its weakest scenario, or what-if caps for its top risk contributor. Do not repeat what the evidence already shows.
2. Each tool call needs a one-sentence "reason" addressed to the user.
3. Finish by calling final_briefing.
Rules: use ONLY numbers that appear in the evidence or tool outputs, copied exactly. No investment advice or recommendations. If portfolio.source is "proxy", say plainly that results are illustrative because holdings were not provided. If "example", say it is an example portfolio. Be specific and concrete. No generic financial platitudes.`;

const FINAL_BRIEFING = { type: 'function', function: { name: 'final_briefing', description: 'Deliver the briefing to the user.', parameters: { type: 'object', additionalProperties: false, required: ['headline_finding_id', 'narrative'], properties: { headline_finding_id: { type: 'string', description: 'id of the most important finding (from evidence.findings or a new tool finding id).' }, narrative: { type: 'string', description: '≤ 110 words: what you investigated and why, the most surprising finding, why it matters, and the single most valuable piece of information the user could add (from evidence.unlocks).' } } } } };

export async function aiBrief(p: Portfolio, inv: Investigation, emit: Emit): Promise<{ narrative: string | null; headlineId: string | null; extra: Finding[] } | null> {
  try {
    const evidence = evidenceSummary(p, inv);
    const toolOutputs: unknown[] = [];
    const extra: Finding[] = [];
    const basis = inv.findings[0]?.basis ?? 'portfolio';
    const messages: Msg[] = [{ role: 'system', content: BRIEF_PROMPT }, { role: 'user', content: JSON.stringify(evidence) }];
    for (let turn = 0; turn < 4; turn++) {
      const msg = await chat({ messages, tools: [...TOOLS, FINAL_BRIEFING], tool_choice: turn === 3 ? { type: 'function', function: { name: 'final_briefing' } } : 'auto', max_tokens: 700 });
      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
      if (!msg.tool_calls?.length) break;
      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
        if (call.function.name === 'final_briefing') {
          const narrative = typeof args.narrative === 'string' ? args.narrative.trim() : '';
          const ok = narrative && isGrounded(narrative, { evidence, toolOutputs });
          return { narrative: ok ? narrative : null, headlineId: typeof args.headline_finding_id === 'string' ? args.headline_finding_id : null, extra };
        }
        const out = execTool(p, call.function.name, args);
        toolOutputs.push(out.result);
        emit({ id: `ai-${call.id}`, tool: call.function.name, title: out.title, reason: String(args.reason || 'Following up on the first-pass evidence.').slice(0, 240), result: out.summary, status: 'done', by: 'ai' });
        if (out.finding) extra.push({ ...out.finding, basis });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out.result).slice(0, 6000) });
      }
    }
    return { narrative: null, headlineId: null, extra };
  } catch {
    return null;
  }
}

const ANSWER_PROMPT = `You are Atlas, an autonomous portfolio analyst answering a follow-up question. Portfolio evidence is below.
Use tools to compute anything the evidence does not already answer; every tool call needs a one-sentence "reason" for the user. Then call final_answer.
Rules: use ONLY numbers from the evidence or tool outputs, copied exactly. No investment advice; frame trade-offs as analysis. If portfolio.source is "proxy", note results are illustrative. If the question needs data Atlas doesn't have (live prices, news, peer funds), say so plainly and offer the closest analysis you can run.`;

const FINAL_ANSWER = { type: 'function', function: { name: 'final_answer', description: 'Deliver the answer.', parameters: { type: 'object', additionalProperties: false, required: ['lead', 'findings', 'followups'], properties: { lead: { type: 'string', description: '1–2 sentence direct answer.' }, findings: { type: 'array', items: { type: 'string' }, description: '2–4 concise evidence bullets.' }, followups: { type: 'array', items: { type: 'string' }, description: '3 specific next questions.' } } } } };

export async function aiAnswer(p: Portfolio, inv: Investigation, question: string, history: { role: string; text: string }[], emit: Emit): Promise<Answer | null> {
  try {
    const evidence = evidenceSummary(p, inv);
    const toolOutputs: unknown[] = [];
    const steps: TraceStep[] = [];
    const messages: Msg[] = [
      { role: 'system', content: ANSWER_PROMPT },
      { role: 'user', content: `EVIDENCE: ${JSON.stringify(evidence)}\n\nRECENT CONVERSATION:\n${history.slice(-6).map(h => `${h.role}: ${h.text.slice(0, 400)}`).join('\n')}\n\nQUESTION: ${question.slice(0, 1200)}` },
    ];
    for (let turn = 0; turn < 4; turn++) {
      const msg = await chat({ messages, tools: [...TOOLS, FINAL_ANSWER], tool_choice: turn === 3 ? { type: 'function', function: { name: 'final_answer' } } : 'auto', max_tokens: 700 });
      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
      if (!msg.tool_calls?.length) break;
      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
        if (call.function.name === 'final_answer') {
          const lead = String(args.lead || '').trim();
          const findings = (Array.isArray(args.findings) ? args.findings : []).map(String).slice(0, 5);
          const followups = (Array.isArray(args.followups) ? args.followups : []).map(String).slice(0, 3);
          if (!lead || !isGrounded([lead, ...findings].join(' '), { evidence, toolOutputs })) return null;
          return { lead, findings, followups, trace: steps };
        }
        const out = execTool(p, call.function.name, args);
        toolOutputs.push(out.result);
        const st: TraceStep = { id: `ai-${call.id}`, tool: call.function.name, title: out.title, reason: String(args.reason || '').slice(0, 240), result: out.summary, status: 'done', by: 'ai' };
        steps.push(st);
        emit(st);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out.result).slice(0, 6000) });
      }
    }
    return null;
  } catch {
    return null;
  }
}
