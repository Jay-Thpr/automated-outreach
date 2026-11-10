/**
 * Atlas reference set.
 *
 * IMPORTANT: Every parameter in this file is a hand-authored, ILLUSTRATIVE model input.
 * Factor loadings, volatilities and ETF constituent weights are approximations chosen to be
 * directionally reasonable for a demo. They are NOT estimated from market data, NOT live,
 * and NOT sourced from any data vendor. ETF compositions are approximate static snapshots.
 *
 * Factor units (what a loading of 1.0 means):
 *   growth : % return per +1% move in a broad equity growth/tech-cycle factor
 *   rates  : % return per +100bp move in government bond yields
 *   credit : % return per +100bp widening in investment-grade-equivalent credit spreads
 *   oil    : % return per +1% move in the oil price
 */
import type { AssetKind, Factor, FactorLoadings, StyleKey } from './types';

export const FACTORS: Factor[] = ['growth', 'rates', 'credit', 'oil'];

export const FACTOR_META: Record<Factor, { label: string; short: string; unit: string; vol: number; shockUnit: 'pct' | 'bp' }> = {
  growth: { label: 'Equity growth / tech cycle', short: 'Growth', unit: 'per 1% factor move', vol: 12.5, shockUnit: 'pct' },
  rates: { label: 'Interest rates', short: 'Rates', unit: 'per +100bp yields', vol: 0.9, shockUnit: 'bp' },
  credit: { label: 'Credit spreads', short: 'Credit', unit: 'per +100bp spreads', vol: 0.45, shockUnit: 'bp' },
  oil: { label: 'Oil price', short: 'Oil', unit: 'per 1% oil move', vol: 32, shockUnit: 'pct' },
};

/** Illustrative factor correlation matrix (symmetric). */
export const FACTOR_CORR: Record<Factor, Record<Factor, number>> = {
  growth: { growth: 1, rates: -0.1, credit: -0.6, oil: 0.3 },
  rates: { growth: -0.1, rates: 1, credit: -0.3, oil: 0.2 },
  credit: { growth: -0.6, rates: -0.3, credit: 1, oil: -0.2 },
  oil: { growth: 0.3, rates: 0.2, credit: -0.2, oil: 1 },
};

const L = (growth: number, rates: number, credit: number, oil: number): FactorLoadings => ({ growth, rates, credit, oil });

export type Archetype = {
  key: string;
  sector: string;
  kind: AssetKind;
  factors: FactorLoadings;
  vol: number;
  themes: string[];
  /** Minimum idiosyncratic share of volatility (diversified funds are lower). */
  idioFloor: number;
};

export const ARCHETYPES: Record<string, Archetype> = {
  semis: { key: 'semis', sector: 'Semiconductors', kind: 'equity', factors: L(1.75, -7, -10, 0.02), vol: 42, themes: ['ai-capex', 'taiwan-fab'], idioFloor: 0.3 },
  software: { key: 'software', sector: 'Software', kind: 'equity', factors: L(1.25, -8, -7, 0), vol: 28, themes: [], idioFloor: 0.3 },
  internet: { key: 'internet', sector: 'Internet & Media', kind: 'equity', factors: L(1.3, -6, -8, 0), vol: 32, themes: ['ad-cycle'], idioFloor: 0.3 },
  hardware: { key: 'hardware', sector: 'Tech Hardware', kind: 'equity', factors: L(1.15, -5, -6, 0), vol: 27, themes: [], idioFloor: 0.3 },
  discretionary: { key: 'discretionary', sector: 'Consumer Discretionary', kind: 'equity', factors: L(1.1, -5, -9, -0.03), vol: 28, themes: [], idioFloor: 0.3 },
  staples: { key: 'staples', sector: 'Consumer Staples', kind: 'equity', factors: L(0.5, -4, -3, -0.02), vol: 16, themes: [], idioFloor: 0.3 },
  pharma: { key: 'pharma', sector: 'Healthcare', kind: 'equity', factors: L(0.55, -3, -3, 0), vol: 20, themes: [], idioFloor: 0.3 },
  biotech: { key: 'biotech', sector: 'Biotech', kind: 'equity', factors: L(1.0, -9, -8, 0), vol: 36, themes: [], idioFloor: 0.3 },
  banks: { key: 'banks', sector: 'Banks', kind: 'equity', factors: L(1.1, 3, -14, 0.03), vol: 26, themes: ['consumer-credit'], idioFloor: 0.3 },
  finserv: { key: 'finserv', sector: 'Financial Services', kind: 'equity', factors: L(1.0, -3, -9, 0), vol: 22, themes: ['consumer-credit'], idioFloor: 0.3 },
  energy: { key: 'energy', sector: 'Energy', kind: 'equity', factors: L(0.7, 1, -6, 0.4), vol: 30, themes: ['oil-price'], idioFloor: 0.3 },
  utilities: { key: 'utilities', sector: 'Utilities', kind: 'equity', factors: L(0.4, -8, -4, 0.03), vol: 18, themes: [], idioFloor: 0.3 },
  reit: { key: 'reit', sector: 'Real Estate', kind: 'equity', factors: L(0.8, -10, -9, 0), vol: 24, themes: [], idioFloor: 0.3 },
  industrials: { key: 'industrials', sector: 'Industrials', kind: 'equity', factors: L(1.0, -4, -8, 0.02), vol: 24, themes: [], idioFloor: 0.3 },
  materials: { key: 'materials', sector: 'Materials', kind: 'equity', factors: L(1.0, -2, -8, 0.1), vol: 27, themes: [], idioFloor: 0.3 },
  telecom: { key: 'telecom', sector: 'Telecom', kind: 'equity', factors: L(0.5, -5, -4, 0), vol: 19, themes: [], idioFloor: 0.3 },
  ev: { key: 'ev', sector: 'Autos / EV', kind: 'equity', factors: L(2.0, -10, -12, -0.05), vol: 58, themes: ['china-demand'], idioFloor: 0.3 },
  cleanenergy: { key: 'cleanenergy', sector: 'Clean Energy', kind: 'equity', factors: L(1.5, -12, -12, 0.1), vol: 50, themes: [], idioFloor: 0.3 },
  broadequity: { key: 'broadequity', sector: 'Diversified Equity', kind: 'equity', factors: L(1.0, -4.5, -8, 0.05), vol: 17, themes: [], idioFloor: 0.1 },
  intl: { key: 'intl', sector: 'International Equity', kind: 'etf', factors: L(0.9, -3, -7, 0.05), vol: 18, themes: [], idioFloor: 0.15 },
  em: { key: 'em', sector: 'Emerging Markets', kind: 'etf', factors: L(1.1, -5, -11, 0.08), vol: 22, themes: ['china-demand'], idioFloor: 0.15 },
  treasury: { key: 'treasury', sector: 'Government Bonds', kind: 'bond', factors: L(-0.05, -7, 0, 0), vol: 6.5, themes: [], idioFloor: 0.1 },
  longtreasury: { key: 'longtreasury', sector: 'Long Government Bonds', kind: 'bond', factors: L(-0.1, -17, 0, 0), vol: 16, themes: [], idioFloor: 0.1 },
  shorttreasury: { key: 'shorttreasury', sector: 'Short-Term Bonds', kind: 'bond', factors: L(0, -1.9, 0, 0), vol: 1.8, themes: [], idioFloor: 0.2 },
  aggbond: { key: 'aggbond', sector: 'Core Bonds', kind: 'bond', factors: L(0, -6, -2, 0), vol: 6, themes: [], idioFloor: 0.1 },
  tips: { key: 'tips', sector: 'Inflation-Linked Bonds', kind: 'bond', factors: L(0, -6.5, 0, 0.03), vol: 6, themes: [], idioFloor: 0.15 },
  igcredit: { key: 'igcredit', sector: 'Investment-Grade Credit', kind: 'bond', factors: L(0.05, -7, -7, 0), vol: 8.5, themes: [], idioFloor: 0.1 },
  hycredit: { key: 'hycredit', sector: 'High-Yield Credit', kind: 'bond', factors: L(0.35, -3.5, -11, 0.03), vol: 10, themes: ['consumer-credit'], idioFloor: 0.15 },
  gold: { key: 'gold', sector: 'Gold', kind: 'commodity', factors: L(0.1, -6, 1, 0.1), vol: 16, themes: [], idioFloor: 0.5 },
  commodities: { key: 'commodities', sector: 'Commodities', kind: 'commodity', factors: L(0.4, 0, -3, 0.5), vol: 18, themes: ['oil-price'], idioFloor: 0.3 },
  crypto: { key: 'crypto', sector: 'Digital Assets', kind: 'crypto', factors: L(1.8, -12, -15, 0), vol: 60, themes: ['speculative-liquidity'], idioFloor: 0.4 },
  cash: { key: 'cash', sector: 'Cash', kind: 'cash', factors: L(0, 0, 0, 0), vol: 0.5, themes: [], idioFloor: 1 },
};

