// LaunchScope's model: a comps-fitted launch radar.
//
// One snapshot of the protocol universe in, one ranked board out. The board covers every slug in
// the snapshot's watchlist (the floor, never the ceiling) plus every other rankable pre-token
// protocol below it: the early rows the radar exists to find. A protocol is pre-token when its
// record carries no token (no market cap, no CoinGecko id, no symbol); live-token protocols are
// kept apart and shown with the market's own values, never mixed into the ranked board.
//
// Implied value is FITTED, not assumed. The traded tokens inside the snapshot itself are the
// comps: an ordinary least squares fit of log(market cap) on log(TVL) over the 128 protocols
// that record both. The fit is recomputed from the snapshot on every run, so the curve is the
// snapshot's own, never a hand-kept number:
//
//   log(mcap) = a + b * log(tvl)          (fitted; this snapshot: a ~ 6.97, b ~ 0.52)
//   implied   = exp(a + b * log(tvl))
//   p10, p90  = implied * exp(-/+ 1.2816 * sigma)   (the 80% prediction interval)
//
// The spread is wide because the comps are: the curve is validated leave-one-out and the honest
// numbers are shown on the page. Growth and age tilts, category shrinkage and winsorising were
// all tried and all made the out-of-sample miss WORSE, so the value curve uses TVL alone; growth
// and age instead feed the launch-odds prior, which is stated, not fitted, because the snapshot
// carries no launch outcomes to fit on.
//
// Launch odds are a stated prior, a logistic in size, growth and age:
//
//   z    = -0.9 + 0.45 * (ln(tvl) - 18.5) + 0.5 * clamp(growth, -30, 60) / 60
//          + 0.25 * min(age_days, 1095) / 1095
//   odds = 1 / (1 + exp(-z))
//
// A farm's expected value, at a deposit D and a drop share s, is
//
//   gross = implied * odds * s * (D / 1000) / 10000   (a typical active farmer is assumed
//                                            to capture 1 in 10,000 of the drop pool at a
//                                            $1,000 deposit, scaling with the deposit and
//                                            capped at 1% of the pool; stated, not measured)
//   gas   = 6 transactions * the first chain's per-transaction gas
//   net   = gross - gas
//
// Verdict (at $1,000 deposit, 7% drop share): FARM when net >= $50, MARGINAL when net > $0,
// SKIP otherwise. The dashboard recomputes the verdict live when the deposit or the drop share
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

/** The fitted comps curve: intercept, slope and residual spread in log space. */
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

/** The launch-odds prior's constants, as the dashboard states them. */
export interface OddsPrior {
  intercept: number;
  size_weight: number;
  size_centre: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  age_weight: number;
  age_days: number;
}

export const ODDS: OddsPrior = {
  intercept: -0.9,
  size_weight: 0.45,
  size_centre: 18.5,
  growth_weight: 0.5,
  growth_floor: -30,
  growth_cap: 60,
  age_weight: 0.25,
  age_days: 1095,
};

/** The farm economics' constants, as the dashboard states them. */
export const FARM: { farmer_share: number; tx_count: number; farm_net: number; marginal_net: number } = {
  farmer_share: 10000,
  tx_count: 6,
  farm_net: 50,
  marginal_net: 0,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'comps-2';

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
  odds: OddsPrior;
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

/** The comps: protocols that record both a market cap and a TVL. */
function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
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

/** Leave-one-out validation of one feature set over the comps. */
function looValidate(comps: SnapshotProtocol[], asOf: string, kind: string): ValidationVariant {
  const errs: number[] = [];
  let held = 0;
  for (let i = 0; i < comps.length; i++) {
    const sub = comps.filter((_, j) => j !== i);
    const design = sub.map((p) => features(p, asOf, kind));
    const target = sub.map((p) => Math.log(p.mcap_usd!));
    const beta = ols(design, target);
    const resid = sub.map((p, j) => target[j]! - design[j]!.reduce((acc, v, k) => acc + v * beta[k]!, 0));
    const sigma = Math.sqrt(resid.reduce((acc, r) => acc + r * r, 0) / (sub.length - design[0]!.length));
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
    name: names[kind] ?? kind,
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
    const sigma = Math.sqrt(resid.reduce((acc, r) => acc + r * r, 0) / (sub.length - 2));
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

/** Fit the comps curve and validate every variant; the TVL-only curve wins on the miss. */
export function fitCurve(snapshot: Snapshot): { curve: CurveFit; validation: Validation } {
  const comps = compsOf(snapshot);
  if (comps.length < 10) throw new SnapshotError(`only ${comps.length} traded comps: the curve cannot be fitted`);
  const design = comps.map((p) => [1, Math.log(p.tvl_usd)]);
  const target = comps.map((p) => Math.log(p.mcap_usd!));
  const beta = ols(design, target);
  const resid = comps.map((p, j) => target[j]! - (beta[0]! + beta[1]! * Math.log(p.tvl_usd)));
  const sigma = Math.sqrt(resid.reduce((acc, r) => acc + r * r, 0) / (comps.length - 2));
  const curve: CurveFit = {
    intercept: Math.round(beta[0]! * 1000) / 1000,
    slope: Math.round(beta[1]! * 1000) / 1000,
    sigma: Math.round(sigma * 1000) / 1000,
    comps: comps.length,
  };
  const variants = [
    looValidate(comps, snapshot.as_of, 'tvl'),
    looValidate(comps, snapshot.as_of, 'growth'),
    looValidate(comps, snapshot.as_of, 'growth-age'),
    looValidateCategory(comps, snapshot.as_of),
  ];
  const validation: Validation = {
    chosen: 'TVL curve only',
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

/** The launch-odds prior: a stated logistic in size, growth and age. */
export function launchOdds(p: SnapshotProtocol, asOf: string): number {
  const age = ageDays(asOf, p.listed_at);
  const growth = Math.min(ODDS.growth_cap, Math.max(ODDS.growth_floor, finite(p.change_7d, 0)));
  const z =
    ODDS.intercept +
    ODDS.size_weight * (Math.log(p.tvl_usd) - ODDS.size_centre) +
    ODDS.growth_weight * (growth / 60) +
    ODDS.age_weight * (Math.min(age ?? 365, ODDS.age_days) / ODDS.age_days);
  const odds = 1 / (1 + Math.exp(-z));
  return Math.round(odds * 1000) / 1000;
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

/** The first chain a protocol names, or a neutral phrase. */
export function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The farm's gas bill: six transactions on the protocol's first chain. */
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

/** The verdict from an expected net: FARM clears $50, MARGINAL clears $0, else SKIP. */
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

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. `deposit` is the position size the plan is written for; the page regenerates the same
 * steps when the deposit control changes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, deposit: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = Math.max(capitalFor(p), deposit);
  const hold = holdDaysFor(age);
  const gas = gasPerTx(chain);
  const action = actionFor(p, capital, chain);
  return [
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
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, curve: CurveFit, deposit = 1000, dropShare = 0.07): BoardRow[] {
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
    const odds = launchOdds(p, snapshot.as_of);
    const age = ageDays(snapshot.as_of, p.listed_at);
    const net = expectedNet(implied, odds, deposit, dropShare, gasTotal(p));
    return { p, implied, lo, hi, odds, age, net, verdict: verdictOf(net) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
    farm_steps: farmSteps(s.p, s.age, deposit).map(stepText),
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
  const board = buildBoard(snapshot, curve);
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
    odds: ODDS,
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
