// LaunchScope's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, filters, the comps scatter, the validation panel and a per-protocol
// detail drawer with a farm plan that recomputes when the deposit or drop-share control moves.
// No network: every byte it shows is in data.js. The model below mirrors lib/model.ts exactly:
// the page recomputes a row from the snapshot figures and checks the number board.json carries.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', tab: 'all', sort: 'implied', dir: -1, selected: null, deposit: 1000, share: 0.07 };
  var Z80 = 1.2816;
  var WL = {};
  DATA.rows.forEach(function (r) { if (r.w) WL[r.slug] = true; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtUsd2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return (n < 0 ? '-$' : '$') + Math.round(a);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }

  // ---- the model, mirrored from lib/model.ts --------------------------------
  function curveValue(tvl) {
    var c = DATA.curve;
    var centre = Math.exp(c.intercept + c.slope * Math.log(tvl));
    var spread = Math.exp(Z80 * c.sigma);
    return { implied: Math.max(1, Math.round(centre)), lo: Math.max(1, Math.round(centre / spread)), hi: Math.max(1, Math.round(centre * spread)) };
  }
  // The launch odds, fitted: a logistic regression over all 758 protocols in the
  // snapshot, P(records a token with a measurable market) by how long the protocol
  // has run. Mirrors lib/model.ts exactly.
  function launchOdds(row) {
    var o = DATA.odds;
    var z;
    if (row.age_days === null || row.age_days === undefined) z = o.intercept + o.null_coef;
    else z = o.intercept + o.age_coef * ((Math.log(row.age_days + 1) - o.age_centre) / o.age_scale);
    return Math.round((1 / (1 + Math.exp(-z))) * 1000) / 1000;
  }
  function gasPerTx(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 8;
    if (c === 'bitcoin') return 3;
    if (c === 'solana' || c === 'polygon' || c === 'base' || c === 'arbitrum' || c === 'optimism') return 0.2;
    if (c === 'avalanche' || c === 'binance' || c === 'bsc' || c === 'tron' || c === 'fantom' || c === 'gnosis') return 0.3;
    return 1;
  }
  function chainOf(p) {
    if (!p.chains || p.chains.length === 0) return 'its main chain';
    var cheapest = p.chains[0];
    for (var i = 1; i < p.chains.length; i++) {
      if (gasPerTx(p.chains[i]) < gasPerTx(cheapest)) cheapest = p.chains[i];
    }
    return cheapest;
  }
  function gasTotal(p) { return Math.round(DATA.farm.tx_count * gasPerTx(chainOf(p)) * 100) / 100; }
  function expectedNet(row) {
    var shareOfPool = Math.min((state.deposit / 1000) / DATA.farm.farmer_share, 0.01);
    var gross = row.implied_value_usd * row.launch_odds * state.share * shareOfPool;
    return Math.round((gross - gasTotal(row)) * 100) / 100;
  }
  function poolShare(row) {
    var shareOfPool = Math.min((state.deposit / 1000) / DATA.farm.farmer_share, 0.01);
    return row.implied_value_usd * state.share * shareOfPool;
  }
  function verdictOf(net) { if (net >= DATA.farm.farm_net) return 'FARM'; if (net > DATA.farm.marginal_net) return 'MARGINAL'; return 'SKIP'; }
  function capitalFor(p) { if (p.tvl_usd >= 5e9) return 250; if (p.tvl_usd >= 1e9) return 150; if (p.tvl_usd >= 1e8) return 100; return 50; }
  function holdDaysFor(age) { if (age === null || age === undefined) return 30; if (age < 180) return 60; if (age < 365) return 45; return 30; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function weeklyFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Repay a small part of the borrow on ' + name + ' and supply it again, so the position shows fresh activity every week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap a small amount through the ' + name + ' pool on ' + chain + ' and add it back as liquidity, so the position keeps accruing fees.';
    if (c.indexOf('bridge') >= 0) return 'Use the bridged funds in one app on ' + chain + ' each week, so the route stays active without bridging back and forth.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim the staking rewards on ' + name + ' and restake them each week, so the staked balance keeps growing.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open and close one small hedged position on ' + name + ' each week, keeping the size the same so the cost stays flat.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market position on ' + name + ' and open another each week, instead of leaving the same position untouched.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return "Check the " + name + " vault's allocation once a week and top it up only if the curator's strategy has changed.";
    if (c.indexOf('stable') >= 0) return 'Mint or redeem a small amount of the ' + name + ' stable asset each week, so the position shows regular use.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield accrual on ' + name + ' once a week and claim it if the protocol pays it out.';
    if (c.indexOf('insurance') >= 0) return 'Review the cover terms on ' + name + ' once a week, and change the cover only if the position it protects changes.';
    return 'Make one qualifying action on ' + name + ' each week, such as a deposit, a borrow, a swap or a vote, so the farm does not go quiet.';
  }
  function netRankOf(row) {
    var net = expectedNet(row);
    var rank = 1;
    DATA.rows.forEach(function (r) {
      var n = expectedNet(r);
      if (n > net || (n === net && r.slug < row.slug)) rank++;
    });
    return rank;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = Math.max(capitalFor(p), state.deposit);
    var hold = holdDaysFor(p.age_days);
    var gas = gasPerTx(chain);
    var net = expectedNet(p);
    var rankPhrase = 'ranked #' + netRankOf(p) + ' by expected net of ' + DATA.board_size + ' rows';
    var thesis;
    if (net >= DATA.farm.farm_net) {
      thesis = 'Farm ' + p.name + ' because its launch is worth ' + fmtUsd(p.implied_value_usd) + ' at ' + Math.round(p.launch_odds * 100) + '% launch odds: at a ' + Math.round(state.share * 100) + '% drop share and a $' + state.deposit.toLocaleString('en-US') + ' deposit the expected net is ' + fmtUsd2(net) + ' after $' + gasTotal(p).toFixed(2) + ' of gas — ' + rankPhrase + '.';
    } else if (net > DATA.farm.marginal_net) {
      thesis = 'Farm ' + p.name + ' only if you already use it: its launch is worth ' + fmtUsd(p.implied_value_usd) + ' at ' + Math.round(p.launch_odds * 100) + '% launch odds, but at a ' + Math.round(state.share * 100) + '% drop share and a $' + state.deposit.toLocaleString('en-US') + ' deposit the expected net is only ' + fmtUsd2(net) + ' after $' + gasTotal(p).toFixed(2) + ' of gas — ' + rankPhrase + '.';
    } else {
      thesis = 'Do not farm ' + p.name + ' for the drop: its launch is worth ' + fmtUsd(p.implied_value_usd) + ' at ' + Math.round(p.launch_odds * 100) + '% launch odds, but at a ' + Math.round(state.share * 100) + '% drop share and a $' + state.deposit.toLocaleString('en-US') + ' deposit the expected net is ' + fmtUsd2(net) + ' after $' + gasTotal(p).toFixed(2) + ' of gas — ' + rankPhrase + '. The steps below are the plan if you use the protocol anyway.';
    }
    return [
      { text: thesis, cost: 'no cost to read the plan', time: '5 minutes' },
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about $' + gas + ' of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p, chain), cost: 'about $' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page and claim only from the link it publishes. The drop pool at launch is " + fmtUsd(p.implied_value_usd * state.share) + '; your share at $' + state.deposit.toLocaleString('en-US') + ' is ' + fmtUsd2(poolShare(p)) + '.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every ' + chain + ' transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // ---- dom helpers ----------------------------------------------------------
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  // ---- state / filtering ----------------------------------------------------
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('deposit')) state.deposit = params.get('deposit') === '10000' ? 10000 : 1000;
    if (params.get('share')) state.share = { '0.035': 0.035, '0.07': 0.07, '0.14': 0.14 }[params.get('share')] || 0.07;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.tab !== 'all') params.set('tab', state.tab);
    if (state.deposit !== 1000) params.set('deposit', String(state.deposit));
    if (state.share !== 0.07) params.set('share', String(state.share));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.tab === 'watchlist' && !WL[r.slug]) return false;
      if (state.tab === 'early' && WL[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.verdict !== 'all' && verdictOf(expectedNet(r)) !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'odds') { av = a.launch_odds; bv = b.launch_odds; }
      else if (key === 'net') { av = expectedNet(a); bv = expectedNet(b); }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function medianOdds() {
    var o = DATA.rows.map(function (r) { return r.launch_odds; }).sort(function (a, b) { return a - b; });
    return o[Math.floor(o.length / 2)];
  }

  // ---- sections -------------------------------------------------------------
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', html: 'LAUNCH<em>SCOPE</em>' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: 'comps-3 model' }),
        el('span', { text: 'no token on record, not no token' })
      )
    );
  }
  function kpis() {
    var v = DATA.validation.variants[0];
    var kpi = function (label, value, sub) { return el('div', { class: 'kpi' }, el('span', { text: label }), el('b', { text: value }), el('small', { text: sub })); };
    return el('section', { class: 'kpis' },
      kpi('Pre-token rows ranked', String(DATA.board_size), DATA.watchlist_size + ' watchlist + ' + DATA.early_size + ' early'),
      kpi('Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'the floor, never the ceiling'),
      kpi('Out-of-sample miss', 'x' + v.median_factor, 'median, leave-one-out'),
      kpi('80% range held', v.hold80_pct + '%', 'of traded comps, blind'),
      kpi('Median launch odds', Math.round(medianOdds() * 100) + '%', 'fitted base rate · 5-fold Brier ' + DATA.odds.brier),
      kpi('Worth farming', String(DATA.farm_count) + ' FARM', DATA.marginal_count + ' marginal · ' + DATA.skip_count + ' skip')
    );
  }
  function lede() {
    return el('section', { class: 'lede' },
      el('h1', { text: 'Which pre-token protocol is worth farming next, and what is its launch worth?' }),
      el('p', { html: 'Every protocol with at least $50M of TVL and no token on record, plus every other pre-token protocol below the floor, ranked by an implied value <b>fitted from the traded tokens in this same snapshot</b> — not from a hand-picked list. The range is the honest spread: comps are dispersed, and the page shows how wide, instead of one bare number.' })
    );
  }
  function controls() {
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      DATA.categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      DATA.chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var verSel = el('select', { id: 'verdict', 'aria-label': 'Filter by verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      ['FARM', 'MARGINAL', 'SKIP'].map(function (c) { return el('option', { value: c, text: c, selected: c === state.verdict ? 'selected' : null }); })
    );
    verSel.addEventListener('change', function () { state.verdict = verSel.value; writeHash(); render(); });
    var tabs = [['all', 'All'], ['watchlist', 'Watchlist'], ['early', 'Early'], ['live', 'Live token']].map(function (t) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === t[0] ? 'true' : 'false', text: t[1], onclick: function () { state.tab = t[0]; writeHash(); render(); } });
    });
    var dep = [[1000, '$1,000'], [10000, '$10,000']].map(function (d) {
      return el('button', { type: 'button', 'aria-pressed': state.deposit === d[0] ? 'true' : 'false', text: d[1], onclick: function () { state.deposit = d[0]; writeHash(); render(); } });
    });
    var shr = [[0.035, '3.5%'], [0.07, '7%'], [0.14, '14%']].map(function (d) {
      return el('button', { type: 'button', 'aria-pressed': state.share === d[0] ? 'true' : 'false', text: d[1], onclick: function () { state.share = d[0]; writeHash(); render(); } });
    });
    var exp = el('button', { class: 'button', type: 'button', text: 'Export CSV', onclick: exportCsv });
    var shown = state.tab === 'live' ? DATA.live.length + ' live-token protocols' : visibleRows().length + ' rows shown';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Board' }), el('div', { class: 'tabs' }, tabs)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Deposit' }), el('div', { class: 'seg' }, dep)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Drop share' }), el('div', { class: 'seg' }, shr)),
      exp,
      el('span', { class: 'count', text: shown })
    );
  }
  function exportCsv() {
    var list = state.tab === 'live' ? [] : sortedRows(visibleRows());
    var lines = ['rank,protocol,category,chains,tvl_usd,change_7d,launch_odds,implied_value_usd,implied_lo_usd,implied_hi_usd,net_usd,verdict'];
    list.forEach(function (r) {
      lines.push([r.rank, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || 'Other') + '"', '"' + (r.chains || []).join(';') + '"', r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.launch_odds, r.implied_value_usd, r.implied_lo_usd, r.implied_hi_usd, expectedNet(r), verdictOf(expectedNet(r))].join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'launchscope-board.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }
  function boardTable() {
    var list = sortedRows(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var net = expectedNet(r);
      var verdict = verdictOf(net);
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (WL[r.slug] ? ' · watchlist' : '') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: Math.round(r.launch_odds * 100) + '%' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('div', null, el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }), el('div', { class: 'range', text: fmtUsd(r.implied_lo_usd) + ' – ' + fmtUsd(r.implied_hi_usd) }))
        )),
        el('td', { class: 'num ' + (net >= 0 ? 'pos' : 'neg'), text: fmtUsd2(net) }),
        el('td', null, el('span', { class: 'verdict ' + verdict.toLowerCase(), text: verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Net is the expected value at a $' + state.deposit.toLocaleString('en-US') + ' deposit and a ' + Math.round(state.share * 1000) / 10 + '% drop share. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'),
            sortHeader('odds', 'Launch odds'), sortHeader('implied', 'Implied value'), sortHeader('net', 'Net of fees'), el('th', { scope: 'col', text: 'Verdict' })
          )),
          tbody
        )
      )
    );
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comps the curve is fitted on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }
  // The scatter is built as an HTML string: the parser puts the <svg> markup in
  // the SVG namespace on its own, so no namespace URI literal is needed anywhere.
  function scatterPanel() {
    var c = DATA.curve;
    var W = 640, H = 380, pad = 44;
    var xs = DATA.comps.map(function (p) { return p[0]; });
    var ys = DATA.comps.map(function (p) { return p[1]; });
    var x0 = Math.floor(Math.min.apply(null, xs) - 0.5), x1 = Math.ceil(Math.max.apply(null, xs) + 0.5);
    var y0 = Math.floor(Math.min.apply(null, ys) - 1), y1 = Math.ceil(Math.max.apply(null, ys) + 1);
    var X = function (v) { return pad + ((v - x0) / (x1 - x0)) * (W - pad * 2); };
    var Y = function (v) { return H - pad - ((v - y0) / (y1 - y0)) * (H - pad * 2); };
    var f = function (v) { return Math.round(v * 10) / 10; };
    var parts = [];
    for (var gx = Math.ceil(x0); gx <= x1; gx++) {
      parts.push('<line class="grid" x1="' + f(X(gx)) + '" y1="' + pad + '" x2="' + f(X(gx)) + '" y2="' + (H - pad) + '"/>');
      parts.push('<text class="tick" x="' + f(X(gx)) + '" y="' + (H - pad + 18) + '" text-anchor="middle">e^' + gx + '</text>');
    }
    for (var gy = Math.ceil(y0); gy <= y1; gy += 2) {
      parts.push('<line class="grid" x1="' + pad + '" y1="' + f(Y(gy)) + '" x2="' + (W - pad) + '" y2="' + f(Y(gy)) + '"/>');
      parts.push('<text class="tick" x="' + (pad - 6) + '" y="' + f(Y(gy) + 3) + '" text-anchor="end">e^' + gy + '</text>');
    }
    var band = 'M' + f(X(x0)) + ',' + f(Y(c.intercept + c.slope * x0 + Z80 * c.sigma)) + ' L' + f(X(x1)) + ',' + f(Y(c.intercept + c.slope * x1 + Z80 * c.sigma)) + ' L' + f(X(x1)) + ',' + f(Y(c.intercept + c.slope * x1 - Z80 * c.sigma)) + ' L' + f(X(x0)) + ',' + f(Y(c.intercept + c.slope * x0 - Z80 * c.sigma)) + ' Z';
    parts.push('<path class="band" d="' + band + '"/>');
    parts.push('<line class="fit" x1="' + f(X(x0)) + '" y1="' + f(Y(c.intercept + c.slope * x0)) + '" x2="' + f(X(x1)) + '" y2="' + f(Y(c.intercept + c.slope * x1)) + '"/>');
    DATA.comps.forEach(function (p) { parts.push('<circle class="dot" cx="' + f(X(p[0])) + '" cy="' + f(Y(p[1])) + '" r="2.6"/>'); });
    DATA.rows.filter(function (r) { return r.rank <= 12; }).forEach(function (r) {
      var px = Math.log(r.tvl_usd), py = Math.log(r.implied_value_usd);
      if (px < x0 || px > x1 || py < y0 || py > y1) return;
      parts.push('<circle class="pre" cx="' + f(X(px)) + '" cy="' + f(Y(py)) + '" r="4"/>');
    });
    parts.push('<text class="lbl" x="' + (W / 2) + '" y="' + (H - 6) + '" text-anchor="middle">log TVL (USD)</text>');
    parts.push('<text class="lbl" x="12" y="' + (pad - 8) + '">log market cap (USD)</text>');
    var svgMarkup = '<svg class="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Comps scatter: log TVL against log market cap with the fitted curve">' + parts.join('') + '</svg>';
    return el('section', { class: 'panel pad' },
      el('h2', { text: 'The comps curve' }),
      el('p', { text: 'Each grey dot is a protocol whose token already trades: its TVL against its market cap. The line is the fitted curve; the band is the 80% prediction interval. Gold dots are the top 12 pre-token protocols, placed where the curve prices them.' }),
      el('div', { html: svgMarkup }),
      el('div', { class: 'legend' },
        el('span', { html: '<i style="background:#6f8a7d"></i>traded comp' }),
        el('span', { html: '<i style="background:#3ddc97"></i>fitted curve' }),
        el('span', { html: '<i style="background:#f2b544"></i>top 12 pre-token' })
      )
    );
  }
  function validationPanel() {
    var v = DATA.validation;
    var rows = v.variants.map(function (x) {
      return el('tr', { class: x.name === v.chosen ? 'chosen' : null },
        el('td', { text: x.name }),
        el('td', { class: 'num', text: 'x' + x.median_factor }),
        el('td', { class: 'num', text: String(x.mean_log_err) }),
        el('td', { class: 'num', text: x.hold80_pct + '%' })
      );
    });
    return el('section', { class: 'panel pad' },
      el('h2', { text: 'Does it hold up blind?' }),
      el('p', { html: 'Every variant below was scored leave-one-out over the <b>' + v.comps + ' traded comps that record a market cap of at least $1M</b>: each token was predicted from the other ' + (v.comps - 1) + ', so no token ever grades itself. The TVL-only curve is the model. The 80% range spans <b>x' + v.range_factor + '</b> — still wide, because comps are dispersed — and it held <b>' + v.variants[0].hold80_pct + '%</b> of comps blind. The range uses a robust spread (median absolute deviation), so a few extreme tokens cannot inflate it the way an ordinary standard deviation did.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'vtable' },
          el('thead', null, el('tr', null, el('th', { text: 'Variant' }), el('th', { text: 'Median miss' }), el('th', { text: 'Mean log err' }), el('th', { text: '80% range held' }))),
          el('tbody', null, rows)
        )
      ),
      el('p', { text: 'What was tried and rejected: a 7-day growth tilt (median miss x' + v.variants[1].median_factor + '), a growth-plus-age tilt (x' + v.variants[2].median_factor + '), and fitting on all 128 traded comps including the 18 tokens under $1M of market cap, which are dead listings more than markets (x' + v.variants[4].median_factor + '). A category adjustment scores x' + v.variants[3].median_factor + ' blind — marginally better than the chosen x' + v.variants[0].median_factor + ' — but it is rejected anyway: its adjustments rest on 1–9 comps per category, and one prediction-market token worth 400× its TVL would multiply every Prediction Market protocol\u2019s implied value by 2.6×. A board driven by single outliers is not a ranking. Growth and age do not predict market cap in this snapshot, so they do not enter the value; age does enter the launch odds, fitted, below.' })
    );
  }
  function methodPanel() {
    var c = DATA.curve;
    var o = DATA.odds;
    return el('section', { class: 'panel pad' },
      el('h2', { text: 'How a launch is priced' }),
      el('div', { class: 'formula' },
        'implied = exp( ' + c.intercept + ' + ' + c.slope + ' x ln(TVL) )     fitted on ' + c.comps + ' traded tokens (mcap >= $1M)\n' +
        'p10, p90 = implied / x' + Math.exp(Z80 * c.sigma).toFixed(1) + ', implied x ' + Math.exp(Z80 * c.sigma).toFixed(1) + '     80% interval, robust sigma ' + c.sigma + '\n' +
        'odds = 1 / (1 + exp(-z)),  z = ' + o.intercept + ' + ' + o.age_coef + ' x (ln(age+1) - ' + o.age_centre + ') / ' + o.age_scale + '     (+' + o.null_coef + ' when age is unknown)\n' +
        'net = implied x odds x drop share x (deposit/1000) / ' + DATA.farm.farmer_share.toLocaleString('en-US') + ' - gas     FARM at net >= $' + DATA.farm.farm_net + ', MARGINAL above $0'
      ),
      el('p', { text: 'Implied value is the curve centre; the range is the honest spread, never a bare number. Launch odds are fitted, not stated: a logistic regression over all ' + o.protocols + ' protocols in the snapshot, P(records a token with a measurable market) by how long the protocol has run — 5-fold Brier ' + o.brier + ', AUC ' + o.auc + ', against Brier ' + o.prior_brier + ' for the stated prior it replaces. TVL and 7-day growth carry no signal for whether a protocol has a token, so they are not in the odds. The odds are a base rate from the snapshot\u2019s own record, not a dated forecast: no probability here claims a launch date.' }),
      calibrationTable(),
      el('p', { text: 'Gas is charged on the cheapest chain the protocol lists, because that is where a farmer farms: the first chain DefiLlama lists is an ordering, not a choice, and the plan names the chain it farms on. FARM at net >= $' + DATA.farm.farm_net + ' is a 3.5% expected return on a $1,000 deposit after gas — a stated line, not a measurement: the net is an estimate whose 80% range spans x' + DATA.validation.range_factor + ' on the implied value, so $35 and $50 are within the model\u2019s own noise. Rows from $0 to $35 are MARGINAL: a positive expectation too small to act on at this deposit; raise the deposit to $10,000 and the same arithmetic promotes them.' }),
      el('p', { text: 'A protocol records no token, never has none: the watchlist is DefiLlama\u2019s record, not proof. A wrapped, staked or bridged product of a token that already trades is not a launch waiting to happen.' })
    );
  }
  function calibrationTable() {
    var cal = DATA.odds.calibration || [];
    if (cal.length === 0) return null;
    var rows = cal.map(function (c) {
      var diff = Math.round((c.observed - c.predicted) * 1000) / 10;
      return el('tr', null,
        el('td', { text: c.band }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: Math.round(c.observed * 100) + '%' }),
        el('td', { class: 'num', text: Math.round(c.predicted * 100) + '%' }),
        el('td', { class: 'num', text: (diff >= 0 ? '+' : '') + diff + ' pts' })
      );
    });
    return el('div', null,
      el('p', { text: 'Are the odds calibrated? Predicted odds against the share of each age band that actually records a token — every band is within sampling noise, and a quadratic age term and 8 band dummies both score worse 5-fold, so the odds are kept as fitted and the calibration is shown, not claimed.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'vtable' },
          el('thead', null, el('tr', null, el('th', { text: 'Age band' }), el('th', { text: 'Protocols' }), el('th', { text: 'Observed with token' }), el('th', { text: 'Predicted odds' }), el('th', { text: 'Gap' }))),
          el('tbody', null, rows)
        )
      )
    );
  }
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var net = expectedNet(row);
    var verdict = verdictOf(net);
    var gas = gasTotal(row);
    var gross = Math.round(poolShare(row) * row.launch_odds * 100) / 100;
    var cv = curveValue(row.tvl_usd);
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WL[row.slug] ? ' · watchlist' : ' · early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Launch odds (fitted)' }), el('b', { class: 'num', text: Math.round(row.launch_odds * 100) + '%' })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: '80% range' }), el('b', { class: 'num', text: fmtUsd(row.implied_lo_usd) + ' – ' + fmtUsd(row.implied_hi_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model comps-3: the page recomputes this row as ' + fmtUsd(cv.implied) + (cv.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics' }),
      el('div', { class: 'ev' },
        el('div', null, el('span', { text: 'Deposit' }), el('b', { text: '$' + state.deposit.toLocaleString('en-US') })),
        el('div', null, el('span', { text: 'Drop share' }), el('b', { text: (Math.round(state.share * 1000) / 10) + '%' })),
        el('div', null, el('span', { text: 'Drop pool at launch' }), el('b', { text: fmtUsd(row.implied_value_usd * state.share) })),
        el('div', null, el('span', { text: 'Your share (1 in ' + DATA.farm.farmer_share.toLocaleString('en-US') + ' at $1,000)' }), el('b', { text: fmtUsd2(poolShare(row)) })),
        el('div', null, el('span', { text: 'Expected gross (x odds)' }), el('b', { text: fmtUsd2(gross) })),
        el('div', null, el('span', { text: 'Gas (' + DATA.farm.tx_count + ' tx on ' + chainOf(row) + ')' }), el('b', { text: '-$' + gas.toFixed(2) })),
        el('div', { class: 'net' }, el('span', { text: 'Expected net' }), el('b', { class: net >= 0 ? 'pos' : 'neg', text: fmtUsd2(net) + '  ·  ' + verdict }))
      ),
      el('p', { class: 'sub', text: 'Change the deposit or drop share above and this math recomputes. Break-even is a farmer share of 1 in ' + Math.max(1, Math.round(Math.max(row.implied_value_usd * row.launch_odds * state.share, 0.01) / gas)).toLocaleString('en-US') + ' of the drop pool.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(kpis());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'live' ? liveTable() : boardTable());
    if (state.tab !== 'live') {
      var grid = el('div', { class: 'grid2' });
      grid.appendChild(scatterPanel());
      grid.appendChild(validationPanel());
      shell.appendChild(grid);
      shell.appendChild(methodPanel());
    }
    shell.appendChild(el('footer', { class: 'foot' },
      el('span', { text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.source }),
      el('span', { text: 'LaunchScope, comps-3 model. Implied values are this entry\u2019s own claim, never make.fun\u2019s. A protocol records no token; it may still have one its record does not carry.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }
  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