export type Security = {
  ticker: string;
  name: string;
  archetype: string;
  region?: string;
  themes?: string[];
  /** Optional overrides of the archetype parameters. */
  factors?: Partial<FactorLoadings>;
  vol?: number;
};

const S = (ticker: string, name: string, archetype: string, themes: string[] = [], extra: Partial<Security> = {}): Security => ({ ticker, name, archetype, themes, ...extra });

export const SECURITIES: Security[] = [
  // Semiconductors & AI infrastructure
  S('NVDA', 'NVIDIA', 'semis', ['ai-capex', 'taiwan-fab', 'megacap-crowding', 'china-demand'], { factors: { growth: 1.95 }, vol: 48 }),
  S('AVGO', 'Broadcom', 'semis', ['ai-capex', 'taiwan-fab', 'megacap-crowding'], { vol: 40 }),
  S('AMD', 'Advanced Micro Devices', 'semis', ['ai-capex', 'taiwan-fab'], { factors: { growth: 1.9 }, vol: 50 }),
  S('TSM', 'Taiwan Semiconductor', 'semis', ['ai-capex', 'taiwan-fab'], { region: 'Taiwan', vol: 36 }),
  S('ASML', 'ASML Holding', 'semis', ['ai-capex', 'taiwan-fab'], { region: 'Europe', vol: 38 }),
  S('MU', 'Micron Technology', 'semis', ['ai-capex'], { vol: 46 }),
  S('MRVL', 'Marvell Technology', 'semis', ['ai-capex', 'taiwan-fab'], { vol: 52 }),
  S('QCOM', 'Qualcomm', 'semis', ['taiwan-fab', 'china-demand'], { vol: 34 }),
  S('INTC', 'Intel', 'semis', [], { vol: 44 }),
  S('ARM', 'Arm Holdings', 'semis', ['ai-capex', 'taiwan-fab'], { region: 'UK', vol: 58 }),
  S('TXN', 'Texas Instruments', 'semis', ['china-demand'], { factors: { growth: 1.2 }, vol: 28 }),
  S('ANET', 'Arista Networks', 'hardware', ['ai-capex'], { factors: { growth: 1.6 }, vol: 42 }),
  S('SMCI', 'Super Micro Computer', 'hardware', ['ai-capex', 'taiwan-fab'], { factors: { growth: 2.1 }, vol: 75 }),
  S('DELL', 'Dell Technologies', 'hardware', ['ai-capex'], { factors: { growth: 1.4 }, vol: 40 }),
  S('VRT', 'Vertiv', 'industrials', ['ai-capex', 'datacenter-power'], { factors: { growth: 1.6 }, vol: 48 }),
  // Mega-cap platforms
  S('AAPL', 'Apple', 'hardware', ['taiwan-fab', 'china-demand', 'megacap-crowding'], { vol: 26 }),
  S('MSFT', 'Microsoft', 'software', ['ai-capex', 'megacap-crowding'], { vol: 24 }),
  S('GOOGL', 'Alphabet', 'internet', ['ai-capex', 'ad-cycle', 'megacap-crowding'], { vol: 30 }),
  S('AMZN', 'Amazon', 'discretionary', ['ai-capex', 'megacap-crowding', 'ad-cycle'], { factors: { growth: 1.3 }, vol: 31 }),
  S('META', 'Meta Platforms', 'internet', ['ai-capex', 'ad-cycle', 'megacap-crowding'], { factors: { growth: 1.45 }, vol: 36 }),
  S('TSLA', 'Tesla', 'ev', ['china-demand', 'megacap-crowding'], { vol: 58 }),
  S('NFLX', 'Netflix', 'internet', [], { vol: 34 }),
  S('ORCL', 'Oracle', 'software', ['ai-capex'], { factors: { growth: 1.35 }, vol: 34 }),
  S('CRM', 'Salesforce', 'software', [], { vol: 30 }),
  S('ADBE', 'Adobe', 'software', [], { vol: 30 }),
  S('NOW', 'ServiceNow', 'software', [], { factors: { growth: 1.4 }, vol: 34 }),
  S('PLTR', 'Palantir', 'software', ['speculative-liquidity'], { factors: { growth: 2.0 }, vol: 65 }),
  S('SNOW', 'Snowflake', 'software', [], { factors: { growth: 1.8 }, vol: 55 }),
  S('IBM', 'IBM', 'software', [], { factors: { growth: 0.8 }, vol: 22 }),
  S('TTD', 'The Trade Desk', 'internet', ['ad-cycle'], { factors: { growth: 1.8 }, vol: 55 }),
  S('UBER', 'Uber', 'internet', [], { factors: { growth: 1.4 }, vol: 38 }),
  S('SHOP', 'Shopify', 'software', [], { factors: { growth: 1.9 }, vol: 55 }),
  S('COIN', 'Coinbase', 'finserv', ['speculative-liquidity'], { factors: { growth: 2.2, credit: -14 }, vol: 75 }),
  S('MSTR', 'MicroStrategy', 'software', ['speculative-liquidity'], { factors: { growth: 2.4, credit: -15 }, vol: 90 }),
  // Consumer
  S('HD', 'Home Depot', 'discretionary', [], { factors: { rates: -7 }, vol: 24 }),
  S('NKE', 'Nike', 'discretionary', ['china-demand'], { vol: 30 }),
  S('MCD', "McDonald's", 'staples', [], { vol: 18 }),
  S('SBUX', 'Starbucks', 'discretionary', ['china-demand'], { vol: 30 }),
  S('COST', 'Costco', 'staples', [], { factors: { growth: 0.8 }, vol: 20 }),
  S('WMT', 'Walmart', 'staples', [], { vol: 18 }),
  S('PG', 'Procter & Gamble', 'staples', [], { vol: 16 }),
  S('KO', 'Coca-Cola', 'staples', [], { vol: 15 }),
  S('PEP', 'PepsiCo', 'staples', [], { vol: 16 }),
  S('PM', 'Philip Morris', 'staples', [], { vol: 20 }),
  // Healthcare
  S('LLY', 'Eli Lilly', 'pharma', ['glp1'], { factors: { growth: 0.9 }, vol: 32 }),
  S('NVO', 'Novo Nordisk', 'pharma', ['glp1'], { region: 'Europe', factors: { growth: 0.8 }, vol: 34 }),
  S('UNH', 'UnitedHealth', 'pharma', [], { vol: 26 }),
  S('JNJ', 'Johnson & Johnson', 'pharma', [], { vol: 16 }),
  S('ABBV', 'AbbVie', 'pharma', [], { vol: 22 }),
  S('MRK', 'Merck', 'pharma', [], { vol: 22 }),
  S('PFE', 'Pfizer', 'pharma', [], { vol: 24 }),
  S('TMO', 'Thermo Fisher', 'pharma', [], { factors: { growth: 0.9 }, vol: 24 }),
  S('ISRG', 'Intuitive Surgical', 'pharma', [], { factors: { growth: 1.2 }, vol: 30 }),
  S('VRTX', 'Vertex Pharmaceuticals', 'biotech', [], { factors: { growth: 0.7 }, vol: 26 }),
  S('AMGN', 'Amgen', 'biotech', [], { factors: { growth: 0.6, rates: -5 }, vol: 22 }),
  // Financials
  S('JPM', 'JPMorgan Chase', 'banks', ['consumer-credit'], { vol: 24 }),
  S('BAC', 'Bank of America', 'banks', ['consumer-credit'], { vol: 28 }),
  S('WFC', 'Wells Fargo', 'banks', ['consumer-credit'], { vol: 28 }),
  S('C', 'Citigroup', 'banks', ['consumer-credit'], { vol: 30 }),
  S('GS', 'Goldman Sachs', 'banks', [], { factors: { growth: 1.3 }, vol: 28 }),
  S('MS', 'Morgan Stanley', 'banks', [], { factors: { growth: 1.3 }, vol: 28 }),
  S('COF', 'Capital One', 'banks', ['consumer-credit'], { vol: 34 }),
  S('V', 'Visa', 'finserv', ['consumer-credit'], { factors: { growth: 0.9 }, vol: 20 }),
  S('MA', 'Mastercard', 'finserv', ['consumer-credit'], { factors: { growth: 0.95 }, vol: 21 }),
  S('AXP', 'American Express', 'finserv', ['consumer-credit'], { vol: 26 }),
  S('PYPL', 'PayPal', 'finserv', ['consumer-credit'], { factors: { growth: 1.3 }, vol: 38 }),
  S('BRK.B', 'Berkshire Hathaway', 'finserv', [], { factors: { growth: 0.75 }, vol: 17 }),
  S('BLK', 'BlackRock', 'finserv', [], { factors: { growth: 1.2 }, vol: 26 }),
  // Energy & power
  S('XOM', 'Exxon Mobil', 'energy', ['oil-price'], { vol: 26 }),
  S('CVX', 'Chevron', 'energy', ['oil-price'], { vol: 26 }),
  S('COP', 'ConocoPhillips', 'energy', ['oil-price'], { factors: { oil: 0.5 }, vol: 32 }),
  S('OXY', 'Occidental Petroleum', 'energy', ['oil-price'], { factors: { oil: 0.55 }, vol: 36 }),
  S('SLB', 'Schlumberger', 'energy', ['oil-price'], { vol: 34 }),
  S('NEE', 'NextEra Energy', 'utilities', ['datacenter-power'], { factors: { rates: -10 }, vol: 24 }),
  S('CEG', 'Constellation Energy', 'utilities', ['datacenter-power', 'ai-capex'], { factors: { growth: 1.3 }, vol: 45 }),
  S('VST', 'Vistra', 'utilities', ['datacenter-power', 'ai-capex'], { factors: { growth: 1.4 }, vol: 50 }),
  S('DUK', 'Duke Energy', 'utilities', [], { vol: 17 }),
  S('SO', 'Southern Company', 'utilities', ['datacenter-power'], { vol: 17 }),
  S('ENPH', 'Enphase Energy', 'cleanenergy', [], { vol: 62 }),
  S('FSLR', 'First Solar', 'cleanenergy', [], { vol: 50 }),
  S('GEV', 'GE Vernova', 'industrials', ['datacenter-power'], { factors: { growth: 1.4 }, vol: 42 }),
  S('ETN', 'Eaton', 'industrials', ['datacenter-power', 'ai-capex'], { factors: { growth: 1.3 }, vol: 30 }),
  // Industrials, materials, telecom, real estate
  S('CAT', 'Caterpillar', 'industrials', ['china-demand'], { vol: 28 }),
  S('DE', 'Deere', 'industrials', [], { vol: 26 }),
  S('BA', 'Boeing', 'industrials', [], { factors: { oil: -0.05 }, vol: 38 }),
  S('GE', 'GE Aerospace', 'industrials', [], { vol: 30 }),
  S('HON', 'Honeywell', 'industrials', [], { vol: 20 }),
  S('UNP', 'Union Pacific', 'industrials', [], { vol: 22 }),
  S('LMT', 'Lockheed Martin', 'industrials', [], { factors: { growth: 0.5 }, vol: 20 }),
  S('LIN', 'Linde', 'materials', [], { factors: { growth: 0.8 }, vol: 20 }),
  S('FCX', 'Freeport-McMoRan', 'materials', ['china-demand'], { factors: { growth: 1.4 }, vol: 42 }),
  S('ALB', 'Albemarle', 'materials', ['china-demand'], { factors: { growth: 1.5 }, vol: 52 }),
  S('VZ', 'Verizon', 'telecom', [], { vol: 18 }),
  S('T', 'AT&T', 'telecom', [], { vol: 20 }),
  S('TMUS', 'T-Mobile US', 'telecom', [], { vol: 20 }),
  S('PLD', 'Prologis', 'reit', [], { vol: 28 }),
  S('AMT', 'American Tower', 'reit', [], { vol: 26 }),
  S('EQIX', 'Equinix', 'reit', ['ai-capex'], { vol: 28 }),
  S('O', 'Realty Income', 'reit', [], { factors: { growth: 0.6 }, vol: 20 }),
  // International ADRs
  S('BABA', 'Alibaba', 'internet', ['china-demand'], { region: 'China', vol: 45 }),
  S('TM', 'Toyota', 'discretionary', [], { region: 'Japan', vol: 24 }),
  S('SAP', 'SAP', 'software', [], { region: 'Europe', vol: 26 }),
  // Single-asset funds
  S('IBIT', 'iShares Bitcoin Trust', 'crypto', ['speculative-liquidity']),
  S('GLD', 'SPDR Gold Shares', 'gold'),
  S('IAU', 'iShares Gold Trust', 'gold'),
  S('TLT', '20+ Year Treasury Bond ETF', 'longtreasury'),
  S('IEF', '7-10 Year Treasury Bond ETF', 'treasury'),
  S('SHY', '1-3 Year Treasury Bond ETF', 'shorttreasury'),
  S('BIL', '1-3 Month T-Bill ETF', 'cash'),
  S('SGOV', '0-3 Month Treasury ETF', 'cash'),
  S('AGG', 'Core US Aggregate Bond ETF', 'aggbond'),
  S('BND', 'Total Bond Market ETF', 'aggbond'),
  S('TIP', 'TIPS Bond ETF', 'tips'),
  S('LQD', 'Investment Grade Corporate Bond ETF', 'igcredit'),
  S('HYG', 'High Yield Corporate Bond ETF', 'hycredit'),
  S('JNK', 'High Yield Bond ETF', 'hycredit'),
  S('VEA', 'Developed Markets ETF', 'intl', [], { region: 'Intl developed' }),
  S('EFA', 'MSCI EAFE ETF', 'intl', [], { region: 'Intl developed' }),
  S('VXUS', 'Total International Stock ETF', 'intl', [], { region: 'Intl' }),
  S('EEM', 'Emerging Markets ETF', 'em', ['china-demand'], { region: 'Emerging' }),
  S('VWO', 'Emerging Markets Stock ETF', 'em', ['china-demand'], { region: 'Emerging' }),
  S('FXI', 'China Large-Cap ETF', 'em', ['china-demand'], { region: 'China', vol: 32 }),
  S('DBC', 'Commodity Index Fund', 'commodities'),
  S('CASH', 'Cash', 'cash'),
];

