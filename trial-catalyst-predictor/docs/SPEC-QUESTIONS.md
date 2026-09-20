# Spec questions

Answer these and the build order falls out. Starred (★) ones actually change the
architecture; the rest change defaults.

## A. Scope & use

1. ★ **One drug on demand, or a monitored watchlist?** On-demand is a request/response
   app. A watchlist is a scheduler, a diff engine, and alerting — a different system.
2. ★ **Therapeutic area first?** Oncology is by far the easiest to start with: endpoints
   are time-to-event and standardised (OS/PFS/ORR), KM curves are published so pseudo-IPD
   reconstruction works, conferences are predictable, and the competitor class is
   well-defined by MoA. Immunology/CV/neuro each break one of those.
3. **Who uses it?** Just you, or others? This is the regulatory fork (see PLAN § 9).
4. **Horizon and granularity.** Next readout within 6 / 12 / 24 months? Date output as
   exact dates, weeks, months, or quarters?
5. **Universe.** US-listed only? Include EU/JP listings? What about a drug whose sponsor
   is private or a subsidiary of a large-cap where the catalyst barely moves the stock?

## B. Data

6. ★ **Budget for paid data?** Free-only is genuinely viable for stages 1–4. Stage 5 is
   much weaker without options data. Rough tiers:
   - $0: CT.gov, PubMed/EuropePMC, openFDA, EDGAR, yfinance
   - ~$50–200/mo: Polygon or EODHD (reliable prices **+ options chains**) ← biggest single upgrade
   - $$$$: Citeline/Trialtrove, Cortellis, Evaluate Pharma, Flatiron/Optum RWD
7. **Full-text literature access?** Institutional access changes extraction quality a lot —
   baseline tables and KM curves are in the full text and the supplement, not the abstract.
8. ★ **Options data: yes or no?** Determines whether Stage 5 is "edge vs market" (good)
   or "absolute probability" (much weaker).
9. **Real-world data.** Do you have access to anything beyond public SEER/CMS/NHANES for
   baseline characteristics and prognostic factors?

## C. Modelling

10. ★ **Endpoint types for v1.** Time-to-event only (simplest, covers oncology/CV), or
    binary and continuous too? Each needs its own simulation path in R.
11. ★ **Define "success" precisely.** Primary met at protocol alpha only? Or a weighted
    ladder over secondaries? If a ladder — what weights, and does safety enter?
12. **Multiplicity.** Handle the testing hierarchy / alpha-spending formally, or treat
    secondaries as independent? Formal is correct and not much harder given `rpact`, but
    it requires the hierarchy to be extractable for the trial in question.
13. **Interim analyses.** Model early stopping for efficacy/futility? It changes the date
    distribution as much as the success probability.
14. **Prior strength.** How much weight on the class-effect prior vs the drug's own
    phase 2? Do you want a skeptical prior as the default, and how skeptical?
15. **Effect-modifier sourcing.** Trust AI-extracted effect modifiers from the literature
    directly, or require a human to approve the covariate list before it enters the model?

## D. The trade leg

16. ★ **"Stock up" over what horizon?** 1 day, 1 week, or hold-to-approval? Completely
    different models.
17. ★ **Threshold.** Any positive return? >5%? Beats the options-implied move?
18. ★ **Absolute recommendation or edge vs market-implied?** I strongly recommend
    edge-based. An absolute "P(success) = 78% → buy" ignores that the market may already
    price 85%.
19. **Position sizing** in scope, or just a directional call?
20. **Do you want the model to say "no opinion"?** A three-way buy / no-trade / avoid is
    more useful and more honest than a forced binary.

## E. Engineering

21. **Where does it run?** Your laptop, a VPS, or cloud? Docker acceptable?
22. **Refresh cadence.** On demand, nightly, or event-driven on news?
23. **Do you write R yourself?** Affects how much of the simulation I should hide behind
    a clean interface vs leave open for you to edit.
24. **Audit requirement.** Must every number trace to a cited source with a retrieval
    timestamp? (My default: yes — it is the main defence against LLM fabrication, and it
    is what makes the backtest possible.)
25. **Backtest before trusting?** I would build the eval harness in the first iteration,
    not after. Confirm you want that, since it front-loads work before you see a number.
