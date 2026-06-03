export const PORTAL_LAB_KEYS = Object.freeze({
  intentions: 'portalLab.intentions',
  dreams: 'portalLab.dreams',
  synchs: 'portalLab.synchs',
  notes: 'portalLab.notes',
  sessions: 'portalLab.sessions',
  favorites: 'portalLab.favorites',
});

export const PORTAL_LAB_TOPICS = Object.freeze([
  {
    id: 'tesla-resonance',
    title: 'Nikola Tesla: resonance, electricity, wireless power, myth vs. record',
    labels: ['Historical', 'Documented', 'Myth / unverified'],
    summary: joinText(
      'Tesla is a real doorway into resonance, alternating current,',
      'high-voltage experiments, and wireless power dreams.'
    ),
    facts: [
      joinText(
        'Tesla held many patents and worked on alternating current systems,',
        'radio-adjacent communication, lighting, and resonance.'
      ),
      joinText(
        'Wardenclyffe was an unfinished wireless communication and power project,',
        'not proof that unlimited free energy was deployed.'
      ),
    ],
    speculation: joinText(
      'Speculative readings often turn Tesla into a symbol of suppressed ether technology',
      'or hidden energy systems.'
    ),
    warning: joinText(
      'Separate documented electrical engineering from internet myth, quote fragments,',
      'and claims without primary records.'
    ),
    matters: joinText(
      'Tesla gives Portal Lab a grounded way to ask how resonance moves energy',
      'without making every legend factual.'
    ),
    experiment: 'Safely compare how different drone tones affect attention, posture, and mood. Do not use high volume.',
    sourceNotes: joinText(
      'Source notes placeholder: Tesla patents, biographies, Wardenclyffe records,',
      'and engineering histories.'
    ),
  },
  {
    id: 'jack-parsons-jpl',
    title: 'Jack Parsons & JPL: rocketry, Aerojet, Thelema, myth of "NASA founder"',
    labels: ['Historical', 'Documented', 'Myth / unverified'],
    summary: joinText(
      'Parsons was part of early Caltech rocketry and Aerojet history,',
      'while his occult life feeds later mythology.'
    ),
    facts: [
      joinText(
        'JPL history names Jack Parsons among the early rocketry group',
        'working with Frank Malina, Edward Forman, and others.'
      ),
      'Aerojet and JPL emerged from specific Caltech and Army-backed rocket work, not from a single founder story.',
    ],
    speculation: joinText(
      'Some interpretations read Parsons as a ritual-technological bridge',
      'between occult practice and spaceflight.'
    ),
    warning: 'Avoid the oversimplified claim that Parsons founded NASA. NASA was created later as a federal agency.',
    matters: 'This topic shows how real technical history, personality, ritual, and myth can become fused.',
    experiment: 'Map one historical claim into documented fact, speculation, myth warning, and open question.',
    sourceNotes: 'Source notes placeholder: NASA/JPL history, Aerojet history, biographies, and Caltech archives.',
  },
  {
    id: 'project-gateway',
    title: 'Project Gateway: altered states and consciousness training',
    labels: ['Declassified', 'Controversial', 'Personal practice'],
    summary: joinText(
      'Gateway material is useful as a case study in state training,',
      'audio guidance, and official interest in consciousness.'
    ),
    facts: [
      'CIA Reading Room materials include Gateway-related analysis and altered-state training documents.',
      'The documents are records of interest and analysis, not confirmation that every metaphysical claim is correct.',
    ],
    speculation: 'Speculative readings treat Gateway as a proof text for out-of-body travel or nonlocal perception.',
    warning: 'Declassified does not mean proven. It means the record exists and can be studied.',
    matters: joinText(
      'Gateway helps Portal Lab practice disciplined curiosity around breath, audio,',
      'attention, and state change.'
    ),
    experiment: joinText(
      'Run a ten-minute audio-free relaxation protocol and log felt experience,',
      'measured data, and interpretation separately.'
    ),
    sourceNotes: 'Source notes placeholder: CIA Reading Room Gateway files and independent critiques.',
  },
  {
    id: 'project-scanate',
    title: 'Project SCANATE: remote viewing and Cold War intelligence research',
    labels: ['Declassified', 'Controversial', 'Historical'],
    summary: joinText(
      'SCANATE and later remote-viewing programs are examples of intelligence agencies',
      'testing unusual perception claims.'
    ),
    facts: [
      'CIA Reading Room records include SCANATE, GRILL FLAME, SUN STREAK, CENTER LANE, and STAR GATE material.',
      'The records include protocols, sessions, reviews, and program history rather than a simple verdict of proof.',
    ],
    speculation: joinText(
      'Supporters interpret some sessions as anomalous information access;',
      'critics dispute methods and conclusions.'
    ),
    warning: 'Remote-viewing-adjacent tests need strict blinding, preregistration, target pools, and sober scoring.',
    matters: 'This topic teaches how to design tests that reduce story-making after the result is known.',
    experiment: joinText(
      'Have a friend choose one image from a hidden set, write impressions before viewing,',
      'then score against all options.'
    ),
    sourceNotes: 'Source notes placeholder: CIA Reading Room STAR GATE and SCANATE documents.',
  },
  {
    id: 'dugway',
    title: 'Dugway Proving Ground: secrecy, chemical/biological testing history',
    labels: ['Documented', 'Historical', 'Speculative'],
    summary: 'Dugway is a real U.S. Army test site whose mission and history create an understandable aura of secrecy.',
    facts: [
      'Army sources describe Dugway as a Utah proving ground established in 1942 for chemical warfare testing.',
      joinText(
        'Official materials describe chemical, biological, radiological,',
        'and nuclear defense testing and training missions.'
      ),
    ],
    speculation: joinText(
      'Internet lore can expand real secrecy into unsupported claims about portals,',
      'entities, or hidden physics.'
    ),
    warning: 'A secretive site is not automatically evidence for every claim attached to it.',
    matters: 'Dugway is a good practice case for separating documented military testing from anomaly mythology.',
    experiment: joinText(
      'Create a claim table: what is documented, what is plausible,',
      'what is unverified, and what would count as evidence.'
    ),
    sourceNotes: 'Source notes placeholder: U.S. Army Dugway Proving Ground history and environmental records.',
  },
  {
    id: 'cern-ritual-myth',
    title: 'CERN Ritual Myth: Shiva symbolism, particle physics, prank video, internet lore',
    labels: ['Documented', 'Myth / unverified', 'Science'],
    summary: 'CERN combines advanced physics, symbolic art, and internet rumor in a way that demands careful sorting.',
    facts: [
      joinText(
        'CERN says the Shiva statue was a gift from India recognizing collaboration',
        'and symbolizing cosmic dance imagery.'
      ),
      'CERN has addressed a strange ritual video as an unauthorized prank, not an official ceremony.',
    ],
    speculation: joinText(
      'Portal language around CERN usually comes from metaphor, internet lore,',
      'and fear around powerful machines.'
    ),
    warning: 'Particle physics is not the same as ritual magic. Symbolic art is not proof of hidden ceremony.',
    matters: 'This topic trains non-paranoid thinking around science, symbolism, and viral video culture.',
    experiment: joinText(
      'Read one scientific explanation and one mythic interpretation,',
      'then write what each explains and what each ignores.'
    ),
    sourceNotes: 'Source notes placeholder: CERN FAQ pages, physics outreach pages, and media statements.',
  },
  {
    id: 'random-generators',
    title: 'Random Number Generators: intention and randomness',
    labels: ['Controversial', 'Testable', 'Statistics'],
    summary: joinText(
      'RNG experiments ask whether intention or group attention correlates',
      'with deviations from expected randomness.'
    ),
    facts: [
      joinText(
        'PEAR operated at Princeton from 1979 to 2007 and studied random event generators',
        'among other anomalies questions.'
      ),
      joinText(
        'The Global Consciousness Project describes a network of physical RNGs',
        'used to look for correlations with global events.'
      ),
    ],
    speculation: joinText(
      'Some researchers interpret small statistical effects as consciousness-linked;',
      'critics question methods and theory.'
    ),
    warning: joinText(
      'A single run is not a conclusion. Look for preregistered protocols, controls,',
      'replication, and effect size.'
    ),
    matters: joinText(
      'Randomness is one of the few portal-adjacent questions that can be made measurable',
      'in a browser-first lab.'
    ),
    experiment: joinText(
      'Run the 100-bit gate repeatedly, record the direction before each run,',
      'and analyze many sessions later.'
    ),
    sourceNotes: joinText(
      'Source notes placeholder: PEAR archive, GCP papers, statistics critiques,',
      'and replication discussions.'
    ),
  },
  {
    id: 'dmt-altered-states',
    title: 'DMT / altered states: subjective portals and body-state transformation',
    labels: ['Documented', 'Personal practice', 'Controversial'],
    summary: joinText(
      'DMT research is relevant to Portal Lab as a study of intense subjective portal-like experience,',
      'not as a claim engine.'
    ),
    facts: [
      joinText(
        'Peer-reviewed studies describe DMT as producing intense altered states',
        'with measurable brain and subjective reports.'
      ),
      'The fact that an experience is powerful does not settle what it means metaphysically.',
    ],
    speculation: joinText(
      'Some people interpret these states as contact, realms, or gateways;',
      'others interpret them as brain-generated experience.'
    ),
    warning: joinText(
      'This app does not advise substance use. Use sober practices like breath,',
      'sound, sleep logging, and reflection.'
    ),
    matters: 'Altered-state reports show why felt experience matters while still needing careful interpretation.',
    experiment: joinText(
      'Log dreams, meditation, music-induced imagery, or breath practice',
      'as subjective portal data without overclaiming.'
    ),
    sourceNotes: 'Source notes placeholder: NIH/PubMed studies, harm-reduction sources, and phenomenology papers.',
  },
]);

