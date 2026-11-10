/** All sample holdings, factor coefficients and performance values are SYNTHETIC.
 *  Calculations are deterministic and intentionally simplified for demo purposes.
 *  They are not MSCI data, not market forecasts, and not investment advice.
 */
export type PortfolioId = 'ai' | 'balanced' | 'transition';
export type Factor = 'rates'|'tech'|'credit'|'energy';
export type Shock = Record<Factor,number>;
export type Holding = { ticker:string; name:string; weight:number; sector:string; factors:Record<Factor,number>; risk:number; region:string; }; 
export type Portfolio = {id:PortfolioId;name:string;short:string;description:string;value:number;benchmark:string;holdings:Holding[];monthly:number[];};
const f=(rates:number,tech:number,credit:number,energy:number):Record<Factor,number>=>({rates,tech,credit,energy});
export const portfolios: Record<PortfolioId,Portfolio> = {
  ai:{id:'ai',name:'AI & Technology Growth',short:'AI Growth',description:'Concentrated large-cap innovation strategy',value:500000000,benchmark:'Global Equity (synthetic)',monthly:[0,2.2,1.4,4.1,3.5,6.7,5.2,8.6,8.2,11.4,10.9,14.8],holdings:[
    {ticker:'NVDA',name:'Nvidia',weight:24,sector:'Semiconductors',factors:f(-.8,1.9,.4,.15),risk:36,region:'US'},
    {ticker:'MSFT',name:'Microsoft',weight:20,sector:'Software',factors:f(-.7,1.3,.2,.05),risk:22,region:'US'},
    {ticker:'AMZN',name:'Amazon',weight:16,sector:'Consumer / Cloud',factors:f(-.6,1.2,.6,.1),risk:28,region:'US'},
    {ticker:'GOOGL',name:'Alphabet',weight:15,sector:'Internet',factors:f(-.5,1.15,.3,.08),risk:26,region:'US'},
    {ticker:'META',name:'Meta',weight:13,sector:'Internet',factors:f(-.55,1.5,.45,.1),risk:31,region:'US'},
    {ticker:'AVGO',name:'Broadcom',weight:12,sector:'Semiconductors',factors:f(-.75,1.8,.6,.12),risk:34,region:'US'},
  ]},
  balanced:{id:'balanced',name:'Global Balanced Allocation',short:'Global Balanced',description:'Multi-asset mix with growth and defensive sleeves',value:320000000,benchmark:'60 / 40 Blend (synthetic)',monthly:[0,.8,1.1,1.7,1.4,2.5,2.1,3.3,3.7,4.5,4.8,6.1],holdings:[
    {ticker:'EQUITY',name:'Global Equity Basket',weight:34,sector:'Diversified Equity',factors:f(-.55,.65,.5,.12),risk:18,region:'Global'},
    {ticker:'UST10',name:'US Treasury Basket',weight:28,sector:'Government Bonds',factors:f(-1.2,0,-.2,0),risk:8,region:'US'},
    {ticker:'IGCR',name:'Investment-Grade Credit',weight:15,sector:'Corporate Bonds',factors:f(-.8,.05,1.4,.04),risk:11,region:'Global'},
    {ticker:'INTL',name:'International Equities',weight:12,sector:'Diversified Equity',factors:f(-.45,.4,.65,.15),risk:21,region:'Global'},
    {ticker:'GOLD',name:'Gold Proxy',weight:6,sector:'Commodities',factors:f(.15,.05,-.25,.35),risk:16,region:'Global'},
    {ticker:'CASH',name:'Cash',weight:5,sector:'Cash',factors:f(.05,0,0,0),risk:1,region:'US'},
  ]},
  transition:{id:'transition',name:'Energy Transition Leaders',short:'Energy Transition',description:'Thematic clean-energy and infrastructure allocation',value:180000000,benchmark:'Transition Theme (synthetic)',monthly:[0,1.8,1.1,2.8,1.3,3.7,2.9,4.2,3.1,5.8,5.3,7.6],holdings:[
    {ticker:'SOLR',name:'Solar Manufacturers Basket',weight:24,sector:'Renewables',factors:f(-1.4,.5,1.1,-.3),risk:38,region:'Global'},
    {ticker:'GRID',name:'Grid Infrastructure Basket',weight:22,sector:'Industrials',factors:f(-.75,.65,.55,.4),risk:24,region:'Global'},
    {ticker:'EV',name:'Electric Mobility Basket',weight:20,sector:'Automotive',factors:f(-1.1,.85,1.25,-.5),risk:39,region:'Global'},
    {ticker:'UTIL',name:'Renewable Utilities Basket',weight:17,sector:'Utilities',factors:f(-1.25,.1,.55,.2),risk:18,region:'Global'},
    {ticker:'BATT',name:'Battery Supply Chain',weight:11,sector:'Materials',factors:f(-.65,.4,1.1,.7),risk:34,region:'Global'},
    {ticker:'CASH',name:'Cash',weight:6,sector:'Cash',factors:f(.05,0,0,0),risk:1,region:'US'},
  ]}
};
export const factorLabels:Record<Factor,string>={rates:'Rates sensitivity',tech:'Technology cycle',credit:'Credit conditions',energy:'Energy prices'};
export const factorOrder:Factor[]=['tech','rates','credit','energy'];
export const scenarios:Record<string,{name:string;description:string;shock:Shock}>={
  ai: {name:'AI valuation reset',description:'A selloff in AI-linked equities with tighter credit and higher yields.',shock:f(1.0,-18,-2,0)},
  rates: {name:'Rates higher for longer',description:'A sharp upward move in bond yields and a mild tech de-rating.',shock:f(2.0,-5,-1,1)},
  recession:{name:'Global recession',description:'Growth contraction, credit widening, and risk-off trading.',shock:f(-1.0,-10,-9,-8)},
  energy:{name:'Energy supply shock',description:'Rising energy prices, tighter yields and slowing growth.',shock:f(1.0,-5,-3,22)},
};
export function exposure(p:Portfolio){return Object.fromEntries(factorOrder.map(k=>[k,p.holdings.reduce((a,h)=>a+h.weight*h.factors[k]/100,0)])) as Record<Factor,number>}
export function sectorWeights(p:Portfolio){const m:Record<string,number>={};p.holdings.forEach(h=>m[h.sector]=(m[h.sector]||0)+h.weight);return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));}
export function metrics(p:Portfolio){const weights=p.holdings.map(h=>h.weight/100);const hhi=weights.reduce((s,w)=>s+w*w,0);return { top3:p.holdings.slice().sort((a,b)=>b.weight-a.weight).slice(0,3).reduce((a,h)=>a+h.weight,0),effective:1/hhi,concentration:hhi*100,weightedVol:p.holdings.reduce((a,h)=>a+h.weight*h.risk/100,0),total:p.holdings.length};}
// An illustrative linear factor shock model. Shock components are hypothetical normalized units;
// coefficients are hand-authored sensitivities, not empirically estimated factor betas.
export function impact(p:Portfolio,shock:Shock){const exposures=exposure(p);const contributions=factorOrder.map(k=>({factor:k,label:factorLabels[k],value:exposures[k]*shock[k]/10}));const pct=contributions.reduce((a,c)=>a+c.value,0);const holdings=p.holdings.map(h=>({ticker:h.ticker,impact:factorOrder.reduce((a,k)=>a+h.factors[k]*shock[k]/10,0),weight:h.weight})).sort((a,b)=>a.impact-b.impact);return {pct,dollars:p.value*pct/100,contributions,holdings};}
export function intelligence(p:Portfolio){const exp=exposure(p),m=metrics(p),sec=sectorWeights(p);const dominant=Object.entries(exp).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))[0];return [
  {id:'concentration',type:'CONCENTRATION',priority:m.top3>55?'HIGH':'MEDIUM',title:m.top3>55?'Diversification may be an illusion':'Position concentration deserves a second look',description:`The three largest exposures make up ${m.top3.toFixed(0)}% of this illustrative strategy. It has an effective holding count of ${m.effective.toFixed(1)} despite ${m.total} positions.`,question:'Where am I actually concentrated?'},
  {id:'factor',type:'FACTOR EXPOSURE',priority:Math.abs(dominant[1])>1?'HIGH':'MEDIUM',title:`${factorLabels[dominant[0] as Factor]} dominates`,description:`The strongest modeled factor loading is ${dominant[1].toFixed(2)}. Holdings from different sectors can still share a common sensitivity.`,question:'Investigate my hidden factor exposures'},
  {id:'sector',type:'PORTFOLIO STRUCTURE',priority:sec[0].value>40?'HIGH':'LOW',title:`${sec[0].name} is your largest sleeve`,description:`The top sector represents ${sec[0].value.toFixed(0)}% of holdings weight. Explore a stress test to see how cross-sector effects could compound.`,question:'What would break this strategy?'},
 ];}
