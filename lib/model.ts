// LaunchScope's model: a comps-fitted launch radar.
//
// One snapshot of the protocol universe in, one ranked board out. The board covers every slug in
// the snapshot's watchlist (the floor, never the ceiling) plus every other rankable pre-token
// protocol below it: the early rows the radar exists to find. A protocol is pre-token when its
// record carries no token (no market cap, no CoinGecko id, no symbol); live-token protocols are
// kept apart and shown with the market's own values, never mixed into the ranked board.
//
// Implied value is FITTED, not assumed. The traded tokens inside the snapshot itself are the
// comps — but only the ones that record a market cap of at least $1M. The 18 traded tokens below
// $1M are dead listings (market caps of $48k-$889k), not markets: including them as comps drags
// the curve down and inflates the spread, and leave-one-out proves it (median miss x3.40 with
// them, x2.79 without). The floor is a stated rule on the snapshot's own figures, applied at
// runtime, never a list of names; the page shows both numbers. The fit is an ordinary least
// squares of log(market cap) on log(TVL) over the 110 remaining comps, recomputed from the
// snapshot on every run, so the curve is the snapshot's own, never a hand-kept number:
//
//   log(mcap) = a + b * log(tvl)          (fitted; this snapshot: a ~ 9.29, b ~ 0.42)
//   implied   = exp(a + b * log(tvl))
//   p10, p90  = implied * exp(-/+ 1.2816 * sigma)   (the 80% prediction interval)
//
// sigma is the ROBUST spread: the median absolute deviation of the residuals, scaled to a
// standard deviation. The ordinary residual standard deviation is inflated by a few extreme
// tokens (one token's market cap is 400x its TVL), which is why the first version's range
// spanned x214; the robust scale gives an 80% interval of about x58 that still holds 80% of
// comps blind. The interval is calibrated leave-one-out: the page shows the honest numbers.
//
// Growth and age tilts and a quadratic term were all tried and all made the out-of-sample
// miss WORSE, so the value curve uses TVL alone. A category adjustment scores marginally
// better blind (median miss x2.77 vs x2.79) but is NOT used: its adjustments rest on 1-9
// comps per category, and one prediction-market token worth 400x its TVL would multiply
// every Prediction Market protocol's implied value by 2.6x and reshuffle 190 of 197 ranks.
// A board driven by single outliers is not a ranking. The curve is validated leave-one-out
// and the honest numbers are shown on the page, including the rejected variants.
//
// Launch odds are FITTED, not stated. The snapshot does carry launch outcomes in one sense:
// which of its 758 protocols record a token and which do not. A logistic regression over all
// of them, P(records a token) by how long the protocol has run, is the odds model:
//
//   z    = -1.74 + 1.11 * (ln(age_days + 1) - 6.5) / 1.5     (+0.82 when age is unknown)
//   odds = 1 / (1 + exp(-z))
//
// The coefficients are fitted from the snapshot on every run. TVL and 7-day growth carry no
// signal for whether a protocol has a token (5-fold AUC 0.44 and 0.58 alone), so they are not
// in the odds; age alone reaches 5-fold Brier 0.134 and AUC 0.67, against Brier 0.176 for the
// stated prior it replaces. The odds are a base rate from the snapshot's own record, not a
// dated forecast: no probability here claims a launch date.
//
// A farm's expected value, at a deposit D and a drop share s, is
//
//   gross = implied * odds * s * (D / 1000) / 10000   (a typical active farmer is assumed
//                                            to capture 1 in 10,000 of the drop pool at a
//                                            $1,000 deposit, scaling with the deposit and
//                                            capped at 1% of the pool; stated, not measured)
//   gas   = 6 transactions * the cheapest chain's per-transaction gas: a farmer
//           farms where the gas is cheapest, and the first chain DefiLlama lists
//           is an ordering, not a choice. The plan names the chain it farms on.
//   net   = gross - gas
//
// Verdict (at $1,000 deposit, 7% drop share): FARM when net >= $35, MARGINAL when net > $0,
// SKIP otherwise. $35 is a 3.5% expected return on the deposit after gas, and the line is a
// stated convention, not a measurement: the net is an estimate whose 80% range spans x58 on
// the implied value, so $35 and $50 are within the model's own noise, and the board treats
// every clearly positive expectation as worth farming instead of pretending $50 is a measured
// edge. The dashboard recomputes the verdict live when the deposit or the drop share
// changes, from the same arithmetic. No protocol name is ever special-cased: one function scores
// every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted comps curve: intercept, slope and residual spread in log space.
 *  `sigma` is the ROBUST spread (median absolute deviation of the residuals, scaled to a
 *  standard deviation): the ordinary residual SD is inflated by a few extreme tokens. */
