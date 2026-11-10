/**
 * Deterministic extraction of portfolio information from natural language and CSV files.
 * Used directly in demo mode, for the live "Atlas understood" preview, and as a
 * cross-check on AI extraction when an API key is configured.
 */
import type { HoldingInput, SpecUpdate, StyleKey } from './types';
import { ALIASES, NOT_TICKERS, STYLE_TEMPLATES, archetypeFromHint, isKnownTicker, lookupFund, lookupSecurity, normalizeTicker } from './universe';

export function emptyUpdate(): SpecUpdate {
  return { holdingsMode: 'none', holdings: [], remove: [], aum: null, styles: [], styleMix: {}, drawdownLimit: null, holdingCountHint: null, sleeves: [], understood: [], notes: [] };
}

const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12, tn: 1e12, trillion: 1e12 };

export function parseMoney(num: string, suffix?: string): number {
  const n = parseFloat(num.replace(/,/g, ''));
  return n * (suffix ? MULT[suffix.toLowerCase()] ?? 1 : 1);
}

export function formatMoney(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${trim(n / 1e12)}T`;
  if (a >= 1e9) return `$${trim(n / 1e9)}B`;
  if (a >= 1e6) return `$${trim(n / 1e6)}M`;
  if (a >= 1e3) return `$${trim(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
const trim = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1).replace(/\.0$/, '') : n.toFixed(2).replace(/\.?0+$/, ''));

// Generic asset-class words: treated as sleeves of the portfolio, not as specific holdings.
const MIX_WORDS: [RegExp, StyleKey][] = [
  [/^(?:us |global |international )?(?:stocks?|equit(?:y|ies)|shares)$/, 'broad'],
  [/^(?:bonds?|fixed income|treasur(?:y|ies)|govies|gilts)$/, 'bonds'],
  [/^cash$|^money market$|^t-?bills$/, 'cash'],
  [/^tech(?:nology)?(?: stocks)?$/, 'tech'],
  [/^(?:semiconductors?|chips?)(?: stocks)?$/, 'semis'],
  [/^gold$/, 'gold'],
  [/^(?:crypto|bitcoin|digital assets)$/, 'crypto'],
  [/^(?:real estate|reits?)$/, 'realestate'],
  [/^(?:international|intl|foreign)(?: stocks| equities)?$/, 'international'],
  [/^emerging markets?$/, 'emerging'],
  [/^dividend (?:stocks|payers)$/, 'dividend'],
  [/^energy(?: stocks)?$/, 'energy'],
  [/^healthcare|^health care/, 'healthcare'],
  [/^financials?$|^banks$/, 'financials'],
  [/^(?:credit|corporate bonds|high yield)$/, 'credit'],
];

const STYLE_WORDS: [RegExp, StyleKey][] = [
  [/clean energy|renewable|energy transition|\btransition\b|\besg\b|climate|solar|decarboni/, 'transition'],
  [/semiconductor|\bchips?\b|\bsemis\b/, 'semis'],
  [/\btech\b|tech-heavy|technology|\bai\b|software|innovation|mega-?cap|magnificent|faang/, 'tech'],
  [/\bgrowth\b/, 'growth'],
  [/dividend|income-oriented|\bincome\b|yield-focused/, 'dividend'],
  [/value stocks|value-oriented|deep value|value tilt|value investing|\bvalue\b(?= (?:portfolio|equity|fund|strategy))/, 'value'],
  [/balanced|60\s*\/\s*40|multi-asset|\bmixed\b|endowment/, 'balanced'],
  [/fixed income|\bbonds?\b|treasur|duration/, 'bonds'],
  [/high yield|\bcredit\b|corporate bonds|leveraged loans/, 'credit'],
  [/\boil\b|\bgas\b|energy(?! transition)/, 'energy'],
  [/health ?care|pharma|biotech|medical/, 'healthcare'],
  [/\bbanks?\b|financials|financial services/, 'financials'],
  [/emerging markets?|\bem\b equities/, 'emerging'],
  [/international|global ex|europe|japan|developed markets|non-us|ex-us/, 'international'],
  [/real estate|\breits?\b/, 'realestate'],
  [/crypto|bitcoin|digital assets/, 'crypto'],
  [/\bgold\b|precious metals/, 'gold'],
  [/s&p|index funds?|passive|broad market|total market|\bequit(?:y|ies)\b|\bstocks\b/, 'broad'],
];

const GENERIC_ALIAS = new Set(['bitcoin', 'gold', 'nasdaq 100', 'nasdaq-100', 's&p 500', 's&p500', 'total market', 'treasuries', 'long treasuries', 'long bonds', 't-bills', 'cash']);

type Mention = { ticker: string; start: number; end: number; known: boolean; viaAlias: boolean };

function findMentions(text: string): Mention[] {
  const out: Mention[] = [];
  const re = /\$?\b([A-Z]{1,5}(?:[.\-][A-Z])?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1];
    if (NOT_TICKERS.has(raw)) continue;
    const t = normalizeTicker(raw);
    const known = isKnownTicker(t);
    out.push({ ticker: t, start: m.index, end: m.index + m[0].length, known, viaAlias: false });
  }
  const lower = text.toLowerCase();
  const aliasKeys = Object.keys(ALIASES).filter(k => !GENERIC_ALIAS.has(k)).sort((a, b) => b.length - a.length);
  const taken: [number, number][] = out.map(o => [o.start, o.end]);
  for (const key of aliasKeys) {
    const are = new RegExp(`(?<![a-z])${key.replace(/[.*+?^${}()|[\]\\&]/g, s => '\\' + s)}(?![a-z])`, 'g');
    let am: RegExpExecArray | null;
    while ((am = are.exec(lower))) {
      const s = am.index, e = s + key.length;
      if (taken.some(([a, b]) => s < b && e > a)) continue;
      taken.push([s, e]);
      out.push({ ticker: ALIASES[key], start: s, end: e, known: true, viaAlias: true });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const SEG_BREAK = /[,;\n]|\band\b|\bplus\b|\bwith\b/gi;

function segmentBounds(text: string, pos: number): [number, number] {
  let start = 0, end = text.length;
  const re = new RegExp(SEG_BREAK.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index + m[0].length <= pos) start = m.index + m[0].length;
    else if (m.index >= pos) { end = m.index; break; }
  }
  return [start, end];
}

type Attach = { weight?: number; value?: number; shares?: number };

function attachAfter(after: string, allowBare: boolean): Attach | null {
  let m = after.match(/^\s*[:=\-–]?\s*(?:at\s+|@\s*|is\s+|weight\s+)?(\d+(?:\.\d+)?)\s*%/);
  if (m) return { weight: parseFloat(m[1]) };
  m = after.match(/^\s*[:=\-–]?\s*(?:at\s+|@\s*)?\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|mm|mn|b|bn|million|billion|thousand)?\b/i);
  if (m) return { value: parseMoney(m[1], m[2]) };
  if (allowBare) {
    m = after.match(/^\s*[:=\-–]?\s*(\d+(?:\.\d+)?)(?![\d%$.])(?!\s*(?:shares|k\b|m\b|b\b|million|billion))/i);
    if (m && parseFloat(m[1]) <= 100) return { weight: parseFloat(m[1]) };
  }
  return null;
}

function attachBefore(before: string): Attach | null {
  let m = before.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s+(?:it\s+|the\s+portfolio\s+)?(?:is\s+)?(?:in\s+)?|in\s+|into\s+|position\s+in\s+|allocated\s+to\s+|weight\s+(?:in|to)\s+)?(?:the\s+)?$/i);
  if (m) return { weight: parseFloat(m[1]) };
  m = before.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|mm|mn|b|bn|million|billion|thousand)?\s*(?:in|of|into|worth of)\s+$/i);
  if (m) return { value: parseMoney(m[1], m[2]) };
  m = before.match(/(\d[\d,]*)\s*shares?\s+(?:of\s+)?$/i);
  if (m) return { shares: parseFloat(m[1].replace(/,/g, '')) };
  return null;
}