let fallbackIdCounter = 0;

function joinText(...parts) {
  return parts.join(' ');
}

export function readPortalLabList(keyName, storage = globalThis.localStorage) {
  const key = PORTAL_LAB_KEYS[keyName] || keyName;
  if (!storage || typeof storage.getItem !== 'function') {
    return [];
  }
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

export function writePortalLabList(keyName, entries, storage = globalThis.localStorage) {
  const key = PORTAL_LAB_KEYS[keyName] || keyName;
  if (!storage || typeof storage.setItem !== 'function') {
    return [];
  }
  const safeEntries = Array.isArray(entries) ? entries : [];
  storage.setItem(key, JSON.stringify(safeEntries));
  return safeEntries;
}

export function appendPortalLabEntry(keyName, entry, storage = globalThis.localStorage) {
  const entries = readPortalLabList(keyName, storage);
  const nextEntry = {
    id: normalizeText(entry?.id) || makePortalLabId(keyName),
    createdAt: normalizeText(entry?.createdAt) || new Date().toISOString(),
    ...entry,
  };
  entries.unshift(nextEntry);
  writePortalLabList(keyName, entries.slice(0, 80), storage);
  return nextEntry;
}

export function generateBinaryValues(count = 100, cryptoProvider = globalThis.crypto) {
  const requestedCount = Number(count);
  if (!Number.isInteger(requestedCount) || requestedCount <= 0 || requestedCount > 10000) {
    throw new RangeError('count must be an integer between 1 and 10000');
  }
  if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is required for Portal Lab randomness trials');
  }
  const bytes = new Uint8Array(requestedCount);
  cryptoProvider.getRandomValues(bytes);
  return Array.from(bytes, byte => byte & 1);
}