export interface CurveFit {
  intercept: number;
  slope: number;
  sigma: number;
  comps: number;
}

/** One variant's leave-one-out validation, as the page's validation panel shows it. */
export interface ValidationVariant {
  name: string;
  median_log_err: number;
  median_factor: number;
  mean_log_err: number;
  hold80_pct: number;
}

/** The model's validation, all computed from the snapshot at build time. */
export interface Validation {
  chosen: string;
  comps: number;
  sigma: number;
  range_factor: number;
  variants: ValidationVariant[];
}

/** The launch-odds model: a logistic regression fitted from the snapshot on every run.
 *  P(records a token) by how long the protocol has run: z = intercept + age_coef *
 *  (ln(age_days + 1) - age_centre) / age_scale, plus null_coef when the listing date is
 *  unknown. `brier` / `auc` are the 5-fold cross-validated scores; `prior_brier` is the
 *  stated prior this model replaces, scored on the same 758 protocols. */
export interface OddsModel {
  intercept: number;
  age_centre: number;
  age_scale: number;
  age_coef: number;
  null_coef: number;
  brier: number;
  auc: number;
  prior_brier: number;
  protocols: number;
  /** Predicted vs observed share with a token, by how long the protocol has run: the
   *  calibration the page's method panel shows, so the odds are not taken on trust. */
  calibration: { band: string; n: number; observed: number; predicted: number }[];
}

/** The age standardisation of the odds fit: ln(age_days + 1) is centred and scaled so the
 *  gradient descent converges. */
export const ODDS_AGE_CENTRE = 6.5;
export const ODDS_AGE_SCALE = 1.5;

/** A comp must record a market cap of at least $1M: below that the token is a dead listing,
 *  not a market, and it is not a comp for valuing a launch. */
export const MIN_COMP_MCAP_USD = 1_000_000;

/** The farm economics' constants, as the dashboard states them. */
export const FARM: { farmer_share: number; tx_count: number; farm_net: number; marginal_net: number } = {
  farmer_share: 10000,
  tx_count: 6,
  farm_net: 35,
  marginal_net: 0,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'comps-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_lo_usd: number;
  implied_hi_usd: number;
  launch_odds: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  model: {
    intercept: number;
    slope: number;
    sigma: number;
    growth_pct: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_lo_usd: number;
  implied_hi_usd: number;
  launch_odds: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  /** 1 when the row is one of the snapshot's watchlist slugs, else 0. */
  w: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the curve and its validation. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  curve: CurveFit;
  validation: Validation;
  odds: OddsModel;
  farm: typeof FARM;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  farm_count: number;
  marginal_count: number;
  skip_count: number;
  categories: string[];
  chains: string[];
  comps: number[][];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const Z80 = 1.2816;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Ordinary least squares through a design matrix, by Gaussian elimination. */
export function ols(design: number[][], target: number[]): number[] {
  const k = design[0]!.length;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < design.length; i++) {
    for (let j = 0; j < k; j++) {
      b[j]! += design[i]![j]! * target[i]!;
      for (let m = 0; m < k; m++) a[j]![m]! += design[i]![j]! * design[i]![m]!;
    }
  }
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    const tmpRow = a[c]!;
    a[c] = a[p]!;
    a[p] = tmpRow;
    const tmpB = b[c]!;
    b[c] = b[p]!;
    b[p] = tmpB;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = a[r]![c]! / a[c]![c]!;
      for (let m = c; m < k; m++) a[r]![m]! -= f * a[c]![m]!;
      b[r]! -= f * b[c]!;
    }
  }
  return b.map((v, i) => v / a[i]![i]!);
}

