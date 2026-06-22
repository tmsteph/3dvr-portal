import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

export const PURPOSE_STORAGE_KEY = '3dvr-purpose-draft-v1';

export const prompts = Object.freeze([
  'What feels scattered or unfinished in your life right now?',
  'What keeps calling your attention?',
  'Who do you care about helping or becoming useful to?',
  'What would you like to build, learn, change, or organize?',
  'What small move could you make this week?'
]);

const promptKeys = Object.freeze([
  'scattered',
  'attention',
  'people',
  'project',
  'move'
]);

const initialState = Object.freeze({
  version: 1,
  step: 'start',
  promptIndex: 0,
  answers: ['', '', '', '', ''],
  map: null,
  updatedAt: null
});

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sentenceFrom(value, fallback) {
  const text = cleanText(value);
  if (!text) return fallback;
  return text.length > 210 ? `${text.slice(0, 207).trim()}...` : text;
}

function firstPhrase(value, fallback) {
  const text = cleanText(value);
  if (!text) return fallback;
  const split = text.split(/[.!?;\n]/).map((part) => part.trim()).filter(Boolean);
  const phrase = split[0] || text;
  return phrase.length > 90 ? `${phrase.slice(0, 87).trim()}...` : phrase;
}

export function normalizePurposeState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const answers = Array.isArray(source.answers) ? source.answers : [];

  return {
    version: 1,
    step: ['start', 'prompt', 'map'].includes(source.step) ? source.step : 'start',
    promptIndex: Math.min(4, Math.max(0, Number.parseInt(source.promptIndex, 10) || 0)),
    answers: promptKeys.map((_key, index) => cleanText(answers[index])),
    map: source.map && typeof source.map === 'object' ? source.map : null,
    updatedAt: source.updatedAt || null
  };
}

export function createPurposeStorage(storage = globalThis.localStorage) {
  const parse = (raw) => {
    if (!raw) return { ...initialState, answers: [...initialState.answers] };
    try {
      return normalizePurposeState(JSON.parse(raw));
    } catch {
      return { ...initialState, answers: [...initialState.answers] };
    }
  };

  return {
    load() {
      return parse(storage.getItem(PURPOSE_STORAGE_KEY));
    },
    save(value) {
      const payload = normalizePurposeState({
        ...value,
        updatedAt: new Date().toISOString()
      });
      storage.setItem(PURPOSE_STORAGE_KEY, JSON.stringify(payload));
      return payload;
    },
    clear() {
      storage.removeItem(PURPOSE_STORAGE_KEY);
    },
    export(value) {
      return JSON.stringify(normalizePurposeState(value), null, 2);
    },
    import(value) {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      const imported = normalizePurposeState(parsed);
      return this.save(imported);
    },
    migrateToAccount() {
      return {
        ok: false,
        reason: 'account-save-not-wired'
      };
    }
  };
}

export function generatePurposeMap(answers) {
  const normalized = normalizePurposeState({ answers }).answers;
  const [scattered, attention, people, project, move] = normalized;
  const projectPhrase = firstPhrase(project, 'a meaningful project that brings order to what matters');
  const peoplePhrase = firstPhrase(people, 'the people you want to become useful to');
  const attentionPhrase = firstPhrase(attention, 'the signal that keeps asking for your attention');
  const scatteredPhrase = firstPhrase(scattered, 'unfinished responsibilities and ideas');
  const movePhrase = firstPhrase(move, 'one small move you can make this week');

  const smallMoves = [
    `Name the open loop: write one sentence about "${scatteredPhrase}".`,
    `Give ${attentionPhrase.toLowerCase()} a 25-minute block on your calendar.`,
    `Take the first visible step: ${movePhrase}.`
  ];

  return {
    currentSeason: `You are in a sorting season: ${sentenceFrom(scattered, 'different parts of life are asking to be gathered into one clear view')}.`,
    patternShowingUp: `Your attention keeps returning to ${attentionPhrase.toLowerCase()}, especially in relation to ${peoplePhrase.toLowerCase()}.`,
    possiblePurposeDirection: `Become someone who can help with ${peoplePhrase.toLowerCase()} by turning scattered experience into useful structure.`,
    meaningfulProjectSeed: `Start with ${projectPhrase.toLowerCase()}. Keep it small enough to move this week and meaningful enough to care about.`,
    thisWeeksSmallMoves: smallMoves
  };
}

