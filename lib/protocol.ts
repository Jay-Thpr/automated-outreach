/** Wire protocol between the client and /api/agent (newline-delimited JSON events). */
import type { Finding, PortfolioSpec, SpecUpdate, TraceStep, Unlock } from './types';

export type AgentRequest = {
  kind: 'onboard' | 'chat' | 'apply';
  text?: string;
  update?: SpecUpdate;
  spec?: PortfolioSpec;
  exampleId?: string;
  history?: { role: 'user' | 'atlas'; text: string }[];
};

export type InvestigationPayload = {
  findings: Finding[];
  headlineId: string | null;
  narrative: string;
  narrativeBy: 'ai' | 'planner';
  unlocks: Unlock[];
  delta: { label: string; before: string; after: string }[];
  focusScenario: string;
};

export type AnswerPayload = {
  lead: string;
  findings: string[];
  followups: string[];
  by: 'ai' | 'planner';
  focus?: { view: 'scenarios' | 'exposures' | 'overview'; scenario?: string };
};

export type AgentEvent =
  | { t: 'mode'; mode: 'ai' | 'demo' }
  | { t: 'understood'; items: { label: string; value: string }[]; notes: string[] }
  | { t: 'step'; step: TraceStep }
  | { t: 'spec'; spec: PortfolioSpec }
  | { t: 'question'; text: string; options: string[] }
  | { t: 'investigation'; payload: InvestigationPayload }
  | { t: 'answer'; payload: AnswerPayload }
  | { t: 'notice'; text: string }
  | { t: 'done' }
  | { t: 'error'; message: string };

/** Read an NDJSON stream of AgentEvents. */
export async function readAgentStream(res: Response, onEvent: (e: AgentEvent) => void | Promise<void>) {
  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) await onEvent(JSON.parse(line));
    }
  }
  if (buf.trim()) await onEvent(JSON.parse(buf));
}