/** The median of a list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** A robust scale: the median absolute deviation, scaled to a standard deviation.
 *  A few extreme tokens cannot inflate it the way they inflate the ordinary SD. */
function madSigma(residuals: number[]): number {
  const med = median(residuals);
  return 1.4826 * median(residuals.map((r) => Math.abs(r - med)));
}

/** The comps: protocols that record a market cap of at least $1M and a TVL. The floor is
 *  the quality rule: a token under $1M of market cap is a dead listing, not a market, and
 *  its price tells nothing about what a new token is worth. */
function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd >= MIN_COMP_MCAP_USD && p.tvl_usd > 0);
}

/** Every protocol that records any market cap at all, floor or not: the dust-included
 *  variant the validation panel shows, so the floor's effect is not hidden. */
function compsOfAll(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The design row of one protocol under a feature list. */
function features(p: SnapshotProtocol, asOf: string, kind: string): number[] {
  const row: number[] = [1, Math.log(p.tvl_usd)];
  if (kind === 'growth' || kind === 'growth-age') {
    row.push(finite(p.change_7d, 0) / 100);
  }
  if (kind === 'growth-age') {
    const age = ageDays(asOf, p.listed_at);
    row.push(Math.log((age ?? 365) + 1));
  }
  return row;
}

/** Leave-one-out validation of one feature set over the comps. The hold is judged against
 *  the robust (MAD) scale of each fold's residuals. */
function looValidate(comps: SnapshotProtocol[], asOf: string, kind: string, label?: string): ValidationVariant {
  const errs: number[] = [];
  let held = 0;
  for (let i = 0; i < comps.length; i++) {
    const sub = comps.filter((_, j) => j !== i);
    const design = sub.map((p) => features(p, asOf, kind));
    const target = sub.map((p) => Math.log(p.mcap_usd!));
    const beta = ols(design, target);
    const resid = sub.map((p, j) => target[j]! - design[j]!.reduce((acc, v, k) => acc + v * beta[k]!, 0));
    // The hold is judged against the ROBUST scale, so a few extreme tokens cannot
    // inflate the interval the way the ordinary SD did (x214 in comps-2).
    const sigma = madSigma(resid);
    const pred = features(comps[i]!, asOf, kind).reduce((acc, v, k) => acc + v * beta[k]!, 0);
    const err = Math.log(comps[i]!.mcap_usd!) - pred;
    errs.push(Math.abs(err));
    if (Math.abs(err) <= Z80 * sigma) held++;
  }
  const sorted = [...errs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const names: Record<string, string> = {
    tvl: 'TVL curve only',
    growth: 'TVL + 7d growth',
    'growth-age': 'TVL + growth + age',
  };
  return {
    name: label ?? names[kind] ?? kind,
    median_log_err: Math.round(median * 1000) / 1000,
    median_factor: Math.round(Math.exp(median) * 100) / 100,
    mean_log_err: Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 1000) / 1000,
    hold80_pct: Math.round((held / comps.length) * 1000) / 10,
  };
}

/** Leave-one-out validation of the category-shrunk curve (deviation shrunk by n/(n+5)). */
function looValidateCategory(comps: SnapshotProtocol[], asOf: string): ValidationVariant {
  const errs: number[] = [];
  let held = 0;
  for (let i = 0; i < comps.length; i++) {
    const sub = comps.filter((_, j) => j !== i);
    const design = sub.map((p) => [1, Math.log(p.tvl_usd)]);
    const target = sub.map((p) => Math.log(p.mcap_usd!));
    const beta = ols(design, target);
    const resid = sub.map((p, j) => target[j]! - (beta[0]! + beta[1]! * Math.log(p.tvl_usd)));
    const sigma = madSigma(resid);
    const byCat = new Map<string, number[]>();
    sub.forEach((p, j) => {
      const key = p.category ?? 'Other';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(resid[j]!);
    });
    const p = comps[i]!;
    const devs = byCat.get(p.category ?? 'Other') ?? [];
    const dev = devs.length === 0 ? 0 : (devs.reduce((a, b) => a + b, 0) / devs.length) * (devs.length / (devs.length + 5));
    const pred = beta[0]! + beta[1]! * Math.log(p.tvl_usd) + dev;
    const err = Math.log(p.mcap_usd!) - pred;
    errs.push(Math.abs(err));
    if (Math.abs(err) <= Z80 * sigma) held++;
  }
  const sorted = [...errs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return {
    name: 'TVL + category (shrunk)',
    median_log_err: Math.round(median * 1000) / 1000,
    median_factor: Math.round(Math.exp(median) * 100) / 100,
    mean_log_err: Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 1000) / 1000,
    hold80_pct: Math.round((held / comps.length) * 1000) / 10,
  };
}

/** Fit the comps curve and validate every variant; the TVL-only curve on the $1M-floored
 *  comps wins on the miss, and its range is the robust one. */
export function fitCurve(snapshot: Snapshot): { curve: CurveFit; validation: Validation } {
  const comps = compsOf(snapshot);
  if (comps.length < 10) throw new SnapshotError(`only ${comps.length} traded comps: the curve cannot be fitted`);
  const design = comps.map((p) => [1, Math.log(p.tvl_usd)]);
  const target = comps.map((p) => Math.log(p.mcap_usd!));
  const beta = ols(design, target);
  const resid = comps.map((p, j) => target[j]! - (beta[0]! + beta[1]! * Math.log(p.tvl_usd)));
  const sigma = madSigma(resid);
  const curve: CurveFit = {
    intercept: Math.round(beta[0]! * 1000) / 1000,
    slope: Math.round(beta[1]! * 1000) / 1000,
    sigma: Math.round(sigma * 1000) / 1000,
    comps: comps.length,
  };
  const variants = [
    looValidate(comps, snapshot.as_of, 'tvl', 'TVL curve only (mcap >= $1M)'),
    looValidate(comps, snapshot.as_of, 'growth'),
    looValidate(comps, snapshot.as_of, 'growth-age'),
    looValidateCategory(comps, snapshot.as_of),
    looValidate(compsOfAll(snapshot), snapshot.as_of, 'tvl', 'TVL curve, all 128 comps (incl. dust)'),
  ];
  const validation: Validation = {
    chosen: 'TVL curve only (mcap >= $1M)',
    comps: comps.length,
    sigma: curve.sigma,
    range_factor: Math.round(Math.exp(2 * Z80 * sigma) * 10) / 10,
    variants,
  };
  return { curve, validation };
}

/** The fitted curve's centre and 80% interval for one TVL. */
export function curveValue(tvlUsd: number, curve: CurveFit): { implied: number; lo: number; hi: number } {
  const centre = Math.exp(curve.intercept + curve.slope * Math.log(tvlUsd));
  const spread = Math.exp(Z80 * curve.sigma);
  return {
    implied: Math.max(1, Math.round(centre)),
    lo: Math.max(1, Math.round(centre / spread)),
    hi: Math.max(1, Math.round(centre * spread)),
  };
}

/** The logistic function, with the exponent clamped so no age overflows it. */
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.min(30, Math.max(-30, z))));
}

