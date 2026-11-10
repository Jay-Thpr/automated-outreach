import { NextRequest } from 'next/server';
import type { HoldingInput, PortfolioSpec, SpecUpdate, StyleKey } from '../../../lib/types';
import type { AgentEvent, AgentRequest } from '../../../lib/protocol';
import { answerQuestion, investigate } from '../../../lib/agent';
import { applyUpdate, buildPortfolio, emptySpec, exampleSpec, EXAMPLES } from '../../../lib/portfolio';
import { describeUpdate, emptyUpdate, hasContent, parseText } from '../../../lib/parse';
import { aiAnswer, aiBrief, aiEnabled, aiExtract, mergeUpdates } from '../../../lib/llm';
import { STYLE_TEMPLATES } from '../../../lib/universe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STYLE_KEYS = Object.keys(STYLE_TEMPLATES) as StyleKey[];
const num = (v: unknown, max: number) => (typeof v === 'number' && isFinite(v) && v > 0 && v <= max ? v : null);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanHoldings(v: unknown): HoldingInput[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 250).map(h => ({
    ticker: str(h?.ticker, 12).toUpperCase().replace(/[^A-Z.\-]/g, ''),
    weight: num(h?.weight, 1000),
    value: num(h?.value, 1e13),
    name: h?.name ? str(h.name, 80) : undefined,
    sectorHint: h?.sectorHint ? str(h.sectorHint, 40) : undefined,
  })).filter(h => h.ticker);
}
function cleanStyles(v: unknown): StyleKey[] {
  return Array.isArray(v) ? v.filter((s): s is StyleKey => STYLE_KEYS.includes(s)) : [];
}
function cleanMix(v: unknown): Partial<Record<StyleKey, number>> {
  const out: Partial<Record<StyleKey, number>> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (STYLE_KEYS.includes(k as StyleKey) && num(x, 100)) out[k as StyleKey] = x as number;
  return out;
}

function cleanSpec(v: unknown): PortfolioSpec {
  if (!v || typeof v !== 'object') return emptySpec();
  const s = v as Record<string, unknown>;
  return {
    description: str(s.description, 6000),
    aum: num(s.aum, 1e13),
    aumSource: s.aumSource === 'stated' || s.aumSource === 'file' || s.aumSource === 'example' ? s.aumSource : null,
    holdings: cleanHoldings(s.holdings),
    styles: cleanStyles(s.styles),
    styleMix: cleanMix(s.styleMix),
    drawdownLimit: num(s.drawdownLimit, 99),
    exampleId: typeof s.exampleId === 'string' && EXAMPLES.some(e => e.id === s.exampleId) ? s.exampleId : null,
    holdingCountHint: num(s.holdingCountHint, 100000),
    sleeves: cleanStyles(s.sleeves),
  };
}

function cleanUpdate(v: unknown): SpecUpdate {
  const u = emptyUpdate();
  if (!v || typeof v !== 'object') return u;
  const s = v as Record<string, unknown>;
  u.holdings = cleanHoldings(s.holdings);
  u.holdingsMode = s.holdingsMode === 'replace' || s.holdingsMode === 'merge' ? s.holdingsMode : u.holdings.length ? 'replace' : 'none';
  u.remove = Array.isArray(s.remove) ? s.remove.map(x => str(x, 12).toUpperCase()).filter(Boolean) : [];
  u.aum = num(s.aum, 1e13);
  u.styles = cleanStyles(s.styles);
  u.styleMix = cleanMix(s.styleMix);
  u.sleeves = cleanStyles(s.sleeves);
  u.drawdownLimit = num(s.drawdownLimit, 99);
  u.notes = Array.isArray(s.notes) ? s.notes.map(x => str(x, 200)).slice(0, 5) : [];
  u.understood = describeUpdate(u);
  return u;
}

const looksLikeQuestion = (t: string) => /\?\s*$|^(?:what|how|why|which|where|who|when|should|could|would|can|is|are|do|does|tell|show|explain|compare|simulate|stress|run|test)\b/i.test(t.trim());

const UPDATE_VERB = /\b(?:i (?:own|have|hold|bought|sold|added|manage|run)|we (?:own|have|hold|manage|run)|my (?:portfolio|holdings|aum|fund|book)(?: size)? (?:is|are|has|was)|add|remove|sell|sold|drop|actually|update|set (?:my|the)|change (?:my|the)|loss limit|drawdown limit|can'?t (?:afford to )?lose|cannot lose|it'?s (?:about|around|roughly))\b/i;

const CLARIFY_OPTIONS = ['Mostly US tech stocks', 'A balanced 60/40 portfolio', 'Dividend and income stocks', 'I’ll paste my holdings'];

export async function GET() {
  return Response.json({ ai: aiEnabled() });
}

