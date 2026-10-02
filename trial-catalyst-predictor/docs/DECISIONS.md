# Decisions

## D1 — Indication scope: oncology first
Time-to-event endpoints, published KM curves (so pseudo-IPD reconstruction works),
MoA-defined competitor class, predictable conference calendar. Other areas are out of
scope for v1; the R simulation path for continuous/binary endpoints is deferred.

## D2 — Data: free sources only
CT.gov v2, PubMed/Europe PMC, openFDA, SEC EDGAR, ChEMBL/ATC, yfinance.
No paid trial or market data.

**Note:** `yfinance` exposes option chains for free (unofficial, flaky). Not relied on
in v1, but the fusion layer's interface accepts an optional market-implied probability
so D3 can be revisited without re-architecting.

## D3 — Decision rule: absolute probability threshold
`P_readout × P_success` against a fixed bar, rather than edge vs market-implied.

**Consequence:** the threshold is a free parameter. With an edge rule the market supplies
the reference point; without one, the bar must be calibrated against historical outcomes
or it is arbitrary. This promotes the eval harness (PLAN § 8) from "later" to "alongside".

Recommend reporting a three-way buy / no-trade / avoid with an explicit abstain band when
the posterior is too wide, rather than forcing a binary. Open.

## D4 — Build order: vertical slice on one real drug
All five stages, thin, end-to-end on a real investigational oncology drug with a known
upcoming readout. Surfaces extraction quality, KM reconstruction, and hierarchy-parsing
problems early. Scaffold and generalisation follow the working slice.

## Still open
- Target drug for the slice (blocks stage 1)
- Success ladder definition (D3 depends on it) — see SPEC-QUESTIONS Q11
- Horizon for "stock up": 1-day vs 1-week vs hold-to-approval — Q16
- Whether AI-extracted effect modifiers need human approval before entering the model — Q15

## D5 — Success definition: graded ladder
```
grade 0 = primary endpoint missed
grade 1 = primary met at protocol alpha, no secondaries
grade 2 = primary + key secondary met
grade 3 = primary + >=2 secondaries met, clean safety
```
Stage 4 emits the full distribution over grades; stage 5 consumes all four, not a point
estimate. Grades are evaluated by walking the extracted testing hierarchy in order and
spending alpha as specified, so secondaries are not independent draws.

Safety is a descriptor of grade 3 rather than a gate that can void lower grades —
pre-readout safety signals are too weakly identified to carry a veto. Revisit if the
backtest shows safety-driven failures being systematically missed.
