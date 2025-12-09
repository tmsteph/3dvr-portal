(function initPoolRatio(global) {
  const totalPointsInput = document.getElementById('totalPoints');
  const poolDollarsInput = document.getElementById('poolDollars');
  const yourPointsInput = document.getElementById('yourPoints');
  const dollarPerPointEl = document.getElementById('dollarPerPoint');
  const pointsPerDollarEl = document.getElementById('pointsPerDollar');
  const cashoutEstimateEl = document.getElementById('cashoutEstimate');
  const ratioHighlightEl = document.getElementById('ratioHighlight');
  const ratioStatusEl = document.getElementById('ratioStatus');
  const poolDisplayEl = document.getElementById('poolDisplay');
  const poolBreakdownEl = document.getElementById('poolBreakdown');
  const totalPointsDisplayEl = document.getElementById('totalPointsDisplay');
  const liveUpdatedAtEl = document.getElementById('liveUpdatedAt');
  const leaderboardListEl = document.getElementById('liveLeaderboard');
  const valueTableEl = document.getElementById('valueTable');
  const valueTableBodyEl = document.getElementById('valueTableBody');
  const valueTableEmptyEl = document.getElementById('valueTableEmpty');
  const refreshButtons = Array.from(document.querySelectorAll('#ratioRefresh'));

  if (!totalPointsInput || !poolDollarsInput || !yourPointsInput) {
    return;
  }

  const ratioState = {
    currency: 'USD',
    poolCents: 0,
    totalPoints: Number(totalPointsInput.value) || 0,
    leaderboard: new Map(),
    stripeAvailable: {},
    stripePending: {}
  };

  function formatCurrency(amount, currency = ratioState.currency) {
    const value = Number.isFinite(amount) ? amount : 0;
    try {
      return value.toLocaleString(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } catch (err) {
      return `${currency} ${value.toFixed(2)}`;
    }
  }

  function formatNumber(value, options = {}) {
    const numeric = Number.isFinite(value) ? value : 0;
    return numeric.toLocaleString(undefined, options);
  }

  function setStatus(message, isError = false) {
    if (!ratioStatusEl) return;
    ratioStatusEl.textContent = message;
    ratioStatusEl.classList.toggle('is-error', !!isError);
  }

  function escapeHtml(value) {
    if (typeof value !== 'string') return '';
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeNumber(input) {
    const value = Number(input?.value || 0);
    if (!Number.isFinite(value) || value < 0) return 0;
    return value;
  }

  function calculateDollarPerPoint() {
    const totalPoints = safeNumber(totalPointsInput);
    const poolDollars = safeNumber(poolDollarsInput);
    if (totalPoints <= 0 || poolDollars <= 0) return 0;
    return poolDollars / totalPoints;
  }

  function updateRatios() {
    const totalPoints = safeNumber(totalPointsInput);
    const poolDollars = safeNumber(poolDollarsInput);
    const yourPoints = safeNumber(yourPointsInput);

    const hasPool = totalPoints > 0 && poolDollars > 0;
    const dollarPerPoint = hasPool ? calculateDollarPerPoint() : 0;
    const pointsPerDollar = hasPool ? totalPoints / poolDollars : 0;
    const cashoutEstimate = hasPool ? dollarPerPoint * yourPoints : 0;

    const currency = ratioState.currency || 'USD';
    dollarPerPointEl && (dollarPerPointEl.textContent = hasPool ? formatCurrency(dollarPerPoint, currency) : '$0.00');
    pointsPerDollarEl && (pointsPerDollarEl.textContent = hasPool ? formatNumber(pointsPerDollar, { maximumFractionDigits: 2 }) : '0');
    cashoutEstimateEl && (cashoutEstimateEl.textContent = hasPool ? formatCurrency(cashoutEstimate, currency) : '$0.00');
    ratioHighlightEl && (ratioHighlightEl.textContent = hasPool ? formatCurrency(dollarPerPoint, currency) : '$0.00');
    renderDollarTable();
  }

  function describePoolBreakdown(currency) {
    if (!poolBreakdownEl) return;
    const available = ratioState.stripeAvailable[currency] || 0;
    const pending = ratioState.stripePending[currency] || 0;
    poolBreakdownEl.textContent = `Available ${formatCurrency(available / 100, currency)} • Pending ${formatCurrency(pending / 100, currency)}`;
  }

  function applyLiveNumbers({ poolCents, currency, totalPoints, updatedAt }) {
    const nextTotalPoints = Number.isFinite(totalPoints) ? Math.max(0, Math.round(totalPoints)) : ratioState.totalPoints;
    const nextPoolCents = Number.isFinite(poolCents) && poolCents >= 0 ? poolCents : ratioState.poolCents;
    const nextCurrency = currency || ratioState.currency || 'USD';

    ratioState.totalPoints = nextTotalPoints;
    ratioState.poolCents = nextPoolCents;
    ratioState.currency = nextCurrency;

    totalPointsInput.value = nextTotalPoints;
    poolDollarsInput.value = (nextPoolCents / 100).toFixed(2);
    totalPointsDisplayEl && (totalPointsDisplayEl.textContent = formatNumber(nextTotalPoints));
    poolDisplayEl && (poolDisplayEl.textContent = formatCurrency(nextPoolCents / 100, nextCurrency));
    describePoolBreakdown(nextCurrency);

    if (updatedAt && liveUpdatedAtEl) {
      liveUpdatedAtEl.textContent = new Date(updatedAt).toLocaleString();
    }

    updateRatios();
  }

  function pickCurrency(available = {}, pending = {}) {
    if (available.USD || pending.USD) return 'USD';
    const availableKeys = Object.keys(available);
    if (availableKeys.length) return availableKeys[0].toUpperCase();
    const pendingKeys = Object.keys(pending);
    if (pendingKeys.length) return pendingKeys[0].toUpperCase();
    return 'USD';
  }

  async function refreshStripeMetrics() {
    setStatus('Refreshing live Stripe metrics...');
    try {
      const response = await fetch('/api/stripe/metrics');
      if (!response.ok) {
        throw new Error(`Stripe API responded with ${response.status}`);
      }

      const payload = await response.json();
      ratioState.stripeAvailable = payload.available || {};
      ratioState.stripePending = payload.pending || {};
      const currency = pickCurrency(payload.available, payload.pending);
      const poolCents = (payload.available?.[currency] || 0) + (payload.pending?.[currency] || 0);

      applyLiveNumbers({
        poolCents,
        currency,
        totalPoints: ratioState.totalPoints,
        updatedAt: payload.updatedAt || new Date().toISOString()
      });
      setStatus('Live data synced from Stripe and the leaderboard.');
    } catch (err) {
      setStatus(`Unable to load Stripe metrics: ${err.message}`, true);
    }
  }

  function updateLeaderboardUI() {
    if (!leaderboardListEl) return;
    const records = Array.from(ratioState.leaderboard.values())
      .filter(record => Number.isFinite(record.points))
      .sort((a, b) => b.points - a.points)
      .slice(0, 5);

    if (!records.length) {
      leaderboardListEl.innerHTML = '<li class="leaderboard-list__item">No leaderboard data yet.</li>';
      return;
    }

    leaderboardListEl.innerHTML = records.map((record, index) => {
      const rank = index + 1;
      const badge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const safeName = escapeHtml(record.username);
      const safeAlias = escapeHtml(record.alias);
      return `
        <li class="leaderboard-list__item">
          <div class="leaderboard-list__left">
            <span class="leaderboard-rank">${badge}</span>
            <div>
              <p class="leaderboard-name">${safeName}</p>
              <p class="leaderboard-alias">${safeAlias}</p>
            </div>
          </div>
          <p class="leaderboard-points">${formatNumber(record.points)} pts</p>
        </li>
      `;
    }).join('');
    renderDollarTable();
  }

  function renderDollarTable() {
    if (!valueTableEl || !valueTableBodyEl || !valueTableEmptyEl) return;

    const dollarPerPoint = calculateDollarPerPoint();
    const currency = ratioState.currency || 'USD';

    const records = Array.from(ratioState.leaderboard.values())
      .filter(record => Number.isFinite(record.points) && record.points > 0)
      .sort((a, b) => b.points - a.points);

    if (!records.length) {
      valueTableBodyEl.innerHTML = '';
      valueTableEl.style.display = 'none';
      valueTableEmptyEl.textContent = 'Waiting for leaderboard data...';
      valueTableEmptyEl.style.display = 'block';
      return;
    }

    valueTableEl.style.display = 'table';
    valueTableEmptyEl.style.display = dollarPerPoint > 0 ? 'none' : 'block';
    if (dollarPerPoint <= 0) {
      valueTableEmptyEl.textContent = 'Enter a pool amount to estimate dollar values.';
    }

    valueTableBodyEl.innerHTML = records.map(record => {
      const cashValue = dollarPerPoint > 0 ? record.points * dollarPerPoint : 0;
      const safeName = escapeHtml(record.username);
      const safeAlias = escapeHtml(record.alias);
      return `
        <tr>
          <td>
            <div class="value-name">
              <span>${safeName}</span>
              <span class="value-name__alias">${safeAlias}</span>
            </div>
          </td>
          <td>${formatNumber(record.points)}</td>
          <td>${formatCurrency(cashValue, currency)}</td>
        </tr>
      `;
    }).join('');
  }

  function handleLeaderboardUpdate(data, key) {
    if (!key) return;
    if (!data) {
      ratioState.leaderboard.delete(key);
    } else {
      const points = Number(data.points);
      const username = data.username || key.replace('@3dvr', '');
      ratioState.leaderboard.set(key, {
        alias: key,
        username,
        points: Number.isFinite(points) ? points : 0
      });
    }

    const totalPoints = Array.from(ratioState.leaderboard.values())
      .reduce((sum, record) => sum + (Number.isFinite(record.points) ? record.points : 0), 0);

    applyLiveNumbers({ poolCents: ratioState.poolCents, currency: ratioState.currency, totalPoints });
    updateLeaderboardUI();
  }

  function subscribeToLeaderboard() {
    if (typeof global.Gun !== 'function') {
      setStatus('Gun is unavailable. Enter totals manually or try again later.', true);
      return null;
    }

    const peers = Array.isArray(global.__GUN_PEERS__) && global.__GUN_PEERS__.length
      ? global.__GUN_PEERS__
      : [
        'wss://relay.3dvr.tech/gun',
        'wss://gun-relay-3dvr.fly.dev/gun'
      ];

    const gun = global.Gun({ peers, axe: true });
    const portalRoot = gun.get('3dvr-portal');
    const userStats = portalRoot.get('userStats');

    if (typeof userStats.map !== 'function') {
      setStatus('Unable to reach the leaderboard. Enter totals manually or retry.', true);
      return null;
    }

    return userStats.map().on(handleLeaderboardUpdate);
  }

  function init() {
    totalPointsInput.addEventListener('input', updateRatios);
    poolDollarsInput.addEventListener('input', updateRatios);
    yourPointsInput.addEventListener('input', updateRatios);

    refreshButtons.forEach(button => {
      button.addEventListener('click', () => {
        refreshStripeMetrics();
      });
    });

    subscribeToLeaderboard();
    refreshStripeMetrics();
    updateRatios();
  }

  init();
})(window);