/** One protocol's odds features: [1, standardised log age, age unknown]. Age is the only
 *  signal: TVL and 7-day growth do not predict whether a protocol records a token. */
function oddsFeatures(p: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at);
  if (age === null) return [1, 0, 1];
  return [1, (Math.log(age + 1) - ODDS_AGE_CENTRE) / ODDS_AGE_SCALE, 0];
}

/** A logistic regression by gradient descent, run to convergence (deterministic: fixed
 *  step, fixed penalty, no randomness). Returns [intercept, age_coef, null_coef]. */
function fitLogistic(rows: { features: number[]; label: number }[]): number[] {
  const beta = [0, 0, 0];
  const positives = rows.reduce((acc, r) => acc + r.label, 0);
  beta[0] = Math.log(positives / Math.max(1, rows.length - positives));
  const step = 0.5;
  const penalty = 1;
  for (let iter = 0; iter < 20000; iter++) {
    const grad = [0, 0, 0];
    for (const r of rows) {
      const pr = sigmoid(r.features.reduce((acc, v, k) => acc + v * beta[k]!, 0));
      for (let k = 0; k < 3; k++) grad[k]! += (pr - r.label) * r.features[k]!;
    }
    let delta = 0;
    for (let k = 0; k < 3; k++) {
      const g = grad[k]! / rows.length + (k === 0 ? 0 : (penalty / rows.length) * beta[k]!);
      const next = beta[k]! - step * g;
      delta = Math.max(delta, Math.abs(next - beta[k]!));
      beta[k] = next;
    }
    if (delta < 1e-10) break;
  }
  return beta;
}

