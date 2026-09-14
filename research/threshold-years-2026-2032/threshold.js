(() => {
  const phases = [
    {
      year: 2026,
      name: 'Ignition',
      headline: 'AI gains agency.',
      focus: 'Identity + action',
      build: 'Permissioned agents',
      note: 'Generation gives way to action, trust, identity, and authority.',
      astroTitle: '♄ ☌ ♆ in Aries · ♅ → Gemini · ♇ Aquarius',
      astroSky: 'Saturn conjunct Neptune at the start of Aries; Uranus enters Gemini; Pluto remains in Aquarius.',
      astroSymbolism: 'Turn vision into action. Disrupt communication and technology. Rework collective power.',
      astroFit: 'A strong ignition signature: ideas stop being abstract and begin demanding new systems.'
    },
    {
      year: 2027,
      name: 'Acceleration',
      headline: 'Agents connect to agents.',
      focus: 'Network effects',
      build: 'Tiny autonomous teams',
      note: 'Small teams gain department-scale leverage. Human judgment becomes scarce.',
      astroTitle: '♅ ✶ ♆ · ♅ △ ♇ · ♆ ✶ ♇',
      astroSky: 'Uranus, Neptune, and Pluto make a tight series of supportive outer-planet aspects, especially in June.',
      astroSymbolism: 'Innovation, imagination, and deep structural power begin working through the same network.',
      astroFit: 'The symbolism is less “spark” and more “connection” — exactly the acceleration phase.'
    },
    {
      year: 2028,
      name: 'Materialization',
      headline: 'The change becomes physical.',
      focus: 'Robotics + energy',
      build: 'Local production',
      note: 'Automation moves deeper into energy, manufacturing, housing, food, and land.',
      astroTitle: '♄ → Taurus · ♅ Gemini · ♆ Aries · ♇ Aquarius',
      astroSky: 'Saturn enters Taurus on April 12 while the outer planets remain in Gemini, Aries, and Aquarius.',
      astroSymbolism: 'Saturn in Taurus asks what is materially durable: money, land, food, resources, value, and infrastructure.',
      astroFit: 'The cycle moves from software and ideas into things that must physically work.'
    },
    {
      year: 2029,
      name: 'Consolidation',
      headline: 'Ownership becomes the battle.',
      focus: 'Control + capital',
      build: 'Open alternatives',
      note: 'Models, memory, identity, payment rails, and infrastructure concentrate or decentralize.',
      astroTitle: '♄ Taurus · ♃ → Scorpio · ♅ Gemini · ♇ Aquarius',
      astroSky: 'Saturn stays in Taurus; Jupiter enters Scorpio in September; Uranus remains in Gemini and Pluto in Aquarius.',
      astroSymbolism: 'Secure resources, examine ownership, expose hidden leverage, and decide who controls shared systems.',
      astroFit: 'The question shifts naturally from invention to possession, governance, and power.'
    },
    {
      year: 2030,
      name: 'Protocol',
      headline: 'The rules become machine-readable.',
      focus: 'Standards',
      build: 'Open protocols',
      note: 'Identity, provenance, payments, permissions, and reputation become core machine infrastructure.',
      astroTitle: '♄ → Gemini · ♅ Gemini · ♃ → Sagittarius',
      astroSky: 'Saturn enters Gemini on May 31 while Uranus is still transforming Gemini; Jupiter enters Sagittarius in October.',
      astroSymbolism: 'Give structure to communication, learning, exchange, standards, networks, and the movement of information.',
      astroFit: 'The astrological emphasis lands directly on rules for communication — the protocol phase.'
    },
    {
      year: 2031,
      name: 'Institution',
      headline: 'Experiments become normal life.',
      focus: 'Institutions',
      build: 'Durable systems',
      note: 'Winning experiments harden into businesses, laws, schools, professions, and expectations.',
      astroTitle: '♄ Gemini · ♃ → Capricorn · ♇ Aquarius',
      astroSky: 'Saturn spends the year in Gemini; Jupiter enters Capricorn in November; Pluto continues through Aquarius.',
      astroSymbolism: 'Codify knowledge, professionalize systems, and turn network experiments into durable structures.',
      astroFit: 'What worked during the disruptive years starts becoming policy, organization, and institution.'
    },
    {
      year: 2032,
      name: 'Localization',
      headline: 'The revolution comes home.',
      focus: 'Home + community',
      build: 'Resilient neighborhoods',
      note: 'Intelligence, energy, production, food, learning, and care become more local and personal.',
      astroTitle: '♄ → Cancer · ♅ → Cancer',
      astroSky: 'Saturn enters Cancer on July 13; Uranus first enters Cancer on August 3 before briefly retrograding back to Gemini.',
      astroSymbolism: 'Structure and disruption both move toward home, family, nourishment, land, belonging, and local security.',
      astroFit: 'This is the clearest symbolic match in the cycle: the technological revolution literally turns toward home.'
    }
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
    selectedYear: root.querySelector('[data-selected-year]'),
    selectedName: root.querySelector('[data-selected-name]'),
    selectedHeadline: root.querySelector('[data-selected-headline]'),
    selectedFocus: root.querySelector('[data-selected-focus]'),
    selectedBuild: root.querySelector('[data-selected-build]'),
    selectedNote: root.querySelector('[data-selected-note]'),
    selectedAstroTitle: root.querySelector('[data-selected-astro-title]'),
    selectedAstroSky: root.querySelector('[data-selected-astro-sky]'),
    selectedAstroSymbolism: root.querySelector('[data-selected-astro-symbolism]'),
    selectedAstroFit: root.querySelector('[data-selected-astro-fit]'),
    returnNow: root.querySelector('[data-return-now]'),
    detail: root.querySelector('[data-phase-detail]'),
    phaseCards: [...root.querySelectorAll('[data-phase-card]')],
    yearCards: [...root.querySelectorAll('[data-year-card]')],
    selectors: [...root.querySelectorAll('[data-phase-select]')]
  };

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const dayMs = 86400000;
  let selectedYear = null;

  function currentPhaseFor(date) {
    const year = date.getFullYear();
    if (year < phases[0].year) return phases[0];
    if (year > phases.at(-1).year) return phases.at(-1);
    return phases.find((phase) => phase.year === year) || phases[0];
  }

  function phaseForYear(year) {
    return phases.find((phase) => phase.year === Number(year)) || null;
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

  function yearFromHash() {
    const value = Number(window.location.hash.replace('#', ''));
    return phaseForYear(value) ? value : null;
  }

  function renderSelected(year) {
    const phase = phaseForYear(year);
    if (!phase) return;
    selectedYear = phase.year;

    els.selectedYear.textContent = String(phase.year);
    els.selectedName.textContent = phase.name;
    els.selectedHeadline.textContent = phase.headline;
    els.selectedFocus.textContent = phase.focus;
    els.selectedBuild.textContent = phase.build;
    els.selectedNote.textContent = phase.note;
    els.selectedAstroTitle.textContent = phase.astroTitle;
    els.selectedAstroSky.textContent = phase.astroSky;
    els.selectedAstroSymbolism.textContent = phase.astroSymbolism;
    els.selectedAstroFit.textContent = phase.astroFit;

    els.selectors.forEach((control) => {
      const isSelected = Number(control.dataset.phaseSelect) === phase.year;
      control.classList.toggle('is-selected', isSelected);
      control.setAttribute('aria-pressed', String(isSelected));
    });
  }

  function selectPhase(year, { updateHash = true, scroll = false } = {}) {
    const phase = phaseForYear(year);
    if (!phase) return;

    renderSelected(phase.year);

    if (updateHash && window.location.hash !== `#${phase.year}`) {
      window.history.pushState(null, '', `#${phase.year}`);
    }

    if (scroll && els.detail) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      els.detail.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    }
  }

  function renderLive() {
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

    if (selectedYear === null) {
      renderSelected(yearFromHash() || phase.year);
    }
  }

  els.selectors.forEach((control) => {
    control.addEventListener('click', () => {
      selectPhase(Number(control.dataset.phaseSelect), { updateHash: true, scroll: true });
    });
  });

  els.returnNow.addEventListener('click', () => {
    const current = currentPhaseFor(new Date());
    renderSelected(current.year);
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
  });

  window.addEventListener('hashchange', () => {
    const phase = phaseForYear(yearFromHash()) || currentPhaseFor(new Date());
    renderSelected(phase.year);
  });

  window.addEventListener('popstate', () => {
    const phase = phaseForYear(yearFromHash()) || currentPhaseFor(new Date());
    renderSelected(phase.year);
  });

  renderLive();
  const timer = window.setInterval(renderLive, 60 * 60 * 1000);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
})();
