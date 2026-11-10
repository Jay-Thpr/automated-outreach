/**
 * Shared types for the Atlas portfolio intelligence engine.
 *
 * Provenance is a first-class concept: every portfolio records where its holdings
 * came from, and every finding records whether it is specific to the user's portfolio
 * or illustrative (derived from a proxy or from assumptions).
 */

export type Factor = 'growth' | 'rates' | 'credit' | 'oil';
export type FactorLoadings = Record<Factor, number>;

/** A hypothetical market shock expressed in factor units (see FACTOR_META for units). */
export type Shock = Record<Factor, number>;

export type AssetKind = 'equity' | 'etf' | 'bond' | 'cash' | 'commodity' | 'crypto';

/** Where a holding's model parameters came from. */
export type Classification =
  | 'reference' // in Atlas's reference set with hand-specified parameters
  | 'sector-proxy' // unknown ticker modeled with a sector archetype (sector stated by user or inferred by AI)
  | 'unclassified'; // unknown ticker, modeled as a broad-equity proxy

export type Holding = {
  ticker: string;
  name: string;
  weight: number; // percent of portfolio, 0-100
  sector: string;
  kind: AssetKind;
  region: string;
  factors: FactorLoadings;
  vol: number; // modeled annualized volatility, percent
  themes: string[];
  classification: Classification;
  weightSource: 'stated' | 'from-value' | 'assumed-equal' | 'proxy' | 'example';
};

export type PortfolioSource = 'user' | 'proxy' | 'example';

export type Assumption = {
  id: string;
  text: string;
  /** How much the assumption could move the results. */
  severity: 'high' | 'medium' | 'low';
};

export type Portfolio = {
  name: string;
  description: string;
  source: PortfolioSource;
  value: number | null; // AUM in dollars; null when unknown
  valueSource: 'stated' | 'file' | 'example' | null;
  holdings: Holding[];
  assumptions: Assumption[];
  drawdownLimit: number | null; // percent, positive number
  styles: StyleKey[];
};

export type StyleKey =
  | 'tech'
  | 'semis'
  | 'growth'
  | 'broad'
  | 'dividend'
  | 'value'
  | 'balanced'
  | 'bonds'
  | 'credit'
  | 'energy'
  | 'transition'
  | 'healthcare'
  | 'financials'
  | 'international'
  | 'emerging'
  | 'realestate'
  | 'crypto'
  | 'gold'
  | 'cash';

/** A holding as entered by the user (before resolution against the reference set). */
export type HoldingInput = {
  ticker: string;
  weight?: number | null; // percent
  value?: number | null; // dollars
  name?: string;
  sectorHint?: string; // archetype key, e.g. 'semis', supplied by the user or AI
};

/** Everything the user has told Atlas. This is the persisted state that drives the analysis. */
export type PortfolioSpec = {
  description: string; // free text descriptions accumulated so far
  aum: number | null;
  aumSource: 'stated' | 'file' | 'example' | null;
  holdings: HoldingInput[];
  styles: StyleKey[];
  styleMix: Partial<Record<StyleKey, number>>; // explicit sleeve weights, e.g. 60% equity / 40% bonds
  drawdownLimit: number | null;
  exampleId: string | null;
  holdingCountHint: number | null;
  /** Sleeves mentioned without specific positions ("rest in index funds", "plus some bonds"). */
  sleeves: StyleKey[];
};

/** A structured change extracted from the user's words, a file or a form. */
export type SpecUpdate = {
  holdingsMode: 'replace' | 'merge' | 'none';
  holdings: HoldingInput[];
  remove: string[];
  aum: number | null;
  styles: StyleKey[];
  styleMix: Partial<Record<StyleKey, number>>;
  drawdownLimit: number | null;
  holdingCountHint: number | null;
  sleeves: StyleKey[];
  /** Human-readable list of what was understood, for the live preview. */
  understood: { label: string; value: string }[];
  notes: string[];
};

/**
 * portfolio    – computed from holdings the user supplied
 * assumption   – computed from user holdings, but sensitive to an assumption Atlas made (e.g. equal weights)
 * illustrative – computed from a representative proxy, not the user's holdings
 * example      – computed from a built-in example portfolio
 */
export type Basis = 'portfolio' | 'assumption' | 'illustrative' | 'example';

export type Finding = {
  id: string;
  kind: 'concentration' | 'risk' | 'factor' | 'overlap' | 'theme' | 'stress' | 'hedge' | 'whatif' | 'drawdown' | 'data';
  title: string;
  detail: string;
  metric?: { label: string; value: string };
  basis: Basis;
  surprise: number; // 0..1, used to choose the headline
  followup: string; // question to investigate further
};

export type UnlockInput = 'holdings' | 'weights' | 'aum' | 'drawdown' | 'sectors';

export type Unlock = {
  id: string;
  input: UnlockInput;
  title: string;
  why: string;
  unlocks: string;
  priority: number;
};

export type TraceStep = {
  id: string;
  tool: string;
  title: string;
  reason: string;
  result: string;
  status: 'done' | 'skipped';
  by: 'planner' | 'ai';
};