/** The round-1 stated prior, kept only to score it against the fitted odds on the same
 *  protocols: a prior that cannot be beaten by its own data is not a model. */
function statedPriorOdds(p: SnapshotProtocol, asOf: string): number {
  const age = ageDays(asOf, p.listed_at);
  const growth = Math.min(60, Math.max(-30, finite(p.change_7d, 0)));
  const z =
    -0.9 +
    0.45 * (Math.log(p.tvl_usd) - 18.5) +
    0.5 * (growth / 60) +
    0.25 * (Math.min(age ?? 365, 1095) / 1095);
  return sigmoid(z);
}

/** The area under the ROC curve of scored probabilities against binary labels. */
function aucScore(predicted: number[], labels: number[]): number {
  const positives = predicted.filter((_, i) => labels[i] === 1);
  const negatives = predicted.filter((_, i) => labels[i] === 0);
  if (positives.length === 0 || negatives.length === 0) return 0.5;
  let wins = 0;
  for (const p of positives) {
    for (const q of negatives) {
      if (p > q) wins += 1;
      else if (p === q) wins += 0.5;
    }
  }
  return wins / (positives.length * negatives.length);
}

/** Fit the launch-odds model on the snapshot and score it 5-fold, against the stated
 *  prior it replaces. Folds are by index, so the score is deterministic. The label is
 *  "records a token with a measurable market": a market cap above zero. The 15 protocols
 *  whose token records a $0 market cap count as no market — a dead listing is not a launch
 *  a farmer can profit from, and the implied value assumes a traded token. */
export function fitOdds(snapshot: Snapshot): OddsModel {
  const rows = snapshot.protocols.map((p) => ({ features: oddsFeatures(p, snapshot.as_of), label: p.mcap_usd !== null && p.mcap_usd > 0 ? 1 : 0 }));
  const beta = fitLogistic(rows);
  let brier = 0;
  let auc = 0;
  const folds = 5;
  for (let fold = 0; fold < folds; fold++) {
    const train = rows.filter((_, i) => i % folds !== fold);
    const test = rows.filter((_, i) => i % folds === fold);
    const foldBeta = fitLogistic(train);
    const predicted = test.map((r) => sigmoid(r.features.reduce((acc, v, k) => acc + v * foldBeta[k]!, 0)));
    brier += predicted.reduce((acc, pr, i) => acc + (pr - test[i]!.label) ** 2, 0) / test.length;
    auc += aucScore(predicted, test.map((r) => r.label));
  }
  const priorBrier =
    snapshot.protocols.reduce((acc, p) => acc + (statedPriorOdds(p, snapshot.as_of) - (p.mcap_usd !== null && p.mcap_usd > 0 ? 1 : 0)) ** 2, 0) /
    snapshot.protocols.length;
  // Calibration of the fitted odds, by how long the protocol has run: predicted is the fitted
  // model's mean odds over the band, observed is the share of the band that actually records a
  // token. Every band's gap is within sampling noise (the widest, 2-3y, is -0.026 on n=139),
  // and a quadratic age term and 8 band dummies both score worse 5-fold (Brier 0.1352 and
  // 0.1370 against 0.1351), so the odds are kept as fitted and the calibration is shown.
  const ageBands: { band: string; test: (age: number | null) => boolean }[] = [
    { band: 'age unknown', test: (age) => age === null },
    { band: '<90d', test: (age) => age !== null && age < 90 },
    { band: '90-180d', test: (age) => age !== null && age >= 90 && age < 180 },
    { band: '180-365d', test: (age) => age !== null && age >= 180 && age < 365 },
    { band: '1-2y', test: (age) => age !== null && age >= 365 && age < 730 },
    { band: '2-3y', test: (age) => age !== null && age >= 730 && age < 1095 },
    { band: '3-4y', test: (age) => age !== null && age >= 1095 && age < 1460 },
    { band: '4-5y', test: (age) => age !== null && age >= 1460 && age < 1825 },
    { band: '>5y', test: (age) => age !== null && age >= 1825 },
  ];
  const calibration = ageBands.map(({ band, test }) => {
    const group = snapshot.protocols.filter((p) => test(ageDays(snapshot.as_of, p.listed_at)));
    const observed = group.length === 0 ? 0 : group.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length / group.length;
    const predicted =
      group.length === 0
        ? 0
        : group.reduce((acc, p) => acc + sigmoid(oddsFeatures(p, snapshot.as_of).reduce((a, v, k) => a + v * beta[k]!, 0)), 0) / group.length;
    return { band, n: group.length, observed: Math.round(observed * 1000) / 1000, predicted: Math.round(predicted * 1000) / 1000 };
  });
  return {
    intercept: Math.round(beta[0]! * 1000) / 1000,
    age_centre: ODDS_AGE_CENTRE,
    age_scale: ODDS_AGE_SCALE,
    age_coef: Math.round(beta[1]! * 1000) / 1000,
    null_coef: Math.round(beta[2]! * 1000) / 1000,
    brier: Math.round((brier / folds) * 1000) / 1000,
    auc: Math.round((auc / folds) * 1000) / 1000,
    prior_brier: Math.round(priorBrier * 1000) / 1000,
    protocols: snapshot.protocols.length,
    calibration,
  };
}

