const STORAGE_PREFIX = 'ideas_stats:';

// Stats shape: { views: number, ctaClicks: number, lastSeen: ISOString|null }
function getStats(pathname) {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${pathname}`);
  if (!raw) {
    return { views: 0, ctaClicks: 0, lastSeen: null };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      views: Number(parsed.views) || 0,
      ctaClicks: Number(parsed.ctaClicks) || 0,
      lastSeen: parsed.lastSeen || null
    };
  } catch (error) {
    console.warn('Ideas Lab stats reset due to parse issue', error);
    return { views: 0, ctaClicks: 0, lastSeen: null };
  }
}

function saveStats(pathname, stats) {
  localStorage.setItem(`${STORAGE_PREFIX}${pathname}`, JSON.stringify(stats));
}

function touchTimestamp() {
  return new Date().toISOString();
}

function recordView(pathname) {
  const stats = getStats(pathname);
  stats.views += 1;
  stats.lastSeen = touchTimestamp();
  saveStats(pathname, stats);
}

function recordClick(pathname) {
  const stats = getStats(pathname);
  stats.ctaClicks += 1;
  stats.lastSeen = touchTimestamp();
  saveStats(pathname, stats);
}

function formatTimestamp(value) {
  if (!value) {
    return 'Never';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Never';
  }

  return date.toLocaleString();
}

function hydrateDashboard() {
  const cards = document.querySelectorAll('[data-idea-card]');
  cards.forEach((card) => {
    const pathname = card.dataset.ideaPath;
    const stats = getStats(pathname);
    const viewsEl = card.querySelector('[data-idea-views]');
    const clicksEl = card.querySelector('[data-idea-cta-count]');
    const lastSeenEl = card.querySelector('[data-idea-last]');

    if (viewsEl) {
      viewsEl.textContent = stats.views;
    }
    if (clicksEl) {
      clicksEl.textContent = stats.ctaClicks;
    }
    if (lastSeenEl) {
      lastSeenEl.textContent = formatTimestamp(stats.lastSeen);
    }
  });
}

function bindCtaTracking(pathname) {
  const ctas = document.querySelectorAll('[data-idea-cta]');
  ctas.forEach((cta) => {
    cta.addEventListener('click', () => recordClick(pathname));
  });
}

function hydrateMailto(name, pageUrl, email) {
  const cta = document.querySelector('[data-idea-cta]');
  if (!cta) {
    return;
  }

  const label = name || 'Ideas Lab';
  const pageLink = pageUrl || window.location.href;
  const subject = encodeURIComponent(`Ideas Lab - ${label}`);
  const body = encodeURIComponent(`${label} - ${pageLink}`);
  const targetEmail = email || 'tmsteph1290@gmail.com';
  cta.href = `mailto:${targetEmail}?subject=${subject}&body=${body}`;
}

function bindReset() {
  const resetButton = document.querySelector('[data-reset-stats]');
  if (!resetButton) {
    return;
  }

  resetButton.addEventListener('click', () => {
    const confirmReset = window.confirm('Reset all Ideas Lab stats?');
    if (!confirmReset) {
      return;
    }

    const cards = document.querySelectorAll('[data-idea-card]');
    cards.forEach((card) => {
      const pathname = card.dataset.ideaPath;
      localStorage.removeItem(`${STORAGE_PREFIX}${pathname}`);
    });
    hydrateDashboard();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const ideaPath = document.body.dataset.ideaPath;
  const isDashboard = document.body.dataset.dashboard === 'true';
  const ideaName = document.body.dataset.ideaName;
  const ideaUrl = document.body.dataset.ideaUrl;
  const ideaEmail = document.body.dataset.ideaEmail;

  if (ideaPath) {
    recordView(ideaPath);
    hydrateMailto(ideaName, ideaUrl, ideaEmail);
    bindCtaTracking(ideaPath);
  }

  if (isDashboard) {
    hydrateDashboard();
    bindReset();
  }
});