/**
 * Funds with an approximate, static look-through composition (top constituents only).
 * `other` is the remaining weight, modeled with the given archetype. ILLUSTRATIVE SNAPSHOTS.
 */
export type FundDef = {
  ticker: string;
  name: string;
  sector: string;
  vol: number;
  constituents: [string, number][]; // percent of fund
  other: { archetype: string; label: string };
  themes?: string[];
};

export const FUNDS: FundDef[] = [
  { ticker: 'SPY', name: 'S&P 500 ETF', sector: 'US Large Cap Index', vol: 16, other: { archetype: 'broadequity', label: 'Other S&P 500 constituents' }, constituents: [['NVDA', 7.2], ['MSFT', 6.6], ['AAPL', 6.3], ['AMZN', 3.9], ['META', 2.8], ['GOOGL', 3.9], ['AVGO', 2.4], ['TSLA', 1.9], ['BRK.B', 1.7], ['JPM', 1.5], ['LLY', 1.3], ['V', 1.1], ['XOM', 0.9], ['UNH', 0.8], ['MA', 0.8], ['COST', 0.8], ['NFLX', 0.8], ['WMT', 0.8], ['PG', 0.7], ['JNJ', 0.7], ['HD', 0.7], ['ORCL', 0.7]] },
  { ticker: 'VOO', name: 'S&P 500 Index ETF', sector: 'US Large Cap Index', vol: 16, other: { archetype: 'broadequity', label: 'Other S&P 500 constituents' }, constituents: [] /* filled from SPY below */ },
  { ticker: 'IVV', name: 'Core S&P 500 ETF', sector: 'US Large Cap Index', vol: 16, other: { archetype: 'broadequity', label: 'Other S&P 500 constituents' }, constituents: [] },
  { ticker: 'VTI', name: 'Total Stock Market ETF', sector: 'US Total Market Index', vol: 16.5, other: { archetype: 'broadequity', label: 'Other US stocks' }, constituents: [['NVDA', 6.2], ['MSFT', 5.7], ['AAPL', 5.4], ['AMZN', 3.4], ['META', 2.4], ['GOOGL', 3.4], ['AVGO', 2.0], ['TSLA', 1.6], ['BRK.B', 1.4], ['JPM', 1.3], ['LLY', 1.1], ['V', 0.9], ['XOM', 0.8]] },
  { ticker: 'QQQ', name: 'Nasdaq-100 ETF', sector: 'US Growth Index', vol: 21, other: { archetype: 'software', label: 'Other Nasdaq-100 constituents' }, constituents: [['NVDA', 9.0], ['MSFT', 8.4], ['AAPL', 7.8], ['AMZN', 5.6], ['AVGO', 5.2], ['META', 3.8], ['GOOGL', 5.2], ['TSLA', 3.0], ['NFLX', 2.4], ['COST', 2.6], ['PLTR', 1.8], ['AMD', 1.6], ['CSCO', 1.4], ['TMUS', 1.3], ['ASML', 1.2], ['QCOM', 1.1], ['INTU', 1.1], ['ADBE', 1.0], ['TXN', 1.0]] },
  { ticker: 'XLK', name: 'Technology Select Sector ETF', sector: 'US Technology Sector', vol: 24, other: { archetype: 'software', label: 'Other technology constituents' }, constituents: [['NVDA', 14.5], ['MSFT', 12.5], ['AAPL', 12.0], ['AVGO', 5.5], ['ORCL', 3.5], ['PLTR', 3.0], ['CRM', 2.5], ['AMD', 2.5], ['IBM', 2.2], ['CSCO', 2.2], ['NOW', 2.0], ['ADBE', 1.8], ['QCOM', 1.7], ['TXN', 1.6], ['MU', 1.6], ['ANET', 1.4]] },
  { ticker: 'SMH', name: 'Semiconductor ETF', sector: 'Semiconductor Index', vol: 34, other: { archetype: 'semis', label: 'Other semiconductor constituents' }, constituents: [['NVDA', 20.0], ['TSM', 11.0], ['AVGO', 8.0], ['AMD', 5.0], ['ASML', 4.6], ['MU', 4.5], ['QCOM', 4.2], ['TXN', 4.0], ['INTC', 3.8], ['ARM', 2.2], ['MRVL', 2.0]] },
  { ticker: 'SOXX', name: 'Semiconductor ETF (iShares)', sector: 'Semiconductor Index', vol: 34, other: { archetype: 'semis', label: 'Other semiconductor constituents' }, constituents: [['NVDA', 9.0], ['AVGO', 8.5], ['AMD', 8.0], ['QCOM', 6.0], ['TXN', 5.5], ['MU', 5.5], ['INTC', 4.5], ['MRVL', 4.0], ['TSM', 4.0], ['ASML', 3.5]] },
  { ticker: 'ARKK', name: 'Innovation ETF', sector: 'Disruptive Growth', vol: 48, other: { archetype: 'software', label: 'Other innovation holdings' }, constituents: [['TSLA', 11.0], ['COIN', 9.0], ['ROKU', 7.0], ['PLTR', 6.0], ['SHOP', 5.0], ['AMD', 3.0], ['CRSP', 4.0]], themes: ['speculative-liquidity'] },
  { ticker: 'XLE', name: 'Energy Select Sector ETF', sector: 'US Energy Sector', vol: 27, other: { archetype: 'energy', label: 'Other energy constituents' }, constituents: [['XOM', 23.0], ['CVX', 16.0], ['COP', 7.5], ['SLB', 4.5], ['OXY', 3.5]] },
  { ticker: 'XLF', name: 'Financial Select Sector ETF', sector: 'US Financials Sector', vol: 21, other: { archetype: 'finserv', label: 'Other financial constituents' }, constituents: [['BRK.B', 12.5], ['JPM', 10.5], ['V', 7.5], ['MA', 6.0], ['BAC', 4.3], ['WFC', 3.7], ['GS', 2.8], ['AXP', 2.4], ['MS', 2.3]] },
  { ticker: 'XLV', name: 'Health Care Select Sector ETF', sector: 'US Healthcare Sector', vol: 16, other: { archetype: 'pharma', label: 'Other healthcare constituents' }, constituents: [['LLY', 12.5], ['UNH', 7.0], ['JNJ', 7.0], ['ABBV', 6.0], ['MRK', 4.0], ['TMO', 3.6], ['ISRG', 3.4], ['AMGN', 3.0], ['PFE', 2.5]] },
  { ticker: 'XLU', name: 'Utilities Select Sector ETF', sector: 'US Utilities Sector', vol: 17, other: { archetype: 'utilities', label: 'Other utility constituents' }, constituents: [['NEE', 12.0], ['SO', 8.0], ['DUK', 7.5], ['CEG', 7.0], ['VST', 5.0]] },
  { ticker: 'VNQ', name: 'Real Estate ETF', sector: 'US REITs', vol: 22, other: { archetype: 'reit', label: 'Other REITs' }, constituents: [['PLD', 7.0], ['AMT', 6.0], ['EQIX', 5.0], ['O', 3.5]] },
  { ticker: 'SCHD', name: 'US Dividend Equity ETF', sector: 'US Dividend Equity', vol: 15, other: { archetype: 'staples', label: 'Other dividend payers' }, constituents: [['ABBV', 4.2], ['KO', 4.0], ['PEP', 4.0], ['CVX', 4.0], ['VZ', 4.0], ['MRK', 3.8], ['AMGN', 3.8], ['HD', 3.8], ['TXN', 3.8], ['COP', 3.6]] },
  { ticker: 'VIG', name: 'Dividend Appreciation ETF', sector: 'US Dividend Growth', vol: 15, other: { archetype: 'broadequity', label: 'Other dividend growers' }, constituents: [['AVGO', 5.5], ['MSFT', 4.5], ['AAPL', 4.0], ['JPM', 3.8], ['LLY', 3.0], ['V', 2.8], ['XOM', 2.6], ['MA', 2.4], ['COST', 2.2], ['WMT', 2.1]] },
  { ticker: 'ICLN', name: 'Global Clean Energy ETF', sector: 'Clean Energy Index', vol: 32, other: { archetype: 'cleanenergy', label: 'Other clean energy constituents' }, constituents: [['FSLR', 9.0], ['ENPH', 6.0], ['NEE', 6.0], ['VST', 3.0], ['CEG', 3.0]] },
  { ticker: 'TAN', name: 'Solar ETF', sector: 'Solar Index', vol: 45, other: { archetype: 'cleanenergy', label: 'Other solar constituents' }, constituents: [['FSLR', 11.0], ['ENPH', 9.0], ['NEE', 3.0]] },
  { ticker: 'GRID', name: 'Smart Grid Infrastructure ETF', sector: 'Grid Infrastructure', vol: 24, other: { archetype: 'industrials', label: 'Other grid infrastructure constituents' }, constituents: [['ETN', 8.0], ['GEV', 6.0], ['VRT', 4.0], ['NEE', 3.0]], themes: ['datacenter-power'] },
  { ticker: 'LIT', name: 'Lithium & Battery Tech ETF', sector: 'Battery Supply Chain', vol: 36, other: { archetype: 'materials', label: 'Other battery supply-chain constituents' }, constituents: [['ALB', 9.0], ['TSLA', 5.0]], themes: ['china-demand'] },
  { ticker: 'VT', name: 'Total World Stock ETF', sector: 'Global Equity Index', vol: 15.5, other: { archetype: 'broadequity', label: 'Other global stocks' }, constituents: [['NVDA', 4.0], ['MSFT', 3.6], ['AAPL', 3.5], ['AMZN', 2.2], ['META', 1.6], ['GOOGL', 2.1], ['AVGO', 1.3], ['TSM', 1.0], ['TSLA', 1.0]] },
  { ticker: 'ACWI', name: 'All Country World Index ETF', sector: 'Global Equity Index', vol: 15.5, other: { archetype: 'broadequity', label: 'Other global stocks' }, constituents: [['NVDA', 4.5], ['MSFT', 4.0], ['AAPL', 3.9], ['AMZN', 2.4], ['META', 1.7], ['GOOGL', 2.3], ['AVGO', 1.4], ['TSM', 1.1], ['TSLA', 1.1]] },
];
// Mirror S&P 500 trackers.
const spy = FUNDS.find(f => f.ticker === 'SPY')!;
for (const f of FUNDS) if ((f.ticker === 'VOO' || f.ticker === 'IVV') && f.constituents.length === 0) f.constituents = spy.constituents;