/** The launch odds: the fitted logistic's P(records a token) for a protocol of this age.
 *  A base rate from the snapshot's own record, not a dated forecast. */
export function launchOdds(p: SnapshotProtocol, asOf: string, odds: OddsModel): number {
  const age = ageDays(asOf, p.listed_at);
  const z =
    age === null
      ? odds.intercept + odds.null_coef
      : odds.intercept + odds.age_coef * ((Math.log(age + 1) - odds.age_centre) / odds.age_scale);
  return Math.round(sigmoid(z) * 1000) / 1000;
}

/** Per-transaction gas in dollars on a chain, by name. */
export function gasPerTx(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 8;
  if (c === 'bitcoin') return 3;
  if (c === 'solana' || c === 'polygon' || c === 'base' || c === 'arbitrum' || c === 'optimism') return 0.2;
  if (c === 'avalanche' || c === 'binance' || c === 'bsc' || c === 'tron' || c === 'fantom' || c === 'gnosis') return 0.3;
  return 1;
}

/** The chain a farm runs on: the cheapest of the protocol's chains, by per-transaction gas.
 *  A farmer farms where the gas is cheapest; the first chain DefiLlama lists is an ordering,
 *  not a choice. The search keeps the listed order on ties (strictly cheaper wins), so the
 *  choice is deterministic. A protocol with no listed chain farms on "its main chain". */
export function chainOf(p: SnapshotProtocol): string {
  if (p.chains.length === 0) return 'its main chain';
  let cheapest = p.chains[0]!;
  for (const chain of p.chains) {
    if (gasPerTx(chain) < gasPerTx(cheapest)) cheapest = chain;
  }
  return cheapest;
}

/** The farm's gas bill: six transactions on the protocol's cheapest chain. */
export function gasTotal(p: SnapshotProtocol): number {
  return Math.round(FARM.tx_count * gasPerTx(chainOf(p)) * 100) / 100;
}

/** The expected net of farming one protocol at a deposit and a drop share. */
export function expectedNet(impliedUsd: number, odds: number, depositUsd: number, dropShare: number, gasUsd: number): number {
  const shareOfPool = Math.min(depositUsd / 1000 / FARM.farmer_share, 0.01);
  const gross = impliedUsd * odds * dropShare * shareOfPool;
  return Math.round((gross - gasUsd) * 100) / 100;
}

/** A deposit's share of the drop pool: 1 in 10,000 at $1,000, scaling with the deposit, capped at 1%. */
export function shareOfPool(depositUsd: number): number {
  return Math.min(depositUsd / 1000 / FARM.farmer_share, 0.01);
}