/**
 * Parse free text into a structured update.
 * @param hasHoldings whether the user already has holdings (affects replace vs. merge)
 */
export function parseText(input: string, ctx: { hasHoldings?: boolean } = {}): SpecUpdate {
  const u = emptyUpdate();
  const text = input.replace(/ /g, ' ').trim();
  if (!text) return u;
  const lower = text.toLowerCase();
  const consumed: [number, number][] = [];
  const isConsumed = (s: number, e: number) => consumed.some(([a, b]) => s < b && e > a);

  // ---- Sleeve mix, e.g. "60% stocks / 40% bonds" ----
  const mixRe = /(\d+(?:\.\d+)?)\s*%\s*(?:in\s+|of\s+(?:it\s+)?(?:in\s+)?|into\s+)?([a-z][a-z\- ]{1,28}?)(?=\s*(?:[,;/.)]|$|\band\b|\bwith\b|\bplus\b|\d))/gi;
  let mm: RegExpExecArray | null;
  while ((mm = mixRe.exec(text))) {
    const word = mm[2].trim().toLowerCase();
    const hit = MIX_WORDS.find(([re]) => re.test(word));
    if (hit) {
      u.styleMix[hit[1]] = (u.styleMix[hit[1]] ?? 0) + parseFloat(mm[1]);
      consumed.push([mm.index, mm.index + mm[0].length]);
    }
  }
  if (!Object.keys(u.styleMix).length) {
    const sixty = lower.match(/\b(\d{2})\s*\/\s*(\d{2})\b(?!\s*\/)/);
    if (sixty && +sixty[1] + +sixty[2] === 100 && /balanced|stock|bond|equit|portfolio|fund|allocation/.test(lower)) {
      u.styleMix = { broad: +sixty[1], bonds: +sixty[2] };
      consumed.push([sixty.index!, sixty.index! + sixty[0].length]);
    }
  }

  // ---- Holdings ----
  const mentions = findMentions(text).filter(m => !isConsumed(m.start, m.end));
  const knownCount = mentions.filter(m => m.known).length;
  const bareAllowed = (text.match(/\b[A-Z]{2,5}\s*[:=\-–]?\s*\d+(?:\.\d+)?(?![\d%])/g)?.length ?? 0) >= 2 && !/%/.test(text);
  const pairs = mentions.map(m => {
    const [s, e] = segmentBounds(text, m.start);
    return { m, after: attachAfter(text.slice(m.end, e), bareAllowed), before: attachBefore(text.slice(s, m.start)) };
  });
  const afterCount = pairs.filter(p => p.after).length, beforeCount = pairs.filter(p => p.before).length;
  const preferBefore = beforeCount > afterCount;
  const seen = new Map<string, HoldingInput>();
  for (const { m, after, before } of pairs) {
    const att = preferBefore ? before ?? after : after ?? before;
    // Unknown uppercase words only count as tickers when something is attached or they appear in a list of known tickers.
    if (!m.known) {
      const looksLikeList = knownCount >= 2 && m.ticker.length >= 2;
      if (!att && !looksLikeList) continue;
      if (m.ticker.length < 2 && !att) continue;
    } else if (!m.viaAlias && m.ticker.length <= 2 && !att && knownCount < 3) {
      continue; // short tickers like "C", "MS" in prose are too ambiguous without a weight
    }
    const prev = seen.get(m.ticker) ?? { ticker: m.ticker, weight: null, value: null };
    if (att?.weight != null) prev.weight = (prev.weight ?? 0) + att.weight;
    if (att?.value != null) prev.value = (prev.value ?? 0) + att.value;
    if (att?.shares != null && !u.notes.includes('shares')) u.notes.push(`Share counts need prices to become weights; ${m.ticker} was given ${att.shares} shares.`);
    seen.set(m.ticker, prev);
    consumed.push([m.start, m.end]);
  }
  // Generic aliases ("10% gold", "5% bitcoin") only count as holdings when a weight is attached and no mix captured them.
  for (const key of GENERIC_ALIAS) {
    const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%\\s*(?:in\\s+|of\\s+)?${key.replace(/[.*+?^${}()|[\]\\&]/g, s => '\\' + s)}(?![a-z])`, 'i');
    const g = text.match(re);
    if (g && !isConsumed(g.index!, g.index! + g[0].length)) {
      const t = ALIASES[key];
      seen.set(t, { ticker: t, weight: parseFloat(g[1]), value: null });
      consumed.push([g.index!, g.index! + g[0].length]);
    }
  }
  u.holdings = Array.from(seen.values());

  // ---- Remove / merge intent ----
  const removeRe = /\b(?:remove|sell|sold|drop|exit(?:ed)?|get rid of|no longer (?:own|hold))\s+(?:all\s+(?:of\s+)?(?:my\s+)?)?([A-Za-z.\s,&]+)/i;
  const rm = text.match(removeRe);
  if (rm) {
    const ms = findMentions(rm[1]).filter(x => x.known);
    u.remove = ms.map(x => x.ticker);
    u.holdings = u.holdings.filter(h => !u.remove.includes(h.ticker));
  }
  const addIntent = /\b(?:add|also|plus|include|bought|buy|increase|decrease|reduce|trim|change|update|set)\b/i.test(text);
  if (u.holdings.length) {
    if (ctx.hasHoldings && (addIntent || u.holdings.length <= 2) && !/\b(?:actually|instead|my (?:actual )?holdings are|replace)\b/i.test(text)) u.holdingsMode = 'merge';
    else u.holdingsMode = 'replace';
  } else if (u.remove.length) u.holdingsMode = 'merge';

  // ---- AUM ----
  const moneyRe = /(?:\$|usd\s?|us\$)\s?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|mn|million|b|bn|billion|t|tn|trillion)?\b|\b(\d+(?:\.\d+)?)\s*(million|billion|trillion|mm|bn|mn)\b|\b(\d+(?:\.\d+)?)\s?([mbk])\b(?!\s*%)/gi;
  let best: number | null = null;
  let mo: RegExpExecArray | null;
  while ((mo = moneyRe.exec(text))) {
    if (isConsumed(mo.index, mo.index + mo[0].length)) continue;
    const [s] = segmentBounds(text, mo.index);
    const after = text.slice(mo.index + mo[0].length, mo.index + mo[0].length + 12);
    const nextWord = after.match(/^\s*(?:in|of|worth of|into)\s+\$?([A-Za-z.\-]+)/);
    if (nextWord && (seen.has(normalizeTicker(nextWord[1])) || ALIASES[nextWord[1].toLowerCase()])) continue;
    const prevText = text.slice(s, mo.index);
    if (/\b[A-Z]{1,5}\s*[:=\-–]?\s*$/.test(prevText) && seen.has(normalizeTicker(prevText.trim().replace(/[:=\-–]$/, '').trim().split(/\s+/).pop() || ''))) continue;
    const val = mo[1] ? parseMoney(mo[1], mo[2]) : mo[3] ? parseMoney(mo[3], mo[4]) : parseMoney(mo[5], mo[6]);
    if (mo[1] && !mo[2] && val < 1000) continue; // "$5" alone is not an AUM
    if (val >= 1000 && (best == null || val > best)) best = val;
  }
  if (best != null) u.aum = best;

  // ---- Drawdown tolerance ----
  const dd = lower.match(/(?:max(?:imum)?\s+)?(?:draw\s?down|loss)\s*(?:limit|tolerance|budget|threshold)?\s*(?:of|is|at|:|=)?\s*(?:about\s+|around\s+)?(\d+(?:\.\d+)?)\s*%/) ||
    lower.match(/(?:can(?:no|')t|cannot|can not|don'?t want to|won'?t|unable to)\s+(?:afford to\s+)?(?:lose|tolerate losing|tolerate a loss of|stomach)\s+(?:more than\s+|over\s+)?(\d+(?:\.\d+)?)\s*%/) ||
    lower.match(/(?:lose|loss of|losing)\s+(?:more than|over)\s+(\d+(?:\.\d+)?)\s*%/);
  if (dd) {
    const v = parseFloat(dd[1]);
    if (v > 0 && v < 100) u.drawdownLimit = v;
  }

  // ---- Holding-count hint ----
  const hc = lower.match(/\b(\d{1,4})\s*(?:names|stocks|positions|holdings|securities)\b/);
  if (hc && +hc[1] > 0) u.holdingCountHint = +hc[1];

  // ---- Sleeves without positions ("rest in index funds", "plus some bonds") ----
  const sleeveRe = /(?:\brest\b|remainder|remaining|\bbalance\b|the other(?: \d+%)?|plus some|and some|with some|\bsome\b|a bit of|a little)\s+(?:of it\s+|of the portfolio\s+)?(?:is\s+|are\s+)?(?:in\s+|into\s+)?(?:a\s+|an\s+)?(index funds?|index etfs?|the s&p(?: 500)?|s&p 500 funds?|etfs?|bonds?|treasuries|fixed income|cash|international(?: stocks)?|emerging markets?|gold|crypto|bitcoin|tech(?: stocks)?|dividend stocks)/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sleeveRe.exec(lower))) {
    const w = sm[1];
    const key: StyleKey = /index|s&p|etf/.test(w) ? 'broad' : /bond|treasur|fixed/.test(w) ? 'bonds' : /cash/.test(w) ? 'cash' : /international/.test(w) ? 'international' : /emerging/.test(w) ? 'emerging' : /gold/.test(w) ? 'gold' : /crypto|bitcoin/.test(w) ? 'crypto' : /tech/.test(w) ? 'tech' : 'dividend';
    if (!u.sleeves.includes(key)) u.sleeves.push(key);
  }

  // ---- Styles ----
  const styleText = lower.replace(/\b(?:market )?value\b(?= of)/g, '');
  for (const [re, key] of STYLE_WORDS) if (re.test(styleText) && !u.styles.includes(key)) u.styles.push(key);
  // "broad" is only meaningful when nothing more specific was said.
  if (u.styles.length > 1) u.styles = u.styles.filter(s => s !== 'broad' || Object.keys(u.styleMix).includes('broad'));
  if (u.styles.includes('balanced') && u.styles.includes('bonds') && !Object.keys(u.styleMix).length) u.styles = u.styles.filter(s => s !== 'bonds');
  if (u.styles.includes('transition')) u.styles = u.styles.filter(s => s !== 'energy');
  if (u.styles.includes('semis') && u.styles.includes('tech') && !/\btech\b|technology|software/.test(lower)) u.styles = u.styles.filter(s => s !== 'tech');
  for (const k of Object.keys(u.styleMix) as StyleKey[]) if (!u.styles.includes(k) && k !== 'cash') u.styles.push(k);

  u.understood = describeUpdate(u, lower);
  return u;
}

/** Human-readable chips describing what was understood from an update. */
export function describeUpdate(u: SpecUpdate, lower = ''): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (u.aum != null) out.push({ label: 'AUM', value: formatMoney(u.aum) });
  if (Object.keys(u.styleMix).length) out.push({ label: 'Mix', value: Object.entries(u.styleMix).map(([k, v]) => `${trim(v as number)}% ${STYLE_TEMPLATES[k as StyleKey]?.label.toLowerCase() ?? k}`).join(' / ') });
  else if (u.styles.length && !(u.holdings.length && u.styles.every(s => u.sleeves.includes(s)))) out.push({ label: 'Style', value: styleLabel(u.styles, lower) });
  if (u.holdings.length) {
    const shown = u.holdings.slice(0, 6).map(h => `${h.ticker}${h.weight != null ? ' ' + trim(h.weight) + '%' : h.value != null ? ' ' + formatMoney(h.value) : ''}`);
    out.push({ label: u.holdings.length === 1 ? 'Holding' : `${u.holdings.length} holdings`, value: shown.join(', ') + (u.holdings.length > 6 ? ', …' : '') });
    const unknown = u.holdings.filter(h => !isKnownTicker(h.ticker)).map(h => h.ticker);
    if (unknown.length) out.push({ label: 'Not in reference set', value: unknown.join(', ') });
  }
  if (u.sleeves.length) out.push({ label: 'Unspecified sleeve', value: u.sleeves.map(k => STYLE_TEMPLATES[k].label.toLowerCase()).join(', ') });
  if (u.remove.length) out.push({ label: 'Remove', value: u.remove.join(', ') });
  if (u.drawdownLimit != null) out.push({ label: 'Loss limit', value: `${trim(u.drawdownLimit)}%` });
  if (u.holdingCountHint != null && !u.holdings.length) out.push({ label: 'Positions', value: String(u.holdingCountHint) });
  return out;
}

export function styleLabel(styles: StyleKey[], lower = ''): string {
  const names = styles.map(s => STYLE_TEMPLATES[s].label.toLowerCase());
  const tilt = /heavy|tilt|overweight|leaning|focused|concentrated/.test(lower) ? '-heavy' : '';
  if (names.length === 1) return tilt ? `${names[0]}${tilt}` : names[0];
  return names.join(' + ');
}

/** How strongly the description emphasises its primary style (used by the proxy builder). */
export function styleEmphasis(text: string): number {
  const l = text.toLowerCase();
  if (/\b(?:all|pure|only|100%|entirely|exclusively)\b/.test(l)) return 1;
  if (/\b(?:mostly|primarily|mainly|predominantly|largely)\b/.test(l)) return 0.75;
  if (/heavy|tilt|overweight|leaning|focused|concentrated/.test(l)) return 0.65;
  return 1;
}

// ---------- CSV ----------

const num = (s: string | undefined) => {
  if (s == null) return NaN;
  const c = s.replace(/[$,%\s"]/g, '').replace(/^\((.*)\)$/, '-$1');
  return c === '' ? NaN : parseFloat(c);
};

function splitRow(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === delim && !q) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseCSV(content: string): SpecUpdate {
  const u = emptyUpdate();
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) { u.notes.push('The file is empty.'); return u; }
  const delim = ['\t', ';', ','].map(d => [d, lines[0].split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows = lines.map(l => splitRow(l, delim));
  const header = rows[0].map(h => h.toLowerCase());
  const hasHeader = header.some(h => /[a-z]/.test(h) && !isKnownTicker(h.toUpperCase())) && header.some(h => /ticker|symbol|security|holding|name|weight|value|shares|quantity|allocation|%/.test(h));
  const find = (re: RegExp) => (hasHeader ? header.findIndex(h => re.test(h)) : -1);
  let iTicker = find(/ticker|symbol/);
  const iName = find(/name|security|description|holding|instrument/);
  const iWeight = find(/weight|alloc|%|pct|percent/);
  const iValue = find(/market ?value|\bvalue\b|amount|\bmv\b|usd|\$|notional|balance/);
  const iShares = find(/shares|quantity|qty|units|position/);
  const iPrice = find(/price|last/);
  const iSector = find(/sector|industry|asset ?class/);
  const body = hasHeader ? rows.slice(1) : rows;
  if (!hasHeader) iTicker = 0;
  const holdings: HoldingInput[] = [];
  let skipped = 0;
  for (const r of body) {
    let ticker = iTicker >= 0 ? r[iTicker] : '';
    if ((!ticker || !/^[A-Za-z.\-$]{1,8}$/.test(ticker)) && iName >= 0) {
      const name = (r[iName] || '').toLowerCase();
      const alias = Object.keys(ALIASES).find(k => name.includes(k));
      ticker = alias ? ALIASES[alias] : ticker;
    }
    if (!ticker || /^total$/i.test(ticker) || !/^[A-Za-z.\-$]{1,8}$/.test(ticker)) { skipped++; continue; }
    const h: HoldingInput = { ticker: normalizeTicker(ticker), weight: null, value: null };
    if (hasHeader) {
      if (iWeight >= 0 && !isNaN(num(r[iWeight]))) h.weight = num(r[iWeight]);
      if (iValue >= 0 && !isNaN(num(r[iValue]))) h.value = num(r[iValue]);
      if (h.value == null && iShares >= 0 && iPrice >= 0 && !isNaN(num(r[iShares])) && !isNaN(num(r[iPrice]))) h.value = num(r[iShares]) * num(r[iPrice]);
      if (iSector >= 0 && r[iSector] && archetypeFromHint(r[iSector])) h.sectorHint = archetypeFromHint(r[iSector])!;
      if (iName >= 0 && r[iName] && r[iName] !== ticker) h.name = r[iName];
    } else {
      const n = num(r[1]);
      if (!isNaN(n)) h.weight = n; // decided below whether these are weights or values
    }
    holdings.push(h);
  }
  if (!hasHeader) {
    const sum = holdings.reduce((s, h) => s + (h.weight ?? 0), 0);
    if (sum > 150) holdings.forEach(h => { h.value = h.weight; h.weight = null; });
  }
  // Fractional weights (sum ≈ 1) → percent.
  const wsum = holdings.reduce((s, h) => s + (h.weight ?? 0), 0);
  if (wsum > 0 && wsum <= 1.5) holdings.forEach(h => { if (h.weight != null) h.weight = h.weight * 100; });
  // Merge duplicate tickers.
  const merged = new Map<string, HoldingInput>();
  for (const h of holdings) {
    const p = merged.get(h.ticker);
    if (!p) merged.set(h.ticker, { ...h });
    else {
      if (h.weight != null) p.weight = (p.weight ?? 0) + h.weight;
      if (h.value != null) p.value = (p.value ?? 0) + h.value;
    }
  }
  u.holdings = Array.from(merged.values());
  u.holdingsMode = u.holdings.length ? 'replace' : 'none';
  const vsum = u.holdings.reduce((s, h) => s + (h.value ?? 0), 0);
  if (vsum > 0 && u.holdings.every(h => h.value != null)) u.aum = vsum;
  if (skipped) u.notes.push(`Skipped ${skipped} row${skipped > 1 ? 's' : ''} without a recognizable ticker.`);
  if (iShares >= 0 && iPrice < 0 && iValue < 0 && iWeight < 0) u.notes.push('The file has share counts but no prices or values, so weights could not be computed.');
  u.understood.push({ label: 'From file', value: `${u.holdings.length} holdings` });
  if (u.aum != null) u.understood.push({ label: 'Total value', value: formatMoney(u.aum) });
  return u;
}

/** True if the update contains anything usable. */
export function hasContent(u: SpecUpdate): boolean {
  return u.holdings.length > 0 || u.sleeves.length > 0 || u.aum != null || u.styles.length > 0 || Object.keys(u.styleMix).length > 0 || u.drawdownLimit != null || u.remove.length > 0;
}

export function describeTicker(t: string): string | null {
  const s = lookupSecurity(t);
  if (s) return s.name;
  const f = lookupFund(t);
  return f ? f.name : null;
}