// A few constituents referenced only via funds.
SECURITIES.push(
  S('CSCO', 'Cisco Systems', 'hardware', ['ai-capex'], { factors: { growth: 0.9 }, vol: 24 }),
  S('INTU', 'Intuit', 'software', [], { vol: 30 }),
  S('ROKU', 'Roku', 'internet', ['ad-cycle'], { factors: { growth: 2.0 }, vol: 60 }),
  S('CRSP', 'CRISPR Therapeutics', 'biotech', ['speculative-liquidity'], { factors: { growth: 1.8 }, vol: 65 }),
);

/** Company names and colloquial references mapped to tickers. */
export const ALIASES: Record<string, string> = {
  nvidia: 'NVDA', broadcom: 'AVGO', 'advanced micro devices': 'AMD', tsmc: 'TSM', 'taiwan semi': 'TSM', 'taiwan semiconductor': 'TSM', asml: 'ASML', micron: 'MU', marvell: 'MRVL', qualcomm: 'QCOM', intel: 'INTC', arista: 'ANET', 'super micro': 'SMCI', supermicro: 'SMCI', vertiv: 'VRT',
  apple: 'AAPL', microsoft: 'MSFT', alphabet: 'GOOGL', google: 'GOOGL', amazon: 'AMZN', meta: 'META', facebook: 'META', tesla: 'TSLA', netflix: 'NFLX', oracle: 'ORCL', salesforce: 'CRM', adobe: 'ADBE', servicenow: 'NOW', palantir: 'PLTR', snowflake: 'SNOW', 'trade desk': 'TTD', uber: 'UBER', shopify: 'SHOP', coinbase: 'COIN', microstrategy: 'MSTR', cisco: 'CSCO', intuit: 'INTU',
  'home depot': 'HD', nike: 'NKE', "mcdonald's": 'MCD', mcdonalds: 'MCD', starbucks: 'SBUX', costco: 'COST', walmart: 'WMT', 'procter & gamble': 'PG', 'procter and gamble': 'PG', 'coca-cola': 'KO', 'coca cola': 'KO', coke: 'KO', pepsi: 'PEP', pepsico: 'PEP',
  'eli lilly': 'LLY', lilly: 'LLY', 'novo nordisk': 'NVO', novo: 'NVO', unitedhealth: 'UNH', 'johnson & johnson': 'JNJ', 'johnson and johnson': 'JNJ', abbvie: 'ABBV', merck: 'MRK', pfizer: 'PFE', amgen: 'AMGN', vertex: 'VRTX',
  jpmorgan: 'JPM', 'jp morgan': 'JPM', 'bank of america': 'BAC', 'wells fargo': 'WFC', citigroup: 'C', citi: 'C', 'goldman sachs': 'GS', goldman: 'GS', 'morgan stanley': 'MS', visa: 'V', mastercard: 'MA', 'american express': 'AXP', amex: 'AXP', paypal: 'PYPL', berkshire: 'BRK.B', blackrock: 'BLK',
  exxon: 'XOM', 'exxon mobil': 'XOM', chevron: 'CVX', conocophillips: 'COP', occidental: 'OXY', schlumberger: 'SLB', nextera: 'NEE', constellation: 'CEG', vistra: 'VST', 'duke energy': 'DUK', enphase: 'ENPH', 'first solar': 'FSLR', 'ge vernova': 'GEV', eaton: 'ETN',
  caterpillar: 'CAT', deere: 'DE', boeing: 'BA', honeywell: 'HON', lockheed: 'LMT', linde: 'LIN', freeport: 'FCX', albemarle: 'ALB', verizon: 'VZ', 'at&t': 'T', 't-mobile': 'TMUS', prologis: 'PLD', 'american tower': 'AMT', equinix: 'EQIX', 'realty income': 'O', alibaba: 'BABA', toyota: 'TM',
  bitcoin: 'IBIT', gold: 'GLD', 'nasdaq 100': 'QQQ', 'nasdaq-100': 'QQQ', 's&p 500': 'SPY', 's&p500': 'SPY', 'total market': 'VTI', treasuries: 'IEF', 'long treasuries': 'TLT', 'long bonds': 'TLT', 't-bills': 'BIL', 'cash': 'CASH',
};