export function analyzeRandomnessGate(values, intention = 'more-ones') {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('values must be a non-empty array');
  }
  const normalizedValues = values.map(value => {
    const number = Number(value);
    if (number !== 0 && number !== 1) {
      throw new RangeError('values must contain only 0 or 1');
    }
    return number;
  });
  const selectedIntention = intention === 'more-zeros' ? 'more-zeros' : 'more-ones';
  const ones = normalizedValues.reduce((total, value) => total + value, 0);
  const zeros = normalizedValues.length - ones;
  const expected = normalizedValues.length / 2;
  const targetCount = selectedIntention === 'more-ones' ? ones : zeros;
  const targetDifference = targetCount - expected;
  const differenceFromExpected = ones - expected;
  const classification = classifyRandomnessResult(targetDifference, normalizedValues.length);

  return {
    source: 'browser-crypto-getRandomValues',
    count: normalizedValues.length,
    intention: selectedIntention,
    ones,
    zeros,
    expected,
    differenceFromExpected,
    targetDifference,
    classification,
    interpretation: buildRandomnessInterpretation(classification),
  };
}

export function buildRandomnessSession(input = {}) {
  const values = Array.isArray(input.values) ? input.values : [];
  const analysis = input.analysis || analyzeRandomnessGate(values, input.intention);
  return {
    id: normalizeText(input.id) || makePortalLabId('session'),
    app: 'portal-lab',
    type: 'randomness-gate',
    version: 1,
    createdAt: normalizeText(input.createdAt) || new Date().toISOString(),
    values,
    result: analysis,
  };
}