export function investigate(p:Portfolio,question:string,scenarioKey='ai'){
 const q=question.toLowerCase(),m=metrics(p),exp=exposure(p);
 const isStress=/shock|recession|crash|break|drop|fall|rate|scenario|stress|downside|selloff/.test(q);
 const isPeers=/peer|compare|benchmark|competitor|other fund|similar fund/.test(q);
 const isFactor=/factor|correlat|hidden|tech|concentrat|exposur|diversif|overlap/.test(q);
 const scenario=isStress?(q.includes('recession')?'recession':q.includes('rate')?'rates':q.includes('energy')?'energy':scenarioKey):scenarioKey;
 const hit=impact(p,scenarios[scenario].shock);
 const top=p.holdings.slice().sort((a,b)=>b.weight-a.weight).slice(0,3);
 const findings= isStress ? [
  `The illustrative ${scenarios[scenario].name.toLowerCase()} produces a ${hit.pct.toFixed(1)}% modeled portfolio move (${hit.dollars<0?'–':'+'}$${Math.abs(hit.dollars/1000000).toFixed(1)}M on $${(p.value/1000000).toFixed(0)}M).`,
  `Largest modeled drag: ${hit.contributions.slice().sort((a,b)=>a.value-b.value)[0].label} (${hit.contributions.slice().sort((a,b)=>a.value-b.value)[0].value.toFixed(1)} percentage points).`,
  `Most sensitive holding proxy: ${hit.holdings[0].ticker} (${hit.holdings[0].impact.toFixed(1)}% standalone modeled change).`,
 ] : isPeers ? [
  `Compare this illustrative strategy against its configured benchmark: ${p.benchmark}. No live peer holdings or benchmark time series are connected.`,
  `The top three positions represent ${m.top3.toFixed(0)}% of weight; effective breadth is ${m.effective.toFixed(1)} names. These are useful peer-comparison dimensions.`,
  `A licensed peer dataset would enable percentile ranks, tracking error and return attribution; the demo intentionally does not invent them.`,
 ] : isFactor ? [
  `The portfolio's synthetic technology-cycle loading is ${exp.tech.toFixed(2)} and rates loading is ${exp.rates.toFixed(2)}.`,
  `The largest weights are ${top.map(h=>`${h.ticker} (${h.weight}%)`).join(', ')}. Different names may share similar modeled drivers.`,
  `Effective breadth is ${m.effective.toFixed(1)} positions versus ${m.total} actual positions: a measure of weight concentration, not true factor diversification.`,
 ] : [
  `The top three holdings account for ${m.top3.toFixed(0)}% of the portfolio; effective breadth is ${m.effective.toFixed(1)} positions.`,
  `Technology-cycle loading is ${exp.tech.toFixed(2)}, and modeled rates loading is ${exp.rates.toFixed(2)}.`,
  `A ${scenarios[scenario].name.toLowerCase()} stress would create a hypothetical ${hit.pct.toFixed(1)}% impact under this simplified linear model.`,
 ];
 const lead=isStress?'I stress-tested the portfolio through a specified factor-shock model.':isPeers?'I mapped the most meaningful dimensions for a peer comparison.':isFactor?'I decomposed the strategy into position weights and synthetic factor sensitivities.':'I ran a first-pass investigation across concentration, factor exposure, and a market shock.';
 const followups=isStress?['Which positions drive that downside?','How should I hedge this exposure?','Compare against a balanced portfolio']:isPeers?['How concentrated am I?','What would break this strategy?','Investigate hidden factor exposures']:['What would break this strategy?','Compare against peers','Simulate rates higher for longer'];
 return {lead,findings,followups,steps:['Parsed investment question','Retrieved synthetic portfolio holdings','Computed concentration and factor exposures',...(isStress?['Ran deterministic scenario engine']:['Checked scenario sensitivity']),'Compiled evidence-based findings'],category:isStress?'scenario':isPeers?'peers':isFactor?'factors':'overview',scenario,disclaimer:'Illustrative synthetic holdings and sensitivities; no live market data or proprietary MSCI analytics.'};
}
