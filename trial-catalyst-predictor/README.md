# trial-catalyst-predictor

Evidence-to-decision pipeline for investigational drug readouts.

Given a drug name or a ticker, the system:

1. **Harvests** everything public about the drug, its disease, its class competitors,
   the manufacturer, and the prognostic/effect-modifier literature for the indication.
2. **Identifies** the next pivotal trial due to read out and extracts its protocol design.
3. **Forecasts** *when* that readout lands, as a probability distribution over dates.
4. **Simulates** whether the endpoints will be met, Bayesian, in R.
5. **Fuses** the two into an expected-value trade recommendation with an audit trail.

Status: **design phase**. See `docs/PLAN.md` for the architecture and `docs/SPEC-QUESTIONS.md`
for the open decisions blocking implementation.

> This is a research and decision-support tool, not investment advice. It uses public
> sources only. See `docs/PLAN.md` § Constraints.