export function getResearchTopic(topicId) {
  return PORTAL_LAB_TOPICS.find(topic => topic.id === topicId) || null;
}

export function toggleFavoriteTopic(topicId, storage = globalThis.localStorage) {
  const topic = getResearchTopic(topicId);
  if (!topic) {
    throw new Error(`Unknown Portal Lab topic: ${topicId}`);
  }
  const favorites = readPortalLabList('favorites', storage);
  const exists = favorites.includes(topicId);
  const next = exists ? favorites.filter(id => id !== topicId) : [topicId, ...favorites];
  writePortalLabList('favorites', next, storage);
  return next;
}

function classifyRandomnessResult(targetDifference, sampleCount) {
  const nearThreshold = Math.max(3, Math.round(sampleCount * 0.06));
  if (Math.abs(targetDifference) <= nearThreshold) {
    return 'near chance';
  }
  return targetDifference > 0 ? 'above chance' : 'below chance';
}

function buildRandomnessInterpretation(classification) {
  if (classification === 'above chance') {
    return 'This run landed above the selected direction. Treat it as one exploratory data point.';
  }
  if (classification === 'below chance') {
    return 'This run landed below the selected direction. Treat it as one exploratory data point.';
  }
  return 'This run stayed near chance. That is a valid result, not a failure.';
}

function makePortalLabId(prefix) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  fallbackIdCounter += 1;
  return `${prefix}-${Date.now()}-${fallbackIdCounter}`;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function createEntryItem(title, body, meta = '') {
  const item = document.createElement('article');
  item.className = 'entry-item';
  const strong = document.createElement('strong');
  strong.textContent = title || 'Untitled';
  item.append(strong);
  if (meta) {
    const small = document.createElement('small');
    small.textContent = meta;
    item.append(small);
  }
  if (body) {
    const paragraph = document.createElement('p');
    paragraph.textContent = body;
    item.append(paragraph);
  }
  return item;
}

function renderEntryList(element, entries, emptyText, formatEntry) {
  if (!element) {
    return;
  }
  element.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = emptyText;
    element.append(empty);
    return;
  }
  entries.slice(0, 8).forEach(entry => {
    element.append(formatEntry(entry));
  });
}

function renderAtlas(refs) {
  if (!refs.atlasGrid) {
    return;
  }
  refs.atlasGrid.replaceChildren();
  const favorites = new Set(readPortalLabList('favorites'));
  PORTAL_LAB_TOPICS.forEach(topic => {
    const details = document.createElement('details');
    details.className = 'atlas-card';
    details.dataset.topic = topic.id;

    const summary = document.createElement('summary');
    const title = document.createElement('h3');
    const titleText = document.createElement('span');
    titleText.textContent = topic.title;
    const marker = document.createElement('span');
    marker.className = 'evidence-tag';
    marker.textContent = favorites.has(topic.id) ? 'Favorite' : 'Open';
    title.append(titleText, marker);

    const labels = document.createElement('div');
    labels.className = 'atlas-card__labels';
    topic.labels.forEach(label => {
      const tag = document.createElement('span');
      tag.className = 'evidence-tag';
      tag.textContent = label;
      labels.append(tag);
    });
    const summaryText = document.createElement('p');
    summaryText.textContent = topic.summary;
    summary.append(title, labels, summaryText);

    const body = document.createElement('div');
    body.className = 'atlas-card__body';
    body.append(
      createAtlasBlock('Documented facts', topic.facts.join(' ')),
      createAtlasBlock('Speculative interpretations', topic.speculation),
      createAtlasBlock('Myth warnings', topic.warning),
      createAtlasBlock('Why it matters', topic.matters),
      createAtlasBlock('Safe experiment or reflection', topic.experiment),
      createAtlasBlock('Source notes placeholder', topic.sourceNotes)
    );

    const favoriteButton = document.createElement('button');
    favoriteButton.className = 'portal-button favorite-button';
    favoriteButton.type = 'button';
    favoriteButton.dataset.favoriteTopic = topic.id;
    favoriteButton.textContent = favorites.has(topic.id) ? 'Remove favorite' : 'Favorite topic';
    body.append(favoriteButton);

    details.append(summary, body);
    refs.atlasGrid.append(details);
  });
}

