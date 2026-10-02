# Environment constraints

## This Claude Code web session cannot reach any data source

Measured 2026-09-20. The session's egress policy returns `403` to `CONNECT` for every
host the app needs:

| Host | Purpose | Status |
|---|---|---|
| `clinicaltrials.gov` | trial registry + version history | blocked |
| `eutils.ncbi.nlm.nih.gov` | PubMed | blocked |
| `www.ebi.ac.uk` | Europe PMC | blocked |
| `api.fda.gov` | openFDA | blocked |
| `www.sec.gov` | EDGAR | blocked |
| `query1.finance.yahoo.com` | prices via yfinance | blocked |
| `cran.r-project.org` | R packages | blocked |
| `pypi.org` | Python packages | **allowed** |

R itself is also not installed in this container.

## What this means

- Python code can be written, installed and unit-tested here. R code can be written but
  not executed here.
- No live harvest, and no validation against real API responses, from this session.

## Two ways forward

1. **Widen the environment's network policy** to allow the hosts above plus CRAN. This is
   an environment setting in Claude Code on the web —
   see https://code.claude.com/docs/en/claude-code-on-the-web
2. **Develop here, run locally.** Write clients against recorded fixtures; execute the
   real pipeline on your own machine.

## Fixtures are worth doing regardless

Option 2 forces a pattern the project wants anyway: every API response is recorded to
disk (VCR-style) and replayed in tests. That makes the harvest layer testable offline,
makes extraction re-runnable without re-fetching, and is a precondition for the
backtest in PLAN § 8 — which depends on being able to reconstruct an evidence pack
exactly as it stood at a past date.