export const THEMES: Record<string, { label: string; driver: string }> = {
  'ai-capex': { label: 'AI investment cycle', driver: 'the AI investment cycle' },
  'taiwan-fab': { label: 'Taiwan fabrication dependence', driver: 'uninterrupted advanced-chip manufacturing in Taiwan' },
  'megacap-crowding': { label: 'Crowded mega-cap trade', driver: 'the same handful of mega-cap stocks that dominate most index funds' },
  'china-demand': { label: 'China demand exposure', driver: 'Chinese consumer and industrial demand' },
  'ad-cycle': { label: 'Digital advertising cycle', driver: 'corporate advertising budgets' },
  'datacenter-power': { label: 'Data-center power demand', driver: 'electricity demand from data centers' },
  'oil-price': { label: 'Oil price', driver: 'the oil price' },
  'consumer-credit': { label: 'Consumer credit health', driver: 'consumer borrowing and default rates' },
  glp1: { label: 'GLP-1 obesity drugs', driver: 'the GLP-1 drug franchise' },
  'speculative-liquidity': { label: 'Speculative liquidity', driver: 'risk appetite for high-beta speculative assets' },
};

/** Words that look like tickers but are not, when found in prose. */
export const NOT_TICKERS = new Set(['I', 'A', 'AI', 'US', 'USA', 'ETF', 'ETFS', 'CEO', 'CFO', 'USD', 'AUM', 'ESG', 'IPO', 'EM', 'DM', 'UK', 'EU', 'IT', 'OK', 'MY', 'IN', 'ON', 'AT', 'OR', 'AND', 'THE', 'TO', 'OF', 'BY', 'AS', 'IS', 'BE', 'SO', 'NO', 'RIA', 'LP', 'GP', 'HNW', 'PE', 'VC', 'YTD', 'QQ', 'FX', 'GDP', 'CPI', 'FED', 'MSCI', 'NAV', 'TOTAL', 'CASHX', 'BPS', 'BP', 'EV', 'MAX', 'MIN', 'ALL', 'ME', 'WE']);