function createAtlasBlock(title, body) {
  const block = document.createElement('div');
  block.className = 'atlas-block';
  const heading = document.createElement('h4');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = body;
  block.append(heading, paragraph);
  return block;
}

function renderJournal(refs) {
  const intentions = readPortalLabList('intentions');
  const dreams = readPortalLabList('dreams');
  const synchs = readPortalLabList('synchs');
  const notes = readPortalLabList('notes');
  const sessions = readPortalLabList('sessions');
  const favorites = readPortalLabList('favorites');

  renderEntryList(refs.intentionList, intentions, 'No intentions saved yet.', entry => (
    createEntryItem('Intention', entry.text, formatDate(entry.createdAt))
  ));
  renderEntryList(refs.dreamList, dreams, 'No dreams or symbols saved yet.', entry => (
    createEntryItem(entry.title || entry.type, entry.body, `${entry.type || 'dream'} - ${formatDate(entry.createdAt)}`)
  ));
  renderEntryList(refs.synchList, synchs, 'No synchronicities saved yet.', entry => (
    createEntryItem(entry.title || 'Synchronicity', entry.body, formatDate(entry.createdAt))
  ));
  renderEntryList(refs.noteList, notes, 'No research notes saved yet.', entry => (
    createEntryItem(entry.title || 'Reality check', summarizeRealityNote(entry), formatDate(entry.createdAt))
  ));
  renderEntryList(refs.sessionList, sessions, 'No randomness sessions saved yet.', entry => (
    createEntryItem(
      entry.result?.classification || 'Randomness session',
      `${entry.result?.ones ?? 0} ones, ${entry.result?.zeros ?? 0} zeros, intention: ${entry.result?.intention || ''}`,
      formatDate(entry.createdAt)
    )
  ));
  renderEntryList(refs.favoriteList, favorites, 'No favorite topics yet.', topicId => {
    const topic = getResearchTopic(topicId);
    return createEntryItem(topic?.title || topicId, topic?.summary || '', 'Research Atlas');
  });
}

function summarizeRealityNote(entry) {
  if (entry.body) {
    return entry.body;
  }
  return [
    entry.feltExperience ? `Felt: ${entry.feltExperience}` : '',
    entry.measuredData ? `Measured: ${entry.measuredData}` : '',
    entry.interpretation ? `Interpretation: ${entry.interpretation}` : '',
    entry.openQuestion ? `Question: ${entry.openQuestion}` : '',
  ].filter(Boolean).join(' ');
}

function initBreathGate(refs) {
  if (!refs.startBreath || !refs.stopBreath || !refs.breathOrb) {
    return;
  }
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  refs.startBreath.addEventListener('click', () => {
    const bpm = Number(refs.breathRate?.value || 6);
    const cycle = 60 / (bpm || 6);
    refs.breathOrb.style.setProperty('--breath-cycle', `${cycle}s`);
    refs.breathOrb.classList.add('is-breathing');
    setText(
      refs.breathStatus,
      reducedMotion
        ? `Reduced motion is active. Use a ${Math.round(cycle)} second inhale/exhale rhythm.`
        : `Breathing at ${bpm} breaths per minute. Let the visual cue stay gentle.`
    );
  });
  refs.stopBreath.addEventListener('click', () => {
    refs.breathOrb.classList.remove('is-breathing');
    setText(refs.breathStatus, 'Breath gate stopped.');
  });
}