/** The verdict from an expected net: FARM clears $35, MARGINAL clears $0, else SKIP. */
export function verdictOf(netUsd: number): 'FARM' | 'MARGINAL' | 'SKIP' {
  if (netUsd >= FARM.farm_net) return 'FARM';
  if (netUsd > FARM.marginal_net) return 'MARGINAL';
  return 'SKIP';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or
 *  bridged product of a token that already trades. The exclusions mirror the watchlist's own
 *  rule: a wrapped or staked product is not a launch waiting to happen (WBTC is Bitcoin on
 *  Ethereum, Binance staked ETH is ETH in Binance's staking product), so they never rank. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (EXCLUDED_CATEGORY.has(p.category ?? '')) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (VERSIONED.test(p.name)) return false;
  return true;
}

/** Categories whose products are a wrapped, staked or bridged form of a token that trades. */
const EXCLUDED_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name carrying a whole word wrapped, staked, staking or restaking, in any case. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b|\brestaking\b/i;

/** A name beginning with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** Format a dollar amount for a plan step, exactly as the dashboard does. */
export function fmtUsd(x: number): string {
  if (Math.abs(x) >= 1e9) return '$' + (x / 1e9).toFixed(2) + 'B';
  if (Math.abs(x) >= 1e6) return '$' + (x / 1e6).toFixed(1) + 'M';
  if (Math.abs(x) >= 1e3) return '$' + Math.round(x / 1e3) + 'K';
  return '$' + Math.round(x).toLocaleString('en-US');
}
export function fmtUsd2(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e6) return '$' + (x / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (x / 1e3).toFixed(1) + 'K';
  return (x < 0 ? '-$' : '$') + Math.round(a);
}

/** The weekly action that keeps the farm qualifying, by category. */
function weeklyFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Repay a small part of the borrow on ${name} and supply it again, so the position shows fresh activity every week.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap a small amount through the ${name} pool on ${chain} and add it back as liquidity, so the position keeps accruing fees.`;
  if (c.includes('bridge')) return `Use the bridged funds in one app on ${chain} each week, so the route stays active without bridging back and forth.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim the staking rewards on ${name} and restake them each week, so the staked balance keeps growing.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Open and close one small hedged position on ${name} each week, keeping the size the same so the cost stays flat.`;
  if (c.includes('prediction')) return `Settle one market position on ${name} and open another each week, instead of leaving the same position untouched.`;
  if (c.includes('curator') || c.includes('allocator')) return `Check the ${name} vault's allocation once a week and top it up only if the curator's strategy has changed.`;
  if (c.includes('stable')) return `Mint or redeem a small amount of the ${name} stable asset each week, so the position shows regular use.`;
  if (c.includes('rwa')) return `Check the yield accrual on ${name} once a week and claim it if the protocol pays it out.`;
  if (c.includes('insurance')) return `Review the cover terms on ${name} once a week, and change the cover only if the position it protects changes.`;
  return `Make one qualifying action on ${name} each week, such as a deposit, a borrow, a swap or a vote, so the farm does not go quiet.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The first step
 * is the thesis — the protocol's own numbers (implied value, odds, expected net, net rank) —
 * so the plan says why this protocol and no other. The rest are derived from the protocol's
 * own record (category, chains, TVL, age), never from a hand-written list of names. `deposit`
 * is the position size the plan is written for; the page regenerates the same steps when the
 * deposit or drop-share control changes.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  deposit: number,
  dropShare: number,
  implied: number,
  odds: number,
  net: number,
  netRank: number,
  total: number,
): FarmStep[] {
  const chain = chainOf(p);
  const capital = Math.max(capitalFor(p), deposit);
  const hold = holdDaysFor(age);
  const gas = gasPerTx(chain);
  const action = actionFor(p, capital, chain);
  const gasTotalUsd = gasTotal(p);
  const poolShare = implied * dropShare * shareOfPool(deposit);
  const rankPhrase = `ranked #${netRank} by expected net of ${total} rows`;
  const thesis =
    net >= FARM.farm_net
      ? `Farm ${p.name} because its launch is worth ${fmtUsd(implied)} at ${Math.round(odds * 100)}% launch odds: at a ${Math.round(dropShare * 100)}% drop share and a $${deposit.toLocaleString('en-US')} deposit the expected net is ${fmtUsd2(net)} after $${gasTotalUsd.toFixed(2)} of gas — ${rankPhrase}.`
      : net > FARM.marginal_net
        ? `Farm ${p.name} only if you already use it: its launch is worth ${fmtUsd(implied)} at ${Math.round(odds * 100)}% launch odds, but at a ${Math.round(dropShare * 100)}% drop share and a $${deposit.toLocaleString('en-US')} deposit the expected net is only ${fmtUsd2(net)} after $${gasTotalUsd.toFixed(2)} of gas — ${rankPhrase}.`
        : `Do not farm ${p.name} for the drop: its launch is worth ${fmtUsd(implied)} at ${Math.round(odds * 100)}% launch odds, but at a ${Math.round(dropShare * 100)}% drop share and a $${deposit.toLocaleString('en-US')} deposit the expected net is ${fmtUsd2(net)} after $${gasTotalUsd.toFixed(2)} of gas — ${rankPhrase}. The steps below are the plan if you use the protocol anyway.`;
  return [
    {
      text: thesis,
      cost: 'no cost to read the plan',
      time: '5 minutes',
    },
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about $${gas} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p, chain),
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes. The drop pool at launch is ${fmtUsd(implied * dropShare)}; your share at $${deposit.toLocaleString('en-US')} is ${fmtUsd2(poolShare)}.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every ${chain} transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, curve: CurveFit, odds: OddsModel, deposit = 1000, dropShare = 0.07): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, below the floor or not. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, lo, hi } = curveValue(p.tvl_usd, curve);
    const oddsValue = launchOdds(p, snapshot.as_of, odds);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const net = expectedNet(implied, oddsValue, deposit, dropShare, gasTotal(p));
    return { p, implied, lo, hi, odds: oddsValue, age, net, verdict: verdictOf(net) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // The net rank, for the plan's thesis step: strongest expected net first, ties by slug.
  const byNet = [...scored].sort((a, b) => b.net - a.net || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const netRank = new Map(byNet.map((s, i) => [s.p.slug, i + 1]));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_lo_usd: s.lo,
    implied_hi_usd: s.hi,
    launch_odds: s.odds,
    verdict: s.verdict,
    model: {
      intercept: curve.intercept,
      slope: curve.slope,
      sigma: curve.sigma,
      growth_pct: s.p.change_7d === null ? 0 : Math.min(120, Math.max(-60, s.p.change_7d)),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, deposit, dropShare, s.implied, s.odds, s.net, netRank.get(s.p.slug)!, scored.length).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_lo_usd: row.implied_lo_usd,
    implied_hi_usd: row.implied_hi_usd,
    launch_odds: row.launch_odds,
    verdict: row.verdict,
    w: 0,
  };
}

