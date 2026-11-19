# LaunchScope — Token Launch Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/tuyullsxx1-cmd/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/tuyullsxx1-cmd/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Which pre-token protocol is worth farming next, and what is its launch worth?

A static single-page dashboard over the sealed DefiLlama snapshot
(758 protocols, 2026-11-14): 197 pre-token protocols ranked by an implied
value fitted from the traded tokens inside the snapshot itself — a log-log
size curve, log(mcap) = 6.97 + 0.52 · log(TVL), fit on 128 comps — with an
80% prediction range shown on every row, never one bare number.

- **Model (comps-2):** implied value from the curve; launch odds from a
  stated prior (the snapshot carries no launch outcomes to fit on); farm
  economics netted to break-even (expected net = implied × odds × drop
  share × (deposit/1000) / 10,000 − gas). Verdict FARM / MARGINAL / SKIP.
- **Validation, on the page:** leave-one-out median miss ×3.4, 80% range
  held 82.8% of traded comps blind. Growth, age and category variants were
  tried and rejected — all four are shown, with the winner highlighted.
- **Farm plan:** 6 steps per protocol with cost and time, recomputed live
  when the deposit ($1,000 / $10,000) or the drop share (3.5% / 7% / 14%)
  changes. The full watchlist (40 / 40) is covered, plus every other
  rankable pre-token protocol below the floor.
- **Dashboard:** dark terminal theme, KPI strip, dense sortable ranking
  table, search + category + chain + verdict filters, All / Watchlist /
  Early / Live token tabs, a scatter comps curve (128 traded dots, fitted
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