function initToneGate(refs) {
  const toneState = {
    context: null,
    nodes: [],
  };

  const stopTone = () => {
    toneState.nodes.forEach(node => {
      try {
        if (typeof node.stop === 'function') {
          node.stop();
        }
        if (typeof node.disconnect === 'function') {
          node.disconnect();
        }
      } catch (_error) {
        // Already stopped.
      }
    });
    toneState.nodes = [];
    setText(refs.toneStatus, 'Tone gate stopped.');
  };

  refs.stopTone?.addEventListener('click', stopTone);
  refs.toneVolume?.addEventListener('input', () => {
    setText(refs.toneVolumeValue, `${refs.toneVolume.value}%`);
  });
  refs.startTone?.addEventListener('click', async () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      setText(refs.toneStatus, 'Web Audio API is not available in this browser.');
      return;
    }

    stopTone();
    toneState.context = toneState.context || new AudioContextCtor();
    if (toneState.context.state === 'suspended') {
      await toneState.context.resume();
    }

    const baseFrequency = getToneFrequency(refs.toneSelect?.value);
    const gain = toneState.context.createGain();
    gain.gain.value = Number(refs.toneVolume?.value || 8) / 100;
    gain.connect(toneState.context.destination);
    toneState.nodes.push(gain);

    const useSplit = Boolean(refs.binauralMode?.checked);
    const leftFrequency = baseFrequency;
    const rightFrequency = useSplit ? baseFrequency + 4 : baseFrequency;
    const oscillators = [
      createOscillator(toneState.context, leftFrequency, useSplit ? -1 : 0, gain),
      createOscillator(toneState.context, rightFrequency, useSplit ? 1 : 0, gain),
    ];
    oscillators.forEach(oscillator => toneState.nodes.push(oscillator));
    setText(refs.toneStatus, `Playing a ${refs.toneSelect?.value || 'medium'} tone at low volume.`);
  });
}

function createOscillator(context, frequency, pan, destination) {
  const oscillator = context.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  if (typeof context.createStereoPanner === 'function') {
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    oscillator.connect(panner);
    panner.connect(destination);
  } else {
    oscillator.connect(destination);
  }

  oscillator.start();
  return oscillator;
}

function getToneFrequency(value) {
  if (value === 'low') return 110;
  if (value === 'high') return 432;
  return 220;
}

function initIntentionGate(refs) {
  refs.saveIntention?.addEventListener('click', () => {
    const text = normalizeText(refs.intentionInput?.value);
    if (!text) {
      setText(refs.activeIntention, 'Write one clear intention before saving.');
      return;
    }
    const entry = appendPortalLabEntry('intentions', { text });
    refs.intentionInput.value = '';
    setText(refs.activeIntention, entry.text);
    renderJournal(refs);
  });

  const latest = readPortalLabList('intentions')[0];
  if (latest) {
    setText(refs.activeIntention, latest.text);
  }
}

function initRandomnessGate(refs) {
  refs.runRandomness?.addEventListener('click', () => {
    try {
      const values = generateBinaryValues(100);
      const analysis = analyzeRandomnessGate(values, refs.randomIntent?.value);
      const session = buildRandomnessSession({ values, analysis });
      appendPortalLabEntry('sessions', session);
      renderRandomness(refs, session);
      renderJournal(refs);
    } catch (error) {
      setText(refs.randomnessResult, error.message || 'Randomness trial failed.');
    }
  });

  if (!(window.crypto && typeof window.crypto.getRandomValues === 'function') && refs.runRandomness) {
    refs.runRandomness.disabled = true;
    setText(refs.randomnessResult, 'Browser crypto is unavailable here, so the randomness gate is disabled.');
  }
}

function renderRandomness(refs, session) {
  const result = session.result;
  refs.randomnessResult.replaceChildren();
  const stats = document.createElement('div');
  stats.className = 'rng-stats';
  [
    ['Selected direction', result.intention === 'more-ones' ? 'more 1s' : 'more 0s'],
    ['Ones', result.ones],
    ['Zeros', result.zeros],
    ['Expected', result.expected],
    ['Difference from expected ones', result.differenceFromExpected],
    ['Result', result.classification],
  ].forEach(([label, value]) => {
    const row = document.createElement('span');
    const rowLabel = document.createElement('span');
    rowLabel.textContent = label;
    const rowValue = document.createElement('strong');
    rowValue.textContent = String(value);
    row.append(rowLabel, rowValue);
    stats.append(row);
  });
  const interpretation = document.createElement('p');
  interpretation.textContent = `${result.interpretation} This is exploratory and not proof of paranormal ability.`;
  refs.randomnessResult.append(stats, interpretation);

  refs.bitStrip.replaceChildren();
  session.values.forEach(value => {
    const cell = document.createElement('span');
    cell.className = 'bit-cell';
    cell.dataset.bit = String(value);
    cell.title = String(value);
    refs.bitStrip.append(cell);
  });
}

function initDreamGate(refs) {
  refs.saveEntry?.addEventListener('click', () => {
    const type = refs.entryType?.value || 'dream';
    const title = normalizeText(refs.entryTitle?.value);
    const body = normalizeText(refs.entryBody?.value);
    if (!title && !body) {
      return;
    }

    const entry = { type, title, body };
    appendPortalLabEntry(type === 'synchronicity' ? 'synchs' : 'dreams', entry);
    refs.entryTitle.value = '';
    refs.entryBody.value = '';
    renderJournal(refs);
  });
}

