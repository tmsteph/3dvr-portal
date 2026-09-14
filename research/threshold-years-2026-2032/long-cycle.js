(() => {
  const root = document.querySelector('[data-long-cycle]');
  if (!root) return;

  const scales = {
    modern: {
      label: '2020 → 2068',
      title: 'The transition in human time',
      note: 'Detailed enough for historical events and major planetary ingresses. Future entries are scenario markers, not predictions of specific events.',
      items: [
        { date: '2020', name: 'Compression', sky: 'Saturn–Pluto conjunct in Capricorn · Jan 12', world: 'The pandemic exposes systemic fragility and compresses daily life to essentials.', read: 'Astrologically: structure meets deep transformation; old systems hit hard limits.' },
        { date: 'Dec 2020', name: 'Network mutation', sky: 'Jupiter–Saturn conjunct in Aquarius · Dec 21', world: 'Remote work, online coordination, and digital social life stop feeling temporary.', read: 'Astrologically: a symbolic handoff from material structures toward information, networks, and collective systems.' },
        { date: '2023–24', name: 'Transition', sky: 'Pluto tests Aquarius, then settles there · Nov 19, 2024', world: 'Generative AI and agentic computing begin moving into ordinary work and public infrastructure.', read: 'Astrologically: power and transformation move toward networks, technology, groups, and shared systems.' },
        { date: '2025', name: 'Preview', sky: 'Neptune previews Aries; Uranus previews Gemini', world: 'The 2026 configuration appears briefly before retrogrades pull both planets back.', read: 'Astrologically: a preview of action-oriented ideals and rapid disruption in communication and computation.' },
        { date: '2026–32', name: 'Threshold Years', sky: 'Neptune Aries · Uranus Gemini→Cancer · Pluto Aquarius', world: 'Agency → networks → physical infrastructure → governance → protocols → institutions → localization.', read: 'This is the detailed seven-phase forecast shown above.' },
        { date: '2033–37', name: 'Embedding', sky: 'Uranus settles in Cancer; Saturn moves through Leo and Virgo', world: 'The systems invented in the 2020s move deeper into homes, culture, craft, work, health, and maintenance.', read: 'Astrologically: invention becomes personal and domestic, then asks to be refined into useful practice.' },
        { date: '2038–40', name: 'Revaluation', sky: 'Neptune → Taurus · Uranus → Leo · Saturn → Libra', world: 'Attention shifts toward material value, resources, creative identity, relationships, and social balance.', read: 'Astrologically: ideals meet matter; technological disruption becomes expressive while institutions renegotiate balance.' },
        { date: '2043–44', name: 'Meaning', sky: 'Pluto → Pisces', world: 'A new long Pluto era begins after roughly two decades in Aquarius.', read: 'Astrologically: deep transformation shifts from networks and systems toward imagination, belief, culture, spirituality, compassion, confusion, and the collective psyche.' },
        { date: '2068', name: 'Initiation', sky: 'Pluto completes its transition into Aries', world: 'A far-future marker rather than a specific event forecast.', read: 'Astrologically: another long-cycle reset toward identity, initiative, conflict, courage, and beginnings.' }
      ]
    },
    century: {
      label: '≈100 years',
      title: 'Structural cycles across a century',
      note: 'Selected astrological markers and historical context. Correlation is not causation.',
      items: [
        { date: '1914–15', name: 'Pressure', sky: 'Saturn–Pluto conjunction in Cancer', world: 'World War I begins and the old European order breaks violently.', read: 'Astrological lens: extreme pressure around nation, security, home, belonging, and collective survival.' },
        { date: '1947', name: 'Reorder', sky: 'Saturn–Pluto conjunction in Leo', world: 'The postwar international order and Cold War power structure take shape.', read: 'Astrological lens: concentrated power, leadership, ideology, identity, and authority.' },
        { date: '1982', name: 'Reset', sky: 'Saturn–Pluto conjunction in Libra', world: 'Economic, political, and geopolitical systems enter another restructuring period.', read: 'Astrological lens: pressure on agreements, alliances, markets, law, and balance of power.' },
        { date: '1993', name: 'Network seed', sky: 'Uranus–Neptune conjunction in Capricorn', world: 'The commercial internet era is close; digital media and global networking accelerate through the decade.', read: 'Astrological lens: technological imagination entering institutions and infrastructure.' },
        { date: '2020', name: 'Compression', sky: 'Saturn–Pluto conjunction in Capricorn', world: 'Pandemic disruption forces institutions, work, education, and social life to reorganize rapidly.', read: 'Astrological lens: a hard structural reset.' },
        { date: '2024', name: 'Network power', sky: 'Pluto settles in Aquarius', world: 'AI, digital networks, platforms, communities, and governance of technology become central power questions.', read: 'Astrological lens: transformation of collective systems.' },
        { date: '2044', name: 'Meaning', sky: 'Pluto settles in Pisces', world: 'Future scenario horizon.', read: 'Astrological lens: power shifts toward belief, imagination, culture, spirituality, media, and collective feeling.' },
        { date: '2068', name: 'Initiation', sky: 'Pluto settles in Aries', world: 'Future scenario horizon.', read: 'Astrological lens: a new chapter centered on initiative, identity, confrontation, and beginnings.' }
      ]
    },
    millennium: {
      label: '≈1,000 years',
      title: 'Recurring structures across centuries',
      note: 'At this scale we use only a few documented recurrence markers. Historical parallels are prompts for comparison, not proof of astrology.',
      items: [
        { date: 'c. 1050', name: 'Medieval baseline', sky: 'Historical anchor, not a claimed planetary recurrence', world: 'Human civilization is regional: knowledge, trade, states, and religions are powerful but not globally instantaneous.', read: 'Use this as a baseline for how radically communication, energy, and coordination changed over one millennium.' },
        { date: '1284', name: 'Capricorn recurrence', sky: 'Saturn–Pluto conjunction in Capricorn', world: 'A selected recurrence in the same sign as 1518 and 2020.', read: 'Astrologers associate Saturn–Pluto in Capricorn with pressure on durable institutions, authority, money, and hierarchy.' },
        { date: '1518', name: 'Reformation era', sky: 'Saturn–Pluto conjunction in Capricorn', world: 'European institutions are entering the Reformation era while print is changing information flow.', read: 'A useful analogy for institutional stress during an information revolution—not evidence of planetary causation.' },
        { date: '1777+', name: 'Revolutionary network era', sky: 'Pluto enters Aquarius', world: 'The Atlantic revolutionary age is underway; political models of sovereignty and citizenship are being contested.', read: 'Astrological lens: collective power, networks, political experimentation, and redistribution of authority.' },
        { date: '2020–24', name: 'Our turn', sky: 'Saturn–Pluto Capricorn → Pluto Aquarius', world: 'Pandemic disruption is followed by an AI and network-power transition.', read: 'The current cycle combines institutional stress with rapid technological reorganization.' },
        { date: '2068', name: 'Next long marker', sky: 'Pluto settles in Aries', world: 'Future horizon.', read: 'A symbolic shift from collective systems toward initiation and identity.' }
      ]
    },
    deep: {
      label: '≈10,000 years',
      title: 'Civilization in deep human time',
      note: 'Exact transit astrology becomes less useful here. Archaeology, climate history, and Earth’s precession become the stronger clocks.',
      items: [
        { date: 'c. 9700 BCE', name: 'Holocene', sky: 'Earth enters the present interglacial epoch', world: 'The last glacial period ends and the Holocene begins roughly 11,700 years ago.', read: 'Climate stability becomes part of the background that later human settlement and agriculture develop within.' },
        { date: 'c. 10,000–8000 BCE', name: 'Cultivation', sky: 'Deep-time view', world: 'Early agriculture and increasingly settled communities appear in parts of the Fertile Crescent.', read: 'Humans begin converting knowledge of seasonal cycles into persistent food and settlement systems.' },
        { date: 'c. 3400 BCE', name: 'Writing', sky: 'Deep-time view', world: 'The earliest known writing appears in southern Mesopotamia.', read: 'External memory changes coordination: administration, accounting, law, and knowledge can outlive individual minds.' },
        { date: 'Industrial era', name: 'Machine power', sky: 'Deep-time view', world: 'Fossil energy and mechanization radically increase human productive power.', read: 'Civilization adds an energy layer far beyond muscle, wind, and animal power.' },
        { date: 'Digital era', name: 'Networked memory', sky: 'Deep-time view', world: 'Computation and global networks make information nearly instantaneous.', read: 'Civilization externalizes not only memory but calculation and communication.' },
        { date: '2020s+', name: 'Agentic intelligence', sky: 'Deep-time view', world: 'AI begins externalizing parts of reasoning, planning, generation, and action.', read: 'The question becomes whether intelligence itself is becoming infrastructure.' }
      ]
    },
    great: {
      label: '≈26,000 years',
      title: 'The Great Year / axial-precession clock',
      note: 'Earth’s axial precession is established astronomy: about 25,771.5 years. Astrological ages and Carlson-style civilizational interpretations are speculative and their boundaries are disputed.',
      items: [
        { date: '≈25.8k years ago', name: 'One cycle back', sky: 'Approximately one axial-precession cycle before today', world: 'Upper Paleolithic human societies; this is not presented as a repeating historical equivalent.', read: 'Astronomy gives us a clock. It does not establish a repeating catastrophe or civilization cycle.' },
        { date: '≈12.9k years ago', name: 'Half-cycle', sky: 'Roughly opposite orientation in the precessional cycle', world: 'Near the end of the last glacial period and the Younger Dryas/Holocene transition.', read: 'Carlson and others focus heavily on this era. Claims of a fixed precessional catastrophe schedule remain unproven.' },
        { date: 'Now', name: 'Current position', sky: 'Earth continues its slow axial precession', world: 'A technological civilization is undergoing rapid AI, energy, ecological, and institutional change.', read: 'The useful question is resilience under uncertainty, not an apocalypse date.' },
        { date: '+≈13k years', name: 'Opposite season geometry', sky: 'NASA notes precession will reverse which hemisphere experiences the stronger perihelion-season contrast', world: 'Far beyond meaningful social forecasting.', read: 'This is a real astronomical consequence of precession—not an astrological prediction.' },
        { date: '+≈25.8k years', name: 'One cycle forward', sky: 'Approximately one full precessional cycle from now', world: 'Outside responsible civilizational forecasting.', read: 'A reminder that the Great Year is primarily an astronomical timescale; everything else requires separate evidence.' }
      ]
    }
  };

  const scaleButtons = [...root.querySelectorAll('[data-cycle-scale]')];
  const title = root.querySelector('[data-long-title]');
  const note = root.querySelector('[data-long-note]');
  const strip = root.querySelector('[data-long-strip]');
  const detail = root.querySelector('[data-long-detail]');
  let activeScale = 'modern';
  let activeItem = 0;

  function renderDetail(item) {
    detail.innerHTML = `
      <div class="long-cycle-detail__date">${item.date}</div>
      <div class="long-cycle-detail__name">${item.name}</div>
      <div class="long-cycle-detail__grid">
        <div><strong>Sky / cycle</strong><span>${item.sky}</span></div>
        <div><strong>World</strong><span>${item.world}</span></div>
        <div><strong>Reading</strong><span>${item.read}</span></div>
      </div>`;
  }

  function renderScale(key) {
    const scale = scales[key];
    if (!scale) return;
    activeScale = key;
    activeItem = 0;
    title.textContent = scale.title;
    note.textContent = scale.note;

    scaleButtons.forEach((button) => {
      const active = button.dataset.cycleScale === key;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    strip.innerHTML = scale.items.map((item, index) => `
      <button type="button" class="long-cycle-node${index === 0 ? ' is-active' : ''}" data-long-item="${index}">
        <span>${item.date}</span>
        <strong>${item.name}</strong>
      </button>`).join('');

    strip.querySelectorAll('[data-long-item]').forEach((button) => {
      button.addEventListener('click', () => {
        activeItem = Number(button.dataset.longItem);
        strip.querySelectorAll('[data-long-item]').forEach((node) => node.classList.toggle('is-active', node === button));
        renderDetail(scale.items[activeItem]);
      });
    });

    renderDetail(scale.items[0]);
  }

  scaleButtons.forEach((button) => {
    button.addEventListener('click', () => renderScale(button.dataset.cycleScale));
  });

  renderScale(activeScale);
})();
