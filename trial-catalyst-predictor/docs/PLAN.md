# Architecture & Stack Plan

## 0. The shape of the problem

Five stages, deliberately different technologies, because they are different kinds of problem:

| Stage | Problem type | Technology |
|---|---|---|
| 1. Evidence harvest | Broad, fuzzy, unstructured | Claude agent + typed API clients |
| 2. Trial & protocol extraction | Structured extraction from text | Claude with JSON-schema output + provenance |
| 3. Readout date forecast | Calibrated time-to-event prediction | Bayesian AFT / event-accrual sim (Python or Stan) |
| 4. Endpoint success | Causal transport + trial simulation | **R** (STC / ML-NMR / MAP priors / group-sequential) |
| 5. Fusion & recommendation | Decision theory | Python |

The critical design rule: **stages 1-2 produce a typed, versioned, provenance-tagged
evidence object. Stages 3-5 are pure functions of that object.** That lets you rerun
the models without re-harvesting, diff two evidence snapshots, and backtest by
freezing evidence as of a past date.

---

## 1. Evidence harvest — AI, but not only AI

Do **not** let an LLM freeform-search for things that live in structured registries.
Use deterministic API clients where a registry exists; use Claude for the fuzzy parts
(synonym resolution, "is this drug in the same class?", extraction from prose).

### Deterministic sources (free)

| Source | API | What it gives |
|---|---|---|
| **ClinicalTrials.gov v2** | REST/JSON, no key | Trial registry, arms, endpoints, N, status, **and version history** |
| **Europe PMC** | REST, no key | Publications + full text (OA subset) |
| **PubMed E-utilities** | REST, key optional | Abstracts, MeSH terms |
| **openFDA** | REST, no key | Labels, approvals, adverse events |
| **SEC EDGAR full-text search** | REST, no key | 10-K/10-Q/8-K guidance language, risk factors |
| **ChEMBL / RxNorm / ATC** | REST | Mechanism of action → defines "class competitor" |
| **EU CTIS / WHO ICTRP / ISRCTN** | REST/bulk | Non-US trials |
| **EMA EPAR** | scrape | EU approvals, competitor benchmarks |

### The single highest-value source: CT.gov version history

`/api/v2/studies/{nctId}?fields=...` plus the change-history endpoint gives you, for every
trial, **the sequence of estimated primary completion dates over time**. The pattern of
slippage (how many revisions, how big, how late) is the best available predictor of
when a readout actually lands. It is also the training set for Stage 3 — free, and
nobody has to label it.

### Market & sentiment sources

- Price/volume: `yfinance` (free, unofficial) → Tiingo / Polygon / EODHD if you want reliability.
- **Options chain around the catalyst** — the straddle price *is* the market's own
  readout-date and magnitude estimate. This is the single best input to Stage 5 and
  the main reason to spend money on data.
- Short interest, prior run-up, market cap, cash runway (from EDGAR).

### Conference calendar

Oncology/CV readouts cluster at ASCO, ESMO, ASH, AHA, ACC, ADA, EASL, etc. Abstract
submission deadlines and meeting dates are public and create hard spikes in the
readout-date distribution. Maintain this as a small curated YAML file — it is 50 rows
and worth more than any model.

### Agent design

Claude Agent SDK, Python. One orchestrator + specialist subagents:

- `disease_agent` — background, standard of care, natural history, prognostic factors
- `drug_agent` — all publications on the drug, phase 1/2 results, PK/PD, safety signals
- `class_agent` — resolve MoA → competitor set → their trials and results
- `sponsor_agent` — company, ticker, cash, guidance language, pipeline concentration
- `effect_modifier_agent` — prognostic factors + treatment effect modifiers for the class

Each returns a Pydantic model. Every field carries `{value, source_url, quote, confidence,
retrieved_at}`. No bare facts. If you cannot cite it, it does not enter the model.

Model choice: Opus for the orchestration and the trial-selection reasoning (it is a
judgement call with real consequences), Sonnet for bulk extraction, Haiku for
classification/dedup at volume. Prompt caching on the harvested corpus — the same
1M-token evidence pack gets queried dozens of times.

---

## 2. Target trial identification & protocol extraction

From the harvest, pick the trial whose readout is the catalyst. Then extract:

- NCT ID, phase, actual/estimated N, randomisation ratio, blinding, regions
- **Primary endpoint**: type (time-to-event / binary / continuous), definition, timepoint
- **Secondary endpoints and the testing hierarchy** — this is essential and usually
  overlooked. In a fixed-sequence hierarchy, failing at step *k* means every endpoint
  below it is not formally testable, so "how many secondaries were met" is not
  independent draws. Extract the alpha allocation, gatekeeping structure, and any
  graphical multiplicity procedure.