function initRealityCheck(refs) {
  refs.communityShare?.addEventListener('change', () => {
    setText(
      refs.shareStatus,
      refs.communityShare.checked
        ? 'Placeholder only: this note will still stay local in v0.1.'
        : 'Community sharing is a placeholder and is off by default.'
    );
  });

  refs.saveRealityCheck?.addEventListener('click', () => {
    const note = {
      title: 'Reality check',
      feltExperience: normalizeText(refs.feltExperience?.value),
      measuredData: normalizeText(refs.measuredData?.value),
      interpretation: normalizeText(refs.interpretation?.value),
      openQuestion: normalizeText(refs.openQuestion?.value),
      shareRequested: Boolean(refs.communityShare?.checked),
    };
    if (!note.feltExperience && !note.measuredData && !note.interpretation && !note.openQuestion) {
      setText(refs.realityStatus, 'Add at least one layer before saving.');
      return;
    }
    appendPortalLabEntry('notes', note);
    ['feltExperience', 'measuredData', 'interpretation', 'openQuestion'].forEach(name => {
      if (refs[name]) refs[name].value = '';
    });
    setText(
      refs.realityStatus,
      note.shareRequested
        ? 'Saved locally. Community sharing is a future option and did not publish this note.'
        : 'Reality check saved locally.'
    );
    renderJournal(refs);
  });
}

function initAtlas(refs) {
  renderAtlas(refs);
  refs.atlasGrid?.addEventListener('click', event => {
    const button = event.target.closest('[data-favorite-topic]');
    if (!button) {
      return;
    }
    toggleFavoriteTopic(button.getAttribute('data-favorite-topic'));
    renderAtlas(refs);
    renderJournal(refs);
  });
}

function initBrowserApp() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const refs = {
    breathOrb: document.getElementById('breathOrb'),
    breathRate: document.getElementById('breathRate'),
    startBreath: document.getElementById('startBreath'),
    stopBreath: document.getElementById('stopBreath'),
    breathStatus: document.getElementById('breathStatus'),
    toneSelect: document.getElementById('toneSelect'),
    toneVolume: document.getElementById('toneVolume'),
    toneVolumeValue: document.getElementById('toneVolumeValue'),
    binauralMode: document.getElementById('binauralMode'),
    startTone: document.getElementById('startTone'),
    stopTone: document.getElementById('stopTone'),
    toneStatus: document.getElementById('toneStatus'),
    intentionInput: document.getElementById('intentionInput'),
    saveIntention: document.getElementById('saveIntention'),
    activeIntention: document.getElementById('activeIntention'),
    randomIntent: document.getElementById('randomIntent'),
    runRandomness: document.getElementById('runRandomness'),
    randomnessResult: document.getElementById('randomnessResult'),
    bitStrip: document.getElementById('bitStrip'),
    entryType: document.getElementById('entryType'),
    entryTitle: document.getElementById('entryTitle'),
    entryBody: document.getElementById('entryBody'),
    saveEntry: document.getElementById('saveEntry'),
    communityShare: document.getElementById('communityShare'),
    shareStatus: document.getElementById('shareStatus'),
    feltExperience: document.getElementById('feltExperience'),
    measuredData: document.getElementById('measuredData'),
    interpretation: document.getElementById('interpretation'),
    openQuestion: document.getElementById('openQuestion'),
    saveRealityCheck: document.getElementById('saveRealityCheck'),
    realityStatus: document.getElementById('realityStatus'),
    atlasGrid: document.getElementById('atlasGrid'),
    intentionList: document.getElementById('intentionList'),
    dreamList: document.getElementById('dreamList'),
    synchList: document.getElementById('synchList'),
    noteList: document.getElementById('noteList'),
    sessionList: document.getElementById('sessionList'),
    favoriteList: document.getElementById('favoriteList'),
  };

  initBreathGate(refs);
  initToneGate(refs);
  initIntentionGate(refs);
  initRandomnessGate(refs);
  initDreamGate(refs);
  initRealityCheck(refs);
  initAtlas(refs);
  renderJournal(refs);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrowserApp, { once: true });
  } else {
    initBrowserApp();
  }
}