const SEC_INDEX = new Map(SECURITIES.map(s => [s.ticker, s]));
const FUND_INDEX = new Map(FUNDS.map(f => [f.ticker, f]));

export function normalizeTicker(t: string): string {
  const up = t.trim().toUpperCase().replace(/^\$/, '');
  if (up === 'GOOG') return 'GOOGL';
  if (up === 'BRK-B' || up === 'BRKB' || up === 'BRK/B') return 'BRK.B';
  if (up === 'FB') return 'META';
  return up;
}

export function lookupSecurity(ticker: string): Security | undefined {
  return SEC_INDEX.get(normalizeTicker(ticker));
}

export function lookupFund(ticker: string): FundDef | undefined {
  return FUND_INDEX.get(normalizeTicker(ticker));
}

export function isKnownTicker(ticker: string): boolean {
  const t = normalizeTicker(ticker);
  return SEC_INDEX.has(t) || FUND_INDEX.has(t);
}

export function securityParams(sec: Security): { sector: string; kind: AssetKind; factors: FactorLoadings; vol: number; themes: string[]; region: string; idioFloor: number } {
  const a = ARCHETYPES[sec.archetype];
  return {
    sector: a.sector,
    kind: a.kind === 'equity' && /ETF|Trust|Fund/i.test(sec.name) ? 'etf' : a.kind,
    factors: { ...a.factors, ...sec.factors },
    vol: sec.vol ?? a.vol,
    themes: Array.from(new Set([...(sec.themes ?? []), ...a.themes])),
    region: sec.region ?? (a.kind === 'equity' ? 'US' : 'Global'),
    idioFloor: a.idioFloor,
  };
}