- **Interim analyses**: number, timing, alpha-spending function, futility rules.
  An efficacy interim changes *both* the date distribution and the success probability.
- Statistical assumptions: assumed HR/effect size, power, alpha, target event count
- Enrollment start/completion, estimated PCD and **its full revision history**
- Baseline characteristics if any are public (from the phase 2, or a published
  baseline paper, or the SAP)

Sources: CT.gov record, the published protocol/SAP (often a NEJM/Lancet supplement),
the trial design paper, company R&D day slides, EDGAR filings.

---

## 3. Readout date forecast

Not "random error" — a calibrated predictive distribution. Two components, mixed:

### (a) Mechanistic: event accrual (for event-driven trials)

Most oncology and CV phase 3s read out when a target *event count* is reached, not on
a calendar date. Simulate: enrollment curve × control-arm hazard × assumed treatment
effect × dropout → time to reach target events. This naturally couples Stage 3 to
Stage 4 (a more effective drug means fewer events means a *later* readout — a real and
frequently-missed effect).

### (b) Empirical: slippage model

Train on CT.gov history. For each historical phase 2/3 trial, features as of time *t*:
phase, indication, sponsor size, enrollment status, number of prior PCD revisions,
cumulative slippage to date, event-driven vs time-driven, region mix, whether company
guidance says "1H/2H 20XX". Target: actual time from *t* to first public disclosure.

Model: Bayesian accelerated failure time / log-normal delay model with hierarchical
pooling by indication. `PyMC` or `Stan`. Output is a posterior predictive over dates.

### (c) Mixture with discrete attractors

Convolve the continuous posterior with spikes at conference dates and quarterly
earnings dates. Companies do not announce on random Tuesdays.

**Output**: `P(readout in month m)` for each month over the horizon, and `P(readout by
date d)` cumulative. Discretise to whatever granularity you want — monthly is honest,
weekly is defensible near-term, exact dates are false precision except for conferences.

---

## 4. Endpoint success simulation — R

This is the right place for R, and the R ecosystem here is genuinely better than Python's.

### Pipeline

**Step 1 — Prior on the treatment effect.**
Hierarchical random-effects meta-analysis over (a) class competitors' trials in the same
indication, (b) the drug's own earlier-phase data, (c) the same drug in adjacent
indications. Produce a **meta-analytic-predictive (MAP) prior** with a robust mixture
component so one weird trial cannot dominate. → `RBesT`

**Step 2 — Transport to the target population (the STC step).**
Class-mate trials enrolled different patients. Reconstruct pseudo-IPD from published
Kaplan–Meier curves (Guyot algorithm → `IPDfromKM`), fit an outcome regression with
prognostic factors and effect modifiers, then predict into the *target trial's* baseline
covariate distribution. That is simulated treatment comparison. If you have more than
two trials, prefer **ML-NMR** (`multinma`) — it is the modern generalisation of STC/MAIC
and handles a whole network at once. Keep `maicplus` around for the 2-trial anchored case.

**Step 3 — Effect modifiers.**
The `effect_modifier_agent` output (Stage 1) supplies which covariates modify the effect
and by how much. These enter the outcome regression as interactions. This is where the
"prognostic factors and treatment effect modifiers" requirement actually pays off:
prognostic factors change the *event rate* (and therefore power and timing); effect
modifiers change the *effect size* in the target population.

**Step 4 — Simulate the trial as designed.**
For each posterior draw of the true effect:
- simulate survival/binary outcomes for N patients with the target baseline mix (`simsurv`)
- apply the real accrual and dropout
- apply the **actual group-sequential design** — interims, alpha-spending boundaries,
  futility (`rpact` does exactly this)
- walk the **testing hierarchy** in order, spending alpha as specified
- record: primary met? which secondaries met? stopped early?

10k–50k draws. The output is not a p-value, it is `P(primary met)` and the joint
distribution over secondary outcomes.

**Step 5 — Success grade.**
Map outcomes onto a discrete success ladder, e.g.
`0 = fail`, `1 = primary only`, `2 = primary + key secondary`, `3 = primary + ≥2 secondaries
and clean safety`. Stage 5 consumes the full distribution over grades, not a point estimate.

### R packages

`rstan`/`cmdstanr` or `brms` · `RBesT` · `multinma` · `maicplus` · `IPDfromKM` ·
`simsurv` · `rpact` · `survival` · `metafor` · `posterior` · `plumber` · `renv`

---

## 5. Fusion → recommendation

Two probabilities the user asked for, plus the piece that actually determines P&L:

```
P_readout   = P(readout occurs within horizon H)                  [Stage 3]
P_success   = Σ_g P(grade = g)                                    [Stage 4]
P_up | g    = P(stock up | success grade g)                       [Stage 5, calibrated]
```

### P(stock up | success) must be estimated, not assumed

Build an event study: historical binary biotech catalysts → 1-day and 5-day abnormal
return, conditional on success grade, market cap, the catalyst's share of pipeline value,
prior 90-day run-up, short interest, and the options-implied move. "Good data, stock
down" happens constantly when the result was already priced in.

### The decision rule should be edge-based, not absolute

```
edge = P_model(success) − P_market_implied(success)
EV   = P_readout × [ Σ_g P(g) · E(return | g) ] − costs
```

`P_market_implied` comes from the options straddle around the expected catalyst date, or
from the prior run-up in a comparable-company framework. **Buy** when `edge` exceeds a
threshold that covers spread, borrow, and model error — not merely when `P(success)` is
high. A 90%-likely success already priced at 90% is not a trade.

Size with fractional Kelly on the posterior, and report the recommendation with the
posterior interval, not a single number.

---

## 6. Languages & glue

**App core: Python.** Best Claude SDK support, pydantic for typed extraction, FastAPI,
the whole data-API ecosystem.

**Simulation: R**, as a separate service.

Three bridge options, in order of how I would adopt them:

1. **`Rscript` + JSON files** (start here). Python writes `SimulationSpec.json`,
   invokes `Rscript run_sim.R spec.json out.json`, reads results. Zero infrastructure,
   trivially testable, the spec file doubles as a reproducibility artifact.
2. **`plumber` REST service in Docker** (move here when you need concurrency or a
   warm R session). Same JSON contract, so the migration is a one-line change in Python.
3. `rpy2` — in-process, but dependency-fragile and hard to deploy. Avoid.

The JSON contract between Python and R is the most important interface in the system.
Define it once with a JSON Schema, generate the Pydantic model from it, validate on both
sides.

**Frontend**: Streamlit for v0 (a day's work, and you are the only user). Next.js if it
becomes a product.

**Storage**: Postgres + `pgvector` for the literature index; object storage for raw
fetched documents so extraction is re-runnable without re-fetching. DuckDB + Parquet is
a legitimate single-user shortcut.

**Orchestration**: plain Python + a job queue for v0; Prefect or Dagster once the DAG
has retries and schedules.

---

## 7. Repository layout

```
apps/
  api/            FastAPI service
  ui/             Streamlit (v0) → Next.js
packages/
  harvest/        typed clients: ctgov, pubmed, europepmc, edgar, openfda, market
  extract/        Claude agents, Pydantic schemas, provenance store
  timing/         Stage 3 readout-date model
  fuse/           Stage 5 decision layer
sim/              R: renv.lock, STC/MAP/group-sequential, plumber entrypoint
contracts/        JSON Schemas shared by Python and R
eval/             backtest harness, calibration reports
infra/            docker-compose, migrations
```

---

## 8. Evaluation — do this before trusting anything

The part that separates this from a plausible-looking toy:

- **Backtest by freezing knowledge.** Pick trials that read out in the last 3 years.
  Rebuild the evidence pack as of 6 months before readout (CT.gov history makes this
  possible; PubMed dates make it possible for literature). Predict. Score.
- **Metrics**: Brier score and log-loss for endpoint success; CRPS for the date
  distribution; a calibration plot (when the model says 70%, does it happen 70% of
  the time?).
- **Baselines to beat**: historical phase-3 success base rate by indication (~50-60%
  oncology phase 3), and the market-implied probability. If the model cannot beat
  the options market, the app's value is the evidence pack and the audit trail, which
  is still real value — but you need to know which of the two you have.

---

## 9. Constraints and honest caveats

- **Public sources only.** No paywalled preclinical data shared under NDA, no expert-network
  channel checks, nothing that could constitute material non-public information. The
  harvest layer should hard-enforce a source allowlist.
- **Not investment advice.** If this is ever used by or for anyone other than you, it
  likely falls under investment-adviser regulation. Keep it personal-use or talk to a
  securities lawyer before it leaves your laptop.
- **Stage 5 is the weakest link.** Stages 1–4 are well-posed scientific problems with
  established methods. "Will the stock go up" adds market-efficiency, positioning, and
  macro noise that no amount of trial modelling addresses. Expect the endpoint model to
  be far better calibrated than the price model, and size positions accordingly.
- **Irreducible uncertainty is large.** A well-calibrated 65% is the realistic ceiling
  for most phase 3 readouts. The app's job is to be honestly calibrated, not confident.