export async function POST(request: NextRequest) {
  let body: AgentRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      try {
        const ai = aiEnabled();
        emit({ t: 'mode', mode: ai ? 'ai' : 'demo' });
        const kind = body.kind === 'chat' || body.kind === 'apply' ? body.kind : 'onboard';
        let spec = kind === 'onboard' ? emptySpec() : cleanSpec(body.spec);
        const prev = kind === 'onboard' ? null : buildPortfolio(spec);
        const text = str(body.text, 4000).trim();
        const history = Array.isArray(body.history) ? body.history.slice(-8).map(h => ({ role: h.role === 'user' ? 'user' : 'atlas', text: str(h.text, 600) })) : [];

        if (kind === 'onboard' && body.exampleId) spec = exampleSpec(String(body.exampleId));
        let update: SpecUpdate | null = body.update ? cleanUpdate(body.update) : null;
        let intent: 'info' | 'question' | 'both' | 'unclear' = 'info';
        let question: string | null = null;
        let clarify: string | null = null;

        if (text) {
          const det = parseText(text, { hasHoldings: spec.holdings.length > 0 });
          let merged = det;
          let by: 'ai' | 'planner' = 'planner';
          if (ai) {
            const x = await aiExtract(text, spec);
            if (x) {
              merged = mergeUpdates(det, x.update, text);
              intent = x.intent;
              question = x.question;
              clarify = x.clarify;
              by = 'ai';
            }
          }
          if (by === 'planner') {
            const info = det.holdings.length > 0 || det.aum != null || det.drawdownLimit != null || det.remove.length > 0 || det.sleeves.length > 0 || Object.keys(det.styleMix).length > 0;
            const q = looksLikeQuestion(text), verb = UPDATE_VERB.test(text);
            if (kind === 'chat') intent = info && (!q || verb) ? (q ? 'both' : 'info') : 'question';
            else intent = hasContent(det) ? 'info' : 'unclear';
          }
          if (kind === 'chat' && (intent === 'question' || intent === 'unclear') && !hasContent(merged)) {
            question = text;
            intent = 'question';
          }
          if (kind === 'chat' && intent === 'question' && !question) question = text;
          if (intent === 'both' && !question) question = text;
          if (intent !== 'question') {
            update = merged;
            emit({ t: 'understood', items: merged.understood, notes: merged.notes });
            if (merged.understood.length) {
              emit({ t: 'step', step: { id: 'read', tool: 'extract', title: kind === 'chat' ? 'Read your update' : 'Read your description', reason: by === 'ai' ? 'I used the language model to extract structure, then cross-checked explicit numbers with a deterministic parser.' : 'I extracted every concrete fact I could (amounts, tickers, weights, styles) before deciding what to analyze.', result: merged.understood.map(u => `${u.label}: ${u.value}`).join(' · '), status: 'done', by } });
            }
          }
        }

        // Pure question about the current portfolio.
        if (kind === 'chat' && intent === 'question' && question) {
          const p = buildPortfolio(spec);
          if (!p) {
            emit({ t: 'question', text: 'Tell me a little about the portfolio first: a sentence, a few tickers, or a file is enough.', options: CLARIFY_OPTIONS });
            emit({ t: 'done' });
            controller.close();
            return;
          }
          let answered = false;
          if (ai) {
            const inv = investigate(p, spec);
            const a = await aiAnswer(p, inv, question, history, step => emit({ t: 'step', step }));
            if (a) { emit({ t: 'answer', payload: { lead: a.lead, findings: a.findings, followups: a.followups, by: 'ai' } }); answered = true; }
            else emit({ t: 'notice', text: 'AI answer unavailable or failed verification; showing deterministic analysis.' });
          }
          if (!answered) {
            const a = answerQuestion(p, question);
            a.trace.forEach(step => emit({ t: 'step', step }));
            emit({ t: 'answer', payload: { lead: a.lead, findings: a.findings, followups: a.followups, by: 'planner', focus: a.focus } });
          }
          emit({ t: 'done' });
          controller.close();
          return;
        }

        const nextSpec = update ? applyUpdate(spec, update, text) : spec;
        const p = buildPortfolio(nextSpec);
        if (!p) {
          emit({ t: 'question', text: clarify || 'I couldn’t find anything about the portfolio in that. What is it mostly invested in? A rough description, a few tickers, or a file all work.', options: CLARIFY_OPTIONS });
          emit({ t: 'done' });
          controller.close();
          return;
        }
        emit({ t: 'spec', spec: nextSpec });
        const inv = investigate(p, nextSpec, prev);
        for (const step of inv.trace) emit({ t: 'step', step });
        let narrative = inv.narrative;
        let narrativeBy: 'ai' | 'planner' = 'planner';
        let findings = inv.findings;
        let headlineId = inv.headline?.id ?? null;
        if (ai) {
          const b = await aiBrief(p, inv, step => emit({ t: 'step', step }));
          if (b) {
            findings = [...findings, ...b.extra];
            if (b.headlineId && findings.some(f => f.id === b.headlineId)) {
              headlineId = b.headlineId;
              findings = [findings.find(f => f.id === b.headlineId)!, ...findings.filter(f => f.id !== b.headlineId)];
            }
            if (b.narrative) { narrative = b.narrative; narrativeBy = 'ai'; }
            else emit({ t: 'notice', text: 'AI narrative failed verification against computed figures; showing the deterministic summary.' });
          } else emit({ t: 'notice', text: 'Live AI unavailable; showing the deterministic investigation.' });
        }
        emit({ t: 'investigation', payload: { findings, headlineId, narrative, narrativeBy, unlocks: inv.unlocks, delta: inv.delta, focusScenario: inv.focusScenario } });
        if (intent === 'both' && question) {
          const a = answerQuestion(p, question);
          a.trace.forEach(step => emit({ t: 'step', step }));
          emit({ t: 'answer', payload: { lead: a.lead, findings: a.findings, followups: a.followups, by: 'planner', focus: a.focus } });
        }
        emit({ t: 'done' });
      } catch (err) {
        emit({ t: 'error', message: err instanceof Error ? err.message : 'Investigation failed' });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
