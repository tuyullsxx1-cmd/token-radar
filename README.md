# LaunchScope — Token Launch Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/tuyullsxx1-cmd/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/tuyullsxx1-cmd/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Which pre-token protocol is worth farming next, and what is its launch worth?

A static single-page dashboard over the sealed DefiLlama snapshot
(758 protocols, 2026-11-14): 197 pre-token protocols ranked by an implied
value fitted from the traded tokens inside the snapshot itself — a log-log
size curve, log(mcap) = 9.29 + 0.42 · log(TVL), fit on the 110 comps that
record a market cap of at least $1M — with an 80% prediction range shown
on every row, never one bare number.

- **Model (comps-3):** implied value from the curve; launch odds from a
  logistic regression fitted on all 758 protocols (P(records a token with
  a measurable market) by how long the protocol has run: 5-fold Brier
  0.135, AUC 0.67, against 0.175 for the stated prior it replaces); farm
  economics netted to break-even (expected net = implied × odds × drop
  share × (deposit/1000) / 10,000 − gas). Verdict FARM / MARGINAL / SKIP.
- **Validation, on the page:** leave-one-out median miss ×2.79, 80% range
  held 80.0% of traded comps blind, range span ×58 (robust spread — the
  ordinary SD let a few extreme tokens inflate it to ×214). Growth, age,
  category and all-128-comps variants were tried and rejected — all five
  are shown, with the winner highlighted.
- **Farm plan:** 6 steps per protocol with cost and time, recomputed live
  when the deposit ($1,000 / $10,000) or the drop share (3.5% / 7% / 14%)
  changes. The full watchlist (40 / 40) is covered, plus every other
  rankable pre-token protocol below the floor.
- **Dashboard:** dark terminal theme, KPI strip, dense sortable ranking
  table, search + category + chain + verdict filters, All / Watchlist /
  Early / Live token tabs, a scatter comps curve (110 traded dots, fitted
  line, ±1.28σ band), a validation panel and a methodology note. No
  network, no backend, no external dependencies.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json` (197 rows), `data.js`, copies `dashboard/` and `screenshots/`,
and writes `dossier.json` via `vendor/makefun-board.ts`. Two runs are
byte-identical.

## Entry

Built for the [token-radar-01 bounty](https://make.fun/bounty/token-radar-01)
on make.fun. Owner wallet is recorded in `.makefun/owner.json`.
