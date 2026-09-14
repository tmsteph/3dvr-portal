(() => {
  const phases = [
    { year: 2026, name: 'Ignition', headline: 'AI gains agency.', focus: 'Identity + action', build: 'Permissioned agents', note: 'Generation gives way to action, trust, identity, and authority.' },
    { year: 2027, name: 'Acceleration', headline: 'Agents connect to agents.', focus: 'Network effects', build: 'Tiny autonomous teams', note: 'Small teams gain department-scale leverage. Human judgment becomes scarce.' },
    { year: 2028, name: 'Materialization', headline: 'The change becomes physical.', focus: 'Robotics + energy', build: 'Local production', note: 'Automation moves deeper into energy, manufacturing, housing, food, and land.' },
    { year: 2029, name: 'Consolidation', headline: 'Ownership becomes the battle.', focus: 'Control + capital', build: 'Open alternatives', note: 'Models, memory, identity, payment rails, and infrastructure concentrate or decentralize.' },
    { year: 2030, name: 'Protocol', headline: 'The rules become machine-readable.', focus: 'Standards', build: 'Open protocols', note: 'Identity, provenance, payments, permissions, and reputation become core machine infrastructure.' },
    { year: 2031, name: 'Institution', headline: 'Experiments become normal life.', focus: 'Institutions', build: 'Durable systems', note: 'Winning experiments harden into businesses, laws, schools, professions, and expectations.' },
    { year: 2032, name: 'Localization', headline: 'The revolution comes home.', focus: 'Home + community', build: 'Resilient neighborhoods', note: 'Intelligence, energy, production, food, learning, and care become more local and personal.' }
  ];

  const start = new Date(2026, 0, 1, 0, 0, 0, 0);
  const end = new Date(2033, 0, 1, 0, 0, 0, 0);
  const root = document.querySelector('[data-threshold-dashboard]');
  if (!root) return;

  const els = {
    today: root.querySelector('[data-today]'),
    nowPhases: [...root.querySelectorAll('[data-now-phase]')],
    phaseYears: [...root.querySelectorAll('[data-phase-year]')],
    cyclePercent: root.querySelector('[data-cycle-percent]'),
    phasePercent: root.querySelector('[data-phase-percent]'),
    ring: root.querySelector('[data-cycle-ring]'),
    marker: root.querySelector('[data-cycle-marker]'),
    fill: root.querySelector('[data-cycle-fill]'),
    nextPhase: root.querySelector('[data-next-phase]'),
    nextCountdown: root.querySelector('[data-next-countdown]'),
    cyclePosition: root.querySelector('[data-cycle-position]'),
    currentHeadline: root.querySelector('[data-current-headline]'),
    currentFocus: root.querySelector('[data-current-focus]'),
    currentBuild: root.querySelector('[data-current-build]'),
    currentNote: root.querySelector('[data-current-note]'),
    phaseCards: [...root.querySelectorAll('[data-phase-card]')],
    yearCards: [...root.querySelectorAll('[data-year-card]')]
  };

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const dayMs = 86400000;

  function currentPhaseFor(date) {
    const year = date.getFullYear();
    if (year < phases[0].year) return phases[0];
    if (year > phases.at(-1).year) return phases.at(-1);
    return phases.find((phase) => phase.year === year) || phases[0];
  }

  function percentageBetween(date, rangeStart, rangeEnd) {
    const total = rangeEnd - rangeStart;
    if (total <= 0) return 0;
    return clamp(((date - rangeStart) / total) * 100, 0, 100);
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  }

  function render() {
    const now = new Date();
    const phase = currentPhaseFor(now);
    const phaseIndex = phases.findIndex((item) => item.year === phase.year);
    const phaseStart = new Date(phase.year, 0, 1);
    const phaseEnd = new Date(phase.year + 1, 0, 1);
    const cyclePercent = percentageBetween(now, start, end);
    const phasePercent = percentageBetween(now, phaseStart, phaseEnd);
    const next = phases[phaseIndex + 1] || null;

    els.today.textContent = formatDate(now);
    els.nowPhases.forEach((node) => { node.textContent = phase.name; });
    els.phaseYears.forEach((node) => { node.textContent = String(phase.year); });
    els.cyclePercent.textContent = `${cyclePercent.toFixed(1)}%`;
    els.phasePercent.textContent = `${phasePercent.toFixed(0)}% through ${phase.year}`;
    els.ring.style.setProperty('--progress', `${cyclePercent * 3.6}deg`);
    els.marker.style.left = `${cyclePercent}%`;
    els.fill.style.width = `${cyclePercent}%`;
    els.cyclePosition.textContent = `Year ${phaseIndex + 1} of ${phases.length}`;

    els.currentHeadline.textContent = phase.headline;
    els.currentFocus.textContent = phase.focus;
    els.currentBuild.textContent = phase.build;
    els.currentNote.textContent = phase.note;

    if (now < start) {
      const days = Math.max(0, Math.ceil((start - now) / dayMs));
      els.nextPhase.textContent = '2026 · Ignition';
      els.nextCountdown.textContent = `${days.toLocaleString()} days until the cycle begins`;
    } else if (now >= end) {
      els.nextPhase.textContent = 'Cycle complete';
      els.nextCountdown.textContent = 'Time to compare the forecast with reality';
    } else if (next) {
      const nextDate = new Date(next.year, 0, 1);
      const days = Math.max(0, Math.ceil((nextDate - now) / dayMs));
      els.nextPhase.textContent = `${next.year} · ${next.name}`;
      els.nextCountdown.textContent = `${days.toLocaleString()} days to the next phase`;
    } else {
      const days = Math.max(0, Math.ceil((end - now) / dayMs));
      els.nextPhase.textContent = '2033 · Review';
      els.nextCountdown.textContent = `${days.toLocaleString()} days until the forecast horizon closes`;
    }

    els.phaseCards.forEach((card) => {
      card.classList.toggle('is-current', Number(card.dataset.phaseCard) === phase.year);
    });

    els.yearCards.forEach((card) => {
      card.classList.toggle('is-current', Number(card.dataset.yearCard) === phase.year);
    });
  }

  render();
  const timer = window.setInterval(render, 60 * 60 * 1000);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
})();