/** Fund factor loadings derived deterministically from its look-through composition. */
export function fundParams(f: FundDef): { factors: FactorLoadings; themes: string[]; idioFloor: number } {
  const factors: FactorLoadings = { growth: 0, rates: 0, credit: 0, oil: 0 };
  let named = 0;
  for (const [t, w] of f.constituents) {
    const s = lookupSecurity(t);
    const p = s ? securityParams(s) : { factors: ARCHETYPES[f.other.archetype].factors };
    for (const k of FACTORS) factors[k] += (w / 100) * p.factors[k];
    named += w;
  }
  const otherW = Math.max(0, 100 - named) / 100;
  const oa = ARCHETYPES[f.other.archetype];
  for (const k of FACTORS) factors[k] += otherW * oa.factors[k];
  for (const k of FACTORS) factors[k] = Math.round(factors[k] * 100) / 100;
  return { factors, themes: f.themes ?? [], idioFloor: 0.12 };
}

/** Sector hint keywords (user- or AI-supplied) mapped to archetype keys. */
export function archetypeFromHint(hint: string | undefined): string | null {
  if (!hint) return null;
  const h = hint.toLowerCase().trim();
  if (ARCHETYPES[h]) return h;
  const table: [RegExp, string][] = [
    [/semi|chip/, 'semis'], [/software|saas|cloud/, 'software'], [/internet|media|social|advertis|communication/, 'internet'], [/hardware|device|computer|network/, 'hardware'],
    [/bank/, 'banks'], [/financ|insur|payment|asset manag|broker/, 'finserv'], [/biotech/, 'biotech'], [/health|pharma|medical/, 'pharma'],
    [/staple|beverage|food|household|tobacco/, 'staples'], [/discretion|retail|consumer|restaurant|apparel|travel|leisure/, 'discretionary'],
    [/oil|gas|energy(?!.*clean)/, 'energy'], [/solar|renewable|clean/, 'cleanenergy'], [/utilit/, 'utilities'], [/reit|real estate|property/, 'reit'],
    [/industrial|aerospace|defense|machinery|transport|airline/, 'industrials'], [/material|mining|chemical|metal|lithium/, 'materials'], [/telecom/, 'telecom'],
    [/auto|ev\b|electric vehicle/, 'ev'], [/long.*(bond|treasur)/, 'longtreasury'], [/treasur|government bond|gilt|sovereign/, 'treasury'], [/high.?yield|junk/, 'hycredit'],
    [/corporate|credit|investment.?grade/, 'igcredit'], [/bond|fixed income/, 'aggbond'], [/gold/, 'gold'], [/commodit/, 'commodities'], [/crypto|bitcoin|ethereum/, 'crypto'],
    [/emerging/, 'em'], [/international|europe|japan|developed/, 'intl'], [/cash|money market/, 'cash'], [/index|diversified|broad/, 'broadequity'],
  ];
  for (const [re, key] of table) if (re.test(h)) return key;
  return null;
}