export function purposeMapToMarkdown(map, answers = []) {
  const safeMap = map || generatePurposeMap(answers);
  return [
    '# Purpose Map',
    '',
    `## Current Season\n${safeMap.currentSeason}`,
    '',
    `## Pattern Showing Up\n${safeMap.patternShowingUp}`,
    '',
    `## Possible Purpose Direction\n${safeMap.possiblePurposeDirection}`,
    '',
    `## Meaningful Project Seed\n${safeMap.meaningfulProjectSeed}`,
    '',
    '## This Week\'s 3 Small Moves',
    ...safeMap.thisWeeksSmallMoves.map((item, index) => `${index + 1}. ${item}`)
  ].join('\n');
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function initPurposeScene(canvas, getAnsweredCount) {
  if (!canvas) return null;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.6, 7.6);

  const nodePositions = [
    new THREE.Vector3(-2.7, 0.5, 0),
    new THREE.Vector3(-1.1, 1.45, -0.25),
    new THREE.Vector3(0.65, 0.55, 0.18),
    new THREE.Vector3(2.3, 1.2, -0.16),
    new THREE.Vector3(1.45, -1.15, 0.24)
  ];

  const group = new THREE.Group();
  scene.add(group);

  const ambient = new THREE.AmbientLight(0xffead2, 1.35);
  scene.add(ambient);
  const point = new THREE.PointLight(0x8ee9d8, 18, 16);
  point.position.set(0, 2, 4);
  scene.add(point);

  const nodeGeometry = new THREE.SphereGeometry(0.095, 32, 16);
  const dormantMaterial = new THREE.MeshBasicMaterial({ color: 0x6d5e66, transparent: true, opacity: 0.48 });
  const nodes = nodePositions.map((position) => {
    const mesh = new THREE.Mesh(nodeGeometry, dormantMaterial.clone());
    mesh.position.copy(position);
    group.add(mesh);
    return mesh;
  });

  const lineGeometry = new THREE.BufferGeometry().setFromPoints(nodePositions);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x8ee9d8, transparent: true, opacity: 0.12 });
  const line = new THREE.Line(lineGeometry, lineMaterial);
  group.add(line);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.25, 0.008, 12, 160),
    new THREE.MeshBasicMaterial({ color: 0xffad8f, transparent: true, opacity: 0.18 })
  );
  ring.rotation.set(1.1, 0.2, 0.15);
  group.add(ring);

  const starsGeometry = new THREE.BufferGeometry();
  const starCount = 180;
  const stars = new Float32Array(starCount * 3);
  for (let index = 0; index < starCount; index += 1) {
    stars[index * 3] = (Math.random() - 0.5) * 11;
    stars[index * 3 + 1] = (Math.random() - 0.5) * 7;
    stars[index * 3 + 2] = (Math.random() - 0.5) * 5 - 1.8;
  }
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  const starsMesh = new THREE.Points(
    starsGeometry,
    new THREE.PointsMaterial({ color: 0xfff2d1, size: 0.018, transparent: true, opacity: 0.58 })
  );
  scene.add(starsMesh);

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  let frameId = 0;
  const render = (time = 0) => {
    const answered = getAnsweredCount();
    group.rotation.y = Math.sin(time * 0.00018) * 0.16;
    group.rotation.x = Math.sin(time * 0.00013) * 0.08;
    starsMesh.rotation.y += 0.00022;
    line.material.opacity = answered >= 5 ? 0.62 : 0.14 + answered * 0.075;
    ring.material.opacity = answered >= 5 ? 0.34 : 0.16;

    nodes.forEach((node, index) => {
      const isActive = index < answered;
      node.material.color.setHex(isActive ? 0xffd98a : 0x6d5e66);
      node.material.opacity = isActive ? 1 : 0.42;
      const pulse = isActive ? 1.25 + Math.sin(time * 0.002 + index) * 0.12 : 0.82;
      node.scale.setScalar(pulse);
    });

    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  };

  resize();
  window.addEventListener('resize', resize);
  frameId = requestAnimationFrame(render);

  return {
    destroy() {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      nodeGeometry.dispose();
      lineGeometry.dispose();
      ring.geometry.dispose();
      starsGeometry.dispose();
    }
  };
}