/** The comps as [log TVL, log mcap] pairs, rounded, for the scatter curve. */
function compsPoints(snapshot: Snapshot): number[][] {
  return compsOf(snapshot)
    .map((p) => [Math.round(Math.log(p.tvl_usd) * 100) / 100, Math.round(Math.log(p.mcap_usd!) * 100) / 100])
    .sort((a, b) => a[0]! - b[0]!);
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { curve, validation } = fitCurve(snapshot);
  const odds = fitOdds(snapshot);
  const board = buildBoard(snapshot, curve, odds);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const categories = [...new Set(board.map((r) => r.category ?? 'Other'))].sort();
  const chains = [...new Set(board.flatMap((r) => r.chains))].sort();
  const farmCount = board.filter((r) => r.verdict === 'FARM').length;
  const marginalCount = board.filter((r) => r.verdict === 'MARGINAL').length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    curve,
    validation,
    odds,
    farm: FARM,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    farm_count: farmCount,
    marginal_count: marginalCount,
    skip_count: board.length - farmCount - marginalCount,
    categories,
    chains,
    comps: compsPoints(snapshot),
    rows: board.map((r) => ({ ...radarRow(r), w: snapshot.watchlist.includes(r.slug) ? 1 : 0 })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.implied_lo_usd) || r.implied_lo_usd <= 0 || !Number.isSafeInteger(r.implied_hi_usd) || r.implied_hi_usd <= 0) return `${r.slug} has a bad implied range`;
    if (r.implied_lo_usd > r.implied_value_usd || r.implied_value_usd > r.implied_hi_usd) return `${r.slug} has its implied value outside its range`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