/** Proxy templates: representative holdings used ONLY when the user has not provided holdings. */
export const STYLE_TEMPLATES: Record<StyleKey, { label: string; holdings: [string, number][] }> = {
  tech: { label: 'Technology', holdings: [['MSFT', 16], ['NVDA', 16], ['AAPL', 14], ['GOOGL', 11], ['AMZN', 10], ['META', 9], ['AVGO', 8], ['ORCL', 5], ['CRM', 4], ['AMD', 4], ['ADBE', 3]] },
  semis: { label: 'Semiconductors', holdings: [['NVDA', 24], ['AVGO', 16], ['TSM', 14], ['AMD', 11], ['ASML', 10], ['MU', 9], ['QCOM', 8], ['TXN', 8]] },
  growth: { label: 'Growth', holdings: [['NVDA', 13], ['MSFT', 12], ['AMZN', 11], ['META', 9], ['TSLA', 8], ['LLY', 8], ['NFLX', 7], ['NOW', 7], ['UBER', 7], ['PLTR', 6], ['SHOP', 6], ['ISRG', 6]] },
  broad: { label: 'Broad market', holdings: [['MSFT', 7], ['NVDA', 7], ['AAPL', 6], ['AMZN', 4], ['GOOGL', 4], ['META', 3], ['JPM', 5], ['LLY', 4], ['UNH', 4], ['XOM', 5], ['HD', 5], ['PG', 5], ['CAT', 5], ['V', 5], ['NEE', 4], ['LIN', 4], ['PLD', 4], ['VZ', 4], ['COST', 5], ['JNJ', 5], ['BRK.B', 5]] },
  dividend: { label: 'Dividend income', holdings: [['JNJ', 10], ['PG', 10], ['KO', 9], ['PEP', 8], ['XOM', 9], ['CVX', 8], ['VZ', 8], ['ABBV', 8], ['MRK', 7], ['DUK', 7], ['O', 6], ['PM', 5], ['T', 5]] },
  value: { label: 'Value', holdings: [['BRK.B', 12], ['JPM', 11], ['XOM', 10], ['CVX', 8], ['BAC', 8], ['JNJ', 8], ['PFE', 7], ['WFC', 7], ['CAT', 7], ['VZ', 6], ['C', 6], ['DE', 5], ['GS', 5]] },
  balanced: { label: 'Balanced', holdings: [['VTI', 40], ['VXUS', 20], ['AGG', 30], ['TIP', 5], ['CASH', 5]] },
  bonds: { label: 'Fixed income', holdings: [['AGG', 35], ['IEF', 25], ['TLT', 15], ['LQD', 15], ['SHY', 10]] },
  credit: { label: 'Credit', holdings: [['LQD', 45], ['HYG', 35], ['JNK', 20]] },
  energy: { label: 'Energy', holdings: [['XOM', 25], ['CVX', 20], ['COP', 15], ['OXY', 10], ['SLB', 10], ['XLE', 20]] },
  transition: { label: 'Energy transition', holdings: [['NEE', 18], ['FSLR', 14], ['ENPH', 10], ['TSLA', 12], ['GEV', 12], ['ETN', 12], ['CEG', 10], ['ALB', 6], ['ICLN', 6]] },
  healthcare: { label: 'Healthcare', holdings: [['LLY', 18], ['UNH', 13], ['JNJ', 12], ['ABBV', 11], ['MRK', 10], ['TMO', 9], ['ISRG', 9], ['NVO', 8], ['AMGN', 5], ['VRTX', 5]] },
  financials: { label: 'Financials', holdings: [['JPM', 18], ['BRK.B', 14], ['V', 12], ['MA', 10], ['BAC', 10], ['GS', 8], ['MS', 8], ['WFC', 8], ['AXP', 7], ['BLK', 5]] },
  international: { label: 'International', holdings: [['VEA', 60], ['ASML', 8], ['SAP', 8], ['NVO', 8], ['TM', 8], ['TSM', 8]] },
  emerging: { label: 'Emerging markets', holdings: [['VWO', 60], ['TSM', 15], ['BABA', 10], ['FXI', 15]] },
  realestate: { label: 'Real estate', holdings: [['PLD', 25], ['AMT', 20], ['EQIX', 20], ['O', 20], ['VNQ', 15]] },
  crypto: { label: 'Digital assets', holdings: [['IBIT', 60], ['COIN', 20], ['MSTR', 20]] },
  gold: { label: 'Gold', holdings: [['GLD', 100]] },
  cash: { label: 'Cash', holdings: [['CASH', 100]] },
};

export const ALL_TICKERS: { ticker: string; name: string }[] = [
  ...SECURITIES.map(s => ({ ticker: s.ticker, name: s.name })),
  ...FUNDS.map(f => ({ ticker: f.ticker, name: f.name })),
].sort((a, b) => a.ticker.localeCompare(b.ticker));