function initPurposeApp() {
  const storage = createPurposeStorage();
  let state = storage.load();

  const views = Array.from(document.querySelectorAll('[data-view]'));
  const answerInput = document.querySelector('[data-answer]');
  const promptTitle = document.getElementById('promptTitle');
  const promptProgress = document.getElementById('promptProgress');
  const progressFill = document.querySelector('[data-progress-fill]');
  const validation = document.querySelector('[data-validation]');
  const mapOutput = document.querySelector('[data-map-output]');
  const mapTemplate = document.getElementById('mapTemplate');
  const statusLine = document.querySelector('[data-status]');
  const portalLink = document.querySelector('[data-portal-link]');

  if (portalLink && window.location.hostname === 'purpose.3dvr.tech') {
    portalLink.hidden = true;
  }

  const answeredCount = () => state.answers.filter(Boolean).length;
  initPurposeScene(document.getElementById('purposeScene'), answeredCount);

  const setStatus = (message) => {
    if (statusLine) statusLine.textContent = message;
  };

  const save = () => {
    state = storage.save(state);
  };

  const showView = (name) => {
    views.forEach((view) => {
      view.hidden = view.dataset.view !== name;
    });
    state.step = name;
    save();
  };

  const renderPrompt = () => {
    const index = state.promptIndex;
    if (promptTitle) promptTitle.textContent = prompts[index];
    if (promptProgress) promptProgress.textContent = `Prompt ${index + 1} of ${prompts.length}`;
    if (progressFill) progressFill.style.width = `${((index + 1) / prompts.length) * 100}%`;
    if (answerInput) {
      answerInput.value = state.answers[index] || '';
      setTimeout(() => answerInput.focus(), 20);
    }
    if (validation) validation.textContent = '';
  };

  const renderMap = () => {
    state.map = generatePurposeMap(state.answers);
    save();
    if (!mapOutput || !mapTemplate) return;
    mapOutput.replaceChildren();
    const rows = [
      ['Current Season', state.map.currentSeason],
      ['Pattern Showing Up', state.map.patternShowingUp],
      ['Possible Purpose Direction', state.map.possiblePurposeDirection],
      ['Meaningful Project Seed', state.map.meaningfulProjectSeed],
      ['This Week\'s 3 Small Moves', state.map.thisWeeksSmallMoves.map((move, index) => `${index + 1}. ${move}`).join('\n')]
    ];
    rows.forEach(([label, body]) => {
      const node = mapTemplate.content.cloneNode(true);
      node.querySelector('.map-section__label').textContent = label;
      node.querySelector('.map-section__body').textContent = body;
      mapOutput.appendChild(node);
    });
  };

  document.querySelector('[data-start]')?.addEventListener('click', () => {
    state.promptIndex = Math.min(state.promptIndex || 0, 4);
    renderPrompt();
    showView('prompt');
  });

  document.querySelector('[data-next]')?.addEventListener('click', () => {
    const answer = cleanText(answerInput?.value);
    if (answer.length < 3) {
      if (validation) validation.textContent = 'Write at least a few words before continuing.';
      return;
    }
    state.answers[state.promptIndex] = answer;
    if (state.promptIndex >= prompts.length - 1) {
      renderMap();
      showView('map');
      setStatus('Purpose Map saved on this device.');
      return;
    }
    state.promptIndex += 1;
    save();
    renderPrompt();
  });

  document.querySelector('[data-back]')?.addEventListener('click', () => {
    if (state.promptIndex <= 0) {
      showView('start');
      return;
    }
    state.promptIndex -= 1;
    save();
    renderPrompt();
  });

  answerInput?.addEventListener('input', () => {
    state.answers[state.promptIndex] = cleanText(answerInput.value);
    save();
  });

  document.querySelector('[data-copy]')?.addEventListener('click', async () => {
    const markdown = purposeMapToMarkdown(state.map, state.answers);
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus('Purpose Map copied.');
    } catch {
      downloadText('purpose-map.md', markdown, 'text/markdown;charset=utf-8');
      setStatus('Clipboard unavailable, so the Purpose Map was downloaded instead.');
    }
  });

  document.querySelectorAll('[data-download-markdown]').forEach((button) => {
    button.addEventListener('click', () => {
      downloadText('purpose-map.md', purposeMapToMarkdown(state.map, state.answers), 'text/markdown;charset=utf-8');
      setStatus('Markdown downloaded.');
    });
  });

  document.querySelector('[data-export-json]')?.addEventListener('click', () => {
    downloadText('purpose-map.json', storage.export(state), 'application/json;charset=utf-8');
    setStatus('JSON exported.');
  });

  document.querySelector('[data-import-json]')?.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      state = storage.import(await file.text());
      state.map = generatePurposeMap(state.answers);
      state.step = 'map';
      save();
      renderMap();
      showView('map');
      setStatus('Imported Purpose Map.');
    } catch {
      setStatus('That JSON file could not be imported.');
    } finally {
      event.target.value = '';
    }
  });

  document.querySelector('[data-device-save]')?.addEventListener('click', () => {
    save();
    setStatus('Saved on this device.');
  });

  document.querySelector('[data-start-over]')?.addEventListener('click', () => {
    if (!window.confirm('Start over and clear this Purpose Map from this device?')) return;
    storage.clear();
    state = { ...initialState, answers: [...initialState.answers] };
    showView('start');
    setStatus('');
  });

  document.querySelectorAll('[data-future-action]').forEach((button) => {
    button.addEventListener('click', () => {
      setStatus('This path is ready for a future 3DVR workflow. Your Purpose Map is saved locally.');
    });
  });

  if (state.step === 'map' && answeredCount() === prompts.length) {
    renderMap();
    showView('map');
  } else if (state.step === 'prompt' || answeredCount() > 0) {
    renderPrompt();
    showView('prompt');
  } else {
    showView('start');
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initPurposeApp();
}
