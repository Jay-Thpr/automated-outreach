# Atlas — Portfolio Intelligence Concept

A deployable, responsive portfolio-investigation demo made with **Next.js App Router + TypeScript**. The application combines a deterministic portfolio analytics engine, a scenario lab, and an optional AI-powered investigator.

**Important:** This is an **independent concept**, not an official MSCI product. Every portfolio, weighting, factor sensitivity, time series, and example scenario in this project is synthetic. It does not use MSCI data or proprietary analytics, and must not be presented as investment advice or actual market research.

## Features

- **Overview:** Real-time concentration metrics, effective number of holdings, synthetic trajectory, allocations, and proactive signals.
- **AI Investigator:** Ask open-ended questions, receive a transparent calculation trace and computed findings, continue with suggested follow-up investigations. Runs in demo mode even without an API key.
- **Scenario Lab:** Choose a macro/market shock, adjust four factor sliders, and see recalculated factor contribution, hypothetical portfolio P&L and individual holding effects.
- **Risk Exposures:** View the aggregate weighted factor map and inspect all underlying holdings.
- **Portfolio switcher:** Explore three distinctly configured synthetic strategies.
- **Export:** Download the active strategy and investigations as JSON.
- **Optional live AI:** Server-only OpenAI key enables natural-language synthesis of computed evidence. No real market data is required.

## Run locally

1. Install Node.js 20.9+ (22 recommended).
2. Open this folder in a terminal and run:

```bash
npm install
npm run dev
```

3. Visit http://localhost:3000.

The demo works immediately without configuration.

## Add real AI (optional)

Create a file named `.env.local` based on `.env.example`:

```dotenv
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Restart `npm run dev`. The `/api/investigate` route will perform deterministic tool calculations, then ask the model to synthesize and critique only those grounded outputs. If no key is supplied, the app responds with grounded deterministic analysis. If a model request fails, it falls back gracefully to deterministic analysis. Set `OPENAI_MODEL` to a model available on your API account.

**Do not add `NEXT_PUBLIC_` to the secret name.** The API key belongs only in the server environment, not client JavaScript.

## Deploy on Vercel

1. Extract the ZIP and upload the folder to a new GitHub repository (or run `git init`, commit, and push).
2. Open https://vercel.com/new and import your GitHub repository.
3. Choose framework **Next.js**. Root Directory should be the project root where `package.json` lives. Build defaults should work.
4. Click **Deploy**. The demo works without environment variables.
5. Optional: In Vercel **Project Settings → Environment Variables**, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. Redeploy to apply the new environment variables.
6. Share your Vercel-generated URL.

Alternatively, with the Vercel CLI installed, run `npx vercel` in the project folder and follow the login prompts. Deployment requires your Vercel account and access to the internet.

## Analytics methodology

These equations provide demo-grade, **non-predictive** portfolio diagnostics:

- Position weights sum to 100% in each sample portfolio.
- **Top 3 concentration** = sum of three largest weights.
- **Effective holdings** = `1 / SUM(weight_i²)` (inverse Herfindahl concentration).
- **Weighted asset volatility** = `SUM(weight_i × illustrative_individual_volatility_i)` and is **not** total portfolio volatility or VaR.
- **Factor exposure** = `SUM(weight_i × illustrative_factor_sensitivity_i)`.
- **Illustrative factor shock contribution** = `factor_exposure × shock_unit / 10`; all contributions are added for a modeled portfolio impact. Units are **model inputs** and are **not claimed to be observed percentage market changes**.
- **Per-holding modeled impact** uses the holding's own factor sensitivity and the same shock formula.
- Synthetic performance trajectories are handcrafted static examples, not historical returns.

No covariance matrix, historical estimation, backtesting, data freshness system or licensed peer comparison is supplied. **Do not use this for investment decisions.**

## Structure

- `app/page.tsx` — interactive frontend and visualizations.
- `app/globals.css` — responsive design system.
- `app/api/investigate/route.ts` — server-side investigation API and optional OpenAI model call.
- `lib/analytics.ts` — synthetic portfolios, deterministic diagnostics, scenarios, and tool-evidence generation.

## Production next steps

- Replace sample portfolios with consented holdings + permissioned institutional market data.
- Add authentication, rate limiting, monitoring, audit logging, and per-tenant authorization.
- Use properly calibrated analytics and a validated multi-factor risk model.
- Integrate properly licensed benchmark/peer analytics and data timestamps.
- Add real tool-calling research orchestration and structured data provenance.
- Introduce controls for institutional portfolio confidentiality, compliance, and evaluation.
