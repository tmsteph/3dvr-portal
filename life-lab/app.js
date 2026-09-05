import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.176.0/build/three.module.js';
import {
  ancestorChain,
  descendantsOf,
  geneDistance,
  summarizeLineage,
} from './lineage.js';
import { selectionNarrative, summarizePopulation } from './science.js';

const worldEl = document.getElementById('world');
const pauseButton = document.getElementById('pause');
const chaosButton = document.getElementById('chaos');
const resetButton = document.getElementById('reset');
const foodRateInput = document.getElementById('food-rate');
const mutationInput = document.getElementById('mutation-rate');
const timeScaleInput = document.getElementById('time-scale');
const foodOutput = document.getElementById('food-output');
const mutationOutput = document.getElementById('mutation-output');
const timeOutput = document.getElementById('time-output');
const experimentName = document.getElementById('experiment-name');
const experimentHypothesis = document.getElementById('experiment-hypothesis');
const populationEl = document.getElementById('population');
const generationEl = document.getElementById('generation');
const diversityEl = document.getElementById('diversity');
const survivalEl = document.getElementById('survival');
const meanSpeedEl = document.getElementById('mean-speed');
const meanSenseEl = document.getElementById('mean-sense');
const meanSizeEl = document.getElementById('mean-size');
const birthDeathEl = document.getElementById('birth-death');
const scienceNoteEl = document.getElementById('science-note');
const chart = document.getElementById('trend-chart');
const chartContext = chart.getContext('2d');

const replayButton = document.getElementById('replay-lineage');
const clearSelectionButton = document.getElementById('clear-selection');
const selectedNameEl = document.getElementById('selected-name');
const selectedStateEl = document.getElementById('selected-state');
const selectedNoteEl = document.getElementById('selected-note');
const selectedGenerationEl = document.getElementById('selected-generation');
const selectedShareEl = document.getElementById('selected-share');
const selectedDescendantsEl = document.getElementById('selected-descendants');
const selectedMutationEl = document.getElementById('selected-mutation');
const selectedSpeedEl = document.getElementById('selected-speed');
const selectedSenseEl = document.getElementById('selected-sense');
const selectedSizeEl = document.getElementById('selected-size');
const selectedAgeEl = document.getElementById('selected-age');
const replayStatusEl = document.getElementById('replay-status');
const ancestryListEl = document.getElementById('ancestry-list');

const WORLD_RADIUS = 18;
const MAX_CREATURES = 180;
const MAX_FOOD = 280;
const creatureGeometry = new THREE.IcosahedronGeometry(0.48, 1);
const replayGeometry = new THREE.SphereGeometry(0.22, 10, 8);
const foodMaterial = new THREE.PointsMaterial({ color: 0xb5ffd9, size: 0.32, sizeAttenuation: true });
const pointerState = new Map();
const raycaster = new THREE.Raycaster();
const pointerVector = new THREE.Vector2();
const seedPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

let creatures = [];
let foods = [];
let paused = false;
let births = 0;
let deaths = 0;
let elapsed = 0;
let foodAccumulator = 0;
let sampleAccumulator = 0;
let history = [];
let cameraYaw = 0.65;
let cameraPitch = 0.42;
let cameraDistance = 39;
let dragDistance = 0;
let pinchStart = null;
let lastTime = performance.now();
let selectedCreatureId = null;
let renderedAncestryFor = null;
let lastLineagePanelUpdate = 0;
let replay = null;

const lineageArchive = new Map();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030807);
scene.fog = new THREE.FogExp2(0x030807, 0.018);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 160);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
worldEl.prepend(renderer.domElement);

scene.add(new THREE.AmbientLight(0xc8f7e3, 1.1));
const keyLight = new THREE.PointLight(0x8ef7cf, 70, 70);
keyLight.position.set(9, 12, 10);
scene.add(keyLight);
const fillLight = new THREE.PointLight(0x809cff, 45, 60);
fillLight.position.set(-12, -8, -8);
scene.add(fillLight);

const boundary = new THREE.Mesh(
  new THREE.SphereGeometry(WORLD_RADIUS, 30, 20),
  new THREE.MeshBasicMaterial({ color: 0x7df9c8, wireframe: true, transparent: true, opacity: 0.055 })
);
scene.add(boundary);

const replayGroup = new THREE.Group();
scene.add(replayGroup);

const starGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(900 * 3);
for (let index = 0; index < 900; index += 1) {
  const direction = randomDirection();
  const radius = random(24, 70);
  starPositions[index * 3] = direction.x * radius;
  starPositions[index * 3 + 1] = direction.y * radius;
  starPositions[index * 3 + 2] = direction.z * radius;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0x6f8f86, size: 0.11 })));

const foodGeometry = new THREE.BufferGeometry();
const foodPoints = new THREE.Points(foodGeometry, foodMaterial);
scene.add(foodPoints);

function random(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `life-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function shortId(id) {
  return String(id || '').split('-')[0].slice(0, 8) || 'unknown';
}

function cloneGenes(genes) {
  return {
    speed: genes.speed,
    sense: genes.sense,
    size: genes.size,
    hue: genes.hue,
  };
}

function randomDirection() {
  const vector = new THREE.Vector3(random(-1, 1), random(-1, 1), random(-1, 1));
  return vector.lengthSq() ? vector.normalize() : new THREE.Vector3(1, 0, 0);
}

function randomPoint(radius = WORLD_RADIUS * 0.82) {
  return randomDirection().multiplyScalar(Math.cbrt(Math.random()) * radius);
}

function mutate(value, amount, min, max) {
  return clamp(value + random(-amount, amount), min, max);
}

function createGenes(parentGenes = null, wild = false) {
  if (!parentGenes) {
    return {
      speed: random(wild ? 1.8 : 0.8, wild ? 4.6 : 3.2),
      sense: random(wild ? 3 : 5, wild ? 15 : 12),
      size: random(wild ? 0.55 : 0.7, wild ? 2.2 : 1.65),
      hue: Math.random(),
    };
  }

  const mutation = Number(mutationInput.value) / 100;
  return {
    speed: mutate(parentGenes.speed, mutation * 2.2, 0.45, 5.2),
    sense: mutate(parentGenes.sense, mutation * 8, 2.5, 17),
    size: mutate(parentGenes.size, mutation * 1.2, 0.45, 2.4),
    hue: (parentGenes.hue + random(-mutation * 0.7, mutation * 0.7) + 1) % 1,
  };
}

function archiveCreature(creature, parent) {
  lineageArchive.set(creature.id, {
    id: creature.id,
    parentId: creature.parentId,
    lineage: creature.lineage,
    generation: creature.generation,
    birthTime: elapsed,
    deathTime: null,
    birthPosition: {
      x: creature.position.x,
      y: creature.position.y,
      z: creature.position.z,
    },
    deathPosition: null,
    genes: cloneGenes(creature.genes),
    parentGenes: parent ? cloneGenes(parent.genes) : null,
  });
}

function makeCreature(parent = null, wild = false) {
  const genes = createGenes(parent?.genes, wild);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(genes.hue, 0.78, 0.62),
    roughness: 0.42,
    metalness: 0.08,
    emissive: new THREE.Color().setHSL(genes.hue, 0.5, 0.08),
    emissiveIntensity: 0.9,
  });
  const mesh = new THREE.Mesh(creatureGeometry, material);
  const scale = 0.52 + genes.size * 0.44;
  mesh.scale.setScalar(scale);
  mesh.position.copy(parent ? parent.position.clone().add(randomDirection().multiplyScalar(1.1)) : randomPoint());
  scene.add(mesh);

  const id = makeId();
  const creature = {
    id,
    parentId: parent?.id || null,
    lineage: parent?.lineage || id,
    genes,
    mesh,
    position: mesh.position,
    velocity: randomDirection().multiplyScalar(genes.speed * 0.55),
    energy: parent ? 62 : random(82, 112),
    age: 0,
    generation: parent ? parent.generation + 1 : 0,
    wander: randomDirection(),
  };
  mesh.userData.creatureId = id;
  archiveCreature(creature, parent);
  return creature;
}

function liveCreatureById(id) {
  return creatures.find((creature) => creature.id === id) || null;
}

function removeCreature(index) {
  const [creature] = creatures.splice(index, 1);
  if (!creature) return;
  const record = lineageArchive.get(creature.id);
  if (record) {
    record.deathTime = elapsed;
    record.deathPosition = {
      x: creature.position.x,
      y: creature.position.y,
      z: creature.position.z,
    };
  }
  scene.remove(creature.mesh);
  creature.mesh.material.dispose();
  deaths += 1;
}

function addFood(position = randomPoint(WORLD_RADIUS * 0.9), amount = 1) {
  for (let index = 0; index < amount && foods.length < MAX_FOOD; index += 1) {
    const jitter = randomDirection().multiplyScalar(random(0, amount > 1 ? 1.8 : 0.2));
    const point = position.clone().add(jitter);
    if (point.length() > WORLD_RADIUS * 0.94) point.setLength(WORLD_RADIUS * 0.94);
    foods.push(point);
  }
}

function syncFoodGeometry() {
  const positions = new Float32Array(foods.length * 3);
  foods.forEach((food, index) => {
    positions[index * 3] = food.x;
    positions[index * 3 + 1] = food.y;
    positions[index * 3 + 2] = food.z;
  });
  foodGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  foodGeometry.computeBoundingSphere();
}

function nearestFood(creature) {
  let bestIndex = -1;
  let bestDistanceSq = creature.genes.sense * creature.genes.sense;

  for (let index = 0; index < foods.length; index += 1) {
    const distanceSq = creature.position.distanceToSquared(foods[index]);
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function updateCreature(creature, delta) {
  creature.age += delta;
  const targetIndex = nearestFood(creature);
  const desired = new THREE.Vector3();

  if (targetIndex >= 0) {
    desired.copy(foods[targetIndex]).sub(creature.position).normalize();
  } else {
    creature.wander.add(randomDirection().multiplyScalar(delta * 0.45)).normalize();
    desired.copy(creature.wander);
  }

  desired.multiplyScalar(creature.genes.speed);
  creature.velocity.lerp(desired, clamp(delta * 1.8, 0, 0.2));
  creature.position.addScaledVector(creature.velocity, delta);

  const distanceFromCenter = creature.position.length();
  if (distanceFromCenter > WORLD_RADIUS * 0.94) {
    const normal = creature.position.clone().normalize();
    creature.position.setLength(WORLD_RADIUS * 0.93);
    creature.velocity.reflect(normal).multiplyScalar(0.82);
  }

  if (targetIndex >= 0 && foods[targetIndex]) {
    const eatingRadius = 0.55 + creature.genes.size * 0.5;
    if (creature.position.distanceToSquared(foods[targetIndex]) < eatingRadius * eatingRadius) {
      foods.splice(targetIndex, 1);
      creature.energy = Math.min(190, creature.energy + 27);
    }
  }

  const metabolism = 0.7
    + creature.genes.speed * creature.genes.speed * 0.085
    + creature.genes.sense * 0.025
    + creature.genes.size * creature.genes.size * 0.13;
  creature.energy -= metabolism * delta;

  const pulse = 0.94 + Math.sin(elapsed * 3 + creature.age) * 0.035;
  creature.mesh.scale.setScalar((0.52 + creature.genes.size * 0.44) * pulse);
  creature.mesh.rotation.x += delta * 0.4;
  creature.mesh.rotation.y += delta * 0.65;

  if (
    creature.energy > 142
    && creature.age > 7
    && creatures.length < MAX_CREATURES
    && Math.random() < delta * 0.34
  ) {
    creature.energy *= 0.56;
    const child = makeCreature(creature);
    creatures.push(child);
    births += 1;
  }
}

function updateSimulation(delta) {
  const timeScale = Number(timeScaleInput.value);
  const scaledDelta = Math.min(delta * timeScale, 0.08);
  elapsed += scaledDelta;

  foodAccumulator += scaledDelta * Number(foodRateInput.value);
  while (foodAccumulator >= 1) {
    addFood();
    foodAccumulator -= 1;
  }

  for (let index = creatures.length - 1; index >= 0; index -= 1) {
    const creature = creatures[index];
    updateCreature(creature, scaledDelta);
    if (creature.energy <= 0 || creature.age > 150) removeCreature(index);
  }

  if (creatures.length === 0 && elapsed > 2) {
    for (let index = 0; index < 8; index += 1) creatures.push(makeCreature(null, true));
  }

  sampleAccumulator += scaledDelta;
  if (sampleAccumulator >= 1) {
    sampleAccumulator = 0;
    const summary = summarizePopulation(creatures, { births, deaths });
    history.push({ population: summary.population, diversity: summary.diversity });
    history = history.slice(-120);
  }

  syncFoodGeometry();
}

function updateCamera() {
  const cosPitch = Math.cos(cameraPitch);
  camera.position.set(
    Math.sin(cameraYaw) * cosPitch * cameraDistance,
    Math.sin(cameraPitch) * cameraDistance,
    Math.cos(cameraYaw) * cosPitch * cameraDistance
  );
  camera.lookAt(0, 0, 0);
}

function resize() {
  const width = Math.max(320, worldEl.clientWidth);
  const height = Math.max(360, worldEl.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  drawChart();
}

function updateOutputs() {
  foodOutput.value = foodRateInput.value;
  mutationOutput.value = `${mutationInput.value}%`;
  timeOutput.value = `${Number(timeScaleInput.value).toFixed(Number(timeScaleInput.value) % 1 ? 2 : 0)}×`;
}

function updateDashboard() {
  const summary = summarizePopulation(creatures, { births, deaths });
  populationEl.textContent = String(summary.population);
  generationEl.textContent = String(summary.generation);
  diversityEl.textContent = `${Math.round(summary.diversity * 100)}%`;
  survivalEl.textContent = `${Math.round(summary.survivalRate * 100)}%`;
  meanSpeedEl.textContent = summary.meanSpeed.toFixed(2);
  meanSenseEl.textContent = summary.meanSense.toFixed(1);
  meanSizeEl.textContent = summary.meanSize.toFixed(2);
  birthDeathEl.textContent = `${summary.births} / ${summary.deaths}`;
  scienceNoteEl.textContent = selectionNarrative(summary);
}

function drawChart() {
  const cssWidth = chart.clientWidth || 320;
  const cssHeight = chart.clientHeight || 190;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  chart.width = Math.floor(cssWidth * dpr);
  chart.height = Math.floor(cssHeight * dpr);
  chartContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  chartContext.clearRect(0, 0, cssWidth, cssHeight);

  const styles = getComputedStyle(document.documentElement);
  const populationColor = styles.getPropertyValue('--accent').trim() || '#7df9c8';
  const diversityColor = styles.getPropertyValue('--accent-2').trim() || '#9db8ff';
  const mutedColor = styles.getPropertyValue('--muted').trim() || '#9fb7ae';
  const padding = 20;
  const width = cssWidth - padding * 2;
  const height = cssHeight - padding * 2;
  const maxPopulation = Math.max(20, ...history.map((point) => point.population));

  chartContext.strokeStyle = 'rgba(255,255,255,.08)';
  chartContext.lineWidth = 1;
  for (let row = 0; row <= 4; row += 1) {
    const y = padding + (height * row) / 4;
    chartContext.beginPath();
    chartContext.moveTo(padding, y);
    chartContext.lineTo(cssWidth - padding, y);
    chartContext.stroke();
  }

  const drawLine = (selector, maxValue, color) => {
    if (history.length < 2) return;
    chartContext.strokeStyle = color;
    chartContext.lineWidth = 2;
    chartContext.beginPath();
    history.forEach((point, index) => {
      const x = padding + (index / Math.max(1, history.length - 1)) * width;
      const y = padding + height - (selector(point) / maxValue) * height;
      if (index === 0) chartContext.moveTo(x, y);
      else chartContext.lineTo(x, y);
    });
    chartContext.stroke();
  };

  drawLine((point) => point.population, maxPopulation, populationColor);
  drawLine((point) => point.diversity, 1, diversityColor);

  chartContext.font = '11px system-ui';
  chartContext.fillStyle = populationColor;
  chartContext.fillText('population', padding, 14);
  chartContext.fillStyle = diversityColor;
  chartContext.fillText('diversity', padding + 72, 14);
  chartContext.fillStyle = mutedColor;
  chartContext.textAlign = 'right';
  chartContext.fillText(`max pop ${maxPopulation}`, cssWidth - padding, 14);
  chartContext.textAlign = 'left';
}

function dailyExperiment() {
  const dateKey = new Date().toISOString().slice(0, 10);
  const seed = [...dateKey].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const experiments = [
    {
      name: 'Scarcity selects for efficiency',
      hypothesis: 'With less food, costly speed and large bodies should become harder to sustain.',
      food: 5,
      mutation: 8,
      time: 1.5,
    },
    {
      name: 'Mutation storm',
      hypothesis: 'High mutation should increase diversity quickly, but may reduce short-term stability.',
      food: 9,
      mutation: 24,
      time: 1.25,
    },
    {
      name: 'Garden of abundance',
      hypothesis: 'Plentiful food should support more trait combinations and a larger population.',
      food: 16,
      mutation: 7,
      time: 1,
    },
  ];
  return experiments[seed % experiments.length];
}

function resetSelectionPanel() {
  selectedNameEl.textContent = 'Tap a creature in the universe';
  selectedStateEl.textContent = 'No selection';
  selectedStateEl.className = 'state-pill';
  selectedNoteEl.textContent = 'Every birth is archived with parent, genes, generation, birth time, and birth position. Select a creature to inspect the record.';
  selectedGenerationEl.textContent = '—';
  selectedShareEl.textContent = '—';
  selectedDescendantsEl.textContent = '—';
  selectedMutationEl.textContent = '—';
  selectedSpeedEl.textContent = '—';
  selectedSenseEl.textContent = '—';
  selectedSizeEl.textContent = '—';
  selectedAgeEl.textContent = '—';
  replayStatusEl.textContent = 'Replay turns the family archive into a time-compressed 3D ancestry map.';
  ancestryListEl.replaceChildren();
  const item = document.createElement('li');
  item.textContent = 'Select a living creature to reveal its parents and mutations.';
  ancestryListEl.append(item);
  replayButton.disabled = true;
  clearSelectionButton.disabled = true;
  renderedAncestryFor = null;
}

function refreshCreatureHighlight() {
  const selected = selectedCreatureId ? lineageArchive.get(selectedCreatureId) : null;
  creatures.forEach((creature) => {
    const sameFamily = selected && creature.lineage === selected.lineage;
    creature.mesh.material.emissiveIntensity = creature.id === selectedCreatureId ? 5.4 : sameFamily ? 2.2 : 0.9;
  });
}

function lineageNarrative(record, liveCreature, summary, descendantCount) {
  const status = liveCreature ? `alive with ${liveCreature.energy.toFixed(0)} energy` : 'preserved in the archive after death';
  let familyStatus = `${summary.living} of ${summary.born} recorded family members are alive`;
  if (summary.share >= 0.5) familyStatus = `this family controls ${Math.round(summary.share * 100)}% of the living universe`;
  else if (summary.share >= 0.25) familyStatus = `this family is a major clade at ${Math.round(summary.share * 100)}% of the living universe`;
  return `Creature ${shortId(record.id)} is ${status}; ${familyStatus}. It has ${descendantCount} recorded descendants and the family has reached generation ${summary.maxGeneration}.`;
}

function renderAncestry(record) {
  const chain = ancestorChain(lineageArchive, record.id, 9);
  ancestryListEl.replaceChildren();

  chain.forEach((ancestor, index) => {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = index === 0
      ? `G${ancestor.generation} · ${shortId(ancestor.id)} (selected)`
      : `G${ancestor.generation} · ${shortId(ancestor.id)}`;
    item.append(label);

    const detail = document.createElement('span');
    const parent = ancestor.parentId ? lineageArchive.get(ancestor.parentId) : null;
    const mutation = parent ? geneDistance(ancestor.genes, parent.genes).toFixed(2) : 'founder';
    detail.textContent = ` — speed ${ancestor.genes.speed.toFixed(2)}, sense ${ancestor.genes.sense.toFixed(1)}, size ${ancestor.genes.size.toFixed(2)}, mutation ${mutation}`;
    item.append(detail);
    ancestryListEl.append(item);
  });

  renderedAncestryFor = record.id;
}

function updateLineagePanel(force = false) {
  if (!selectedCreatureId) return;
  const record = lineageArchive.get(selectedCreatureId);
  if (!record) {
    selectedCreatureId = null;
    resetSelectionPanel();
    refreshCreatureHighlight();
    return;
  }

  const liveCreature = liveCreatureById(record.id);
  const livingIds = new Set(creatures.map((creature) => creature.id));
  const family = summarizeLineage(lineageArchive, livingIds, record.lineage);
  const descendantCount = descendantsOf(lineageArchive, record.id).length;
  const parent = record.parentId ? lineageArchive.get(record.parentId) : null;
  const mutationDistance = parent ? geneDistance(record.genes, parent.genes) : 0;
  const lifespan = liveCreature
    ? liveCreature.age
    : Math.max(0, Number(record.deathTime ?? elapsed) - record.birthTime);

  selectedNameEl.textContent = `Creature ${shortId(record.id)}`;
  selectedStateEl.textContent = liveCreature ? 'Alive' : 'Archived';
  selectedStateEl.className = `state-pill ${liveCreature ? 'alive' : 'dead'}`;
  selectedNoteEl.textContent = lineageNarrative(record, liveCreature, family, descendantCount);
  selectedGenerationEl.textContent = `G${record.generation}`;
  selectedShareEl.textContent = `${Math.round(family.share * 100)}%`;
  selectedDescendantsEl.textContent = String(descendantCount);
  selectedMutationEl.textContent = parent ? mutationDistance.toFixed(2) : 'Founder';
  selectedSpeedEl.textContent = record.genes.speed.toFixed(2);
  selectedSenseEl.textContent = record.genes.sense.toFixed(1);
  selectedSizeEl.textContent = record.genes.size.toFixed(2);
  selectedAgeEl.textContent = liveCreature ? `${lifespan.toFixed(1)}s alive` : `${lifespan.toFixed(1)}s total`;
  replayButton.disabled = false;
  clearSelectionButton.disabled = false;

  if (force || renderedAncestryFor !== record.id) renderAncestry(record);
}

function selectCreature(creature) {
  if (!creature) return;
  if (replay) stopLineageReplay();
  selectedCreatureId = creature.id;
  refreshCreatureHighlight();
  updateLineagePanel(true);
}

function clearReplayGroup() {
  replayGroup.children.slice().forEach((child) => {
    replayGroup.remove(child);
    if (child.geometry && child.geometry !== replayGeometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
}

function birthVector(record) {
  return new THREE.Vector3(record.birthPosition.x, record.birthPosition.y, record.birthPosition.z);
}

function startLineageReplay() {
  const selected = selectedCreatureId ? lineageArchive.get(selectedCreatureId) : null;
  if (!selected) return;

  if (replay) {
    stopLineageReplay();
    return;
  }

  const family = [...lineageArchive.values()]
    .filter((record) => record.lineage === selected.lineage)
    .sort((a, b) => a.birthTime - b.birthTime);

  if (!family.length) return;

  const familyLookup = new Map(family.map((record) => [record.id, record]));
  const nodes = family.map((record) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(record.genes.hue, 0.82, 0.65),
      transparent: true,
      opacity: 0.04,
    });
    const node = new THREE.Mesh(replayGeometry, material);
    node.position.copy(birthVector(record));
    node.visible = false;
    node.userData.record = record;
    replayGroup.add(node);
    return node;
  });

  const lines = family
    .filter((record) => record.parentId && familyLookup.has(record.parentId))
    .map((record) => {
      const parent = familyLookup.get(record.parentId);
      const geometry = new THREE.BufferGeometry().setFromPoints([birthVector(parent), birthVector(record)]);
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color().setHSL(record.genes.hue, 0.6, 0.55),
        transparent: true,
        opacity: 0.2,
      });
      const line = new THREE.Line(geometry, material);
      line.visible = false;
      line.userData.birthTime = record.birthTime;
      replayGroup.add(line);
      return line;
    });

  const minTime = family[0].birthTime;
  const maxTime = Math.max(elapsed, ...family.map((record) => record.deathTime ?? record.birthTime));
  replay = {
    family,
    nodes,
    lines,
    startAt: performance.now(),
    duration: clamp(family.length * 180, 6500, 14000),
    minTime,
    maxTime: Math.max(minTime + 1, maxTime),
    wasPaused: paused,
  };

  paused = true;
  pauseButton.disabled = true;
  creatures.forEach((creature) => {
    creature.mesh.visible = false;
  });
  foodPoints.visible = false;
  boundary.material.opacity = 0.025;
  replayButton.textContent = 'Exit replay';
  replayStatusEl.textContent = `Replaying ${family.length} recorded births from family ${shortId(selected.lineage)}.`;
}

function stopLineageReplay() {
  if (!replay) return;
  const wasPaused = replay.wasPaused;
  clearReplayGroup();
  replay = null;
  creatures.forEach((creature) => {
    creature.mesh.visible = true;
  });
  foodPoints.visible = true;
  boundary.material.opacity = 0.055;
  paused = wasPaused;
  pauseButton.disabled = false;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  replayButton.textContent = 'Replay family';
  replayStatusEl.textContent = 'Replay turns the family archive into a time-compressed 3D ancestry map.';
  refreshCreatureHighlight();
}

function updateLineageReplay(now) {
  if (!replay) return;
  const progress = clamp((now - replay.startAt) / replay.duration, 0, 1);
  const simulatedTime = replay.minTime + (replay.maxTime - replay.minTime) * progress;
  let visible = 0;
  let maxGeneration = 0;

  replay.nodes.forEach((node) => {
    const record = node.userData.record;
    node.visible = record.birthTime <= simulatedTime;
    if (!node.visible) return;
    visible += 1;
    maxGeneration = Math.max(maxGeneration, record.generation);
    const aliveAtTime = record.deathTime == null || record.deathTime > simulatedTime;
    node.material.opacity = aliveAtTime ? 0.92 : 0.13;
    const selectedScale = record.id === selectedCreatureId ? 2.4 : 1;
    const generationScale = 1 + Math.min(record.generation, 12) * 0.045;
    node.scale.setScalar(selectedScale * generationScale);
  });

  replay.lines.forEach((line) => {
    line.visible = line.userData.birthTime <= simulatedTime;
  });

  replayStatusEl.textContent = progress < 1
    ? `Replay ${Math.round(progress * 100)}% · ${visible}/${replay.family.length} births visible · generation ${maxGeneration}`
    : `Replay complete · ${replay.family.length} births · family reached generation ${maxGeneration}. Exit replay to return to the live universe.`;
}

function resetUniverse(useDailyPreset = true) {
  if (replay) stopLineageReplay();
  creatures.forEach((creature) => {
    scene.remove(creature.mesh);
    creature.mesh.material.dispose();
  });
  creatures = [];
  foods = [];
  lineageArchive.clear();
  selectedCreatureId = null;
  births = 0;
  deaths = 0;
  elapsed = 0;
  foodAccumulator = 0;
  sampleAccumulator = 0;
  history = [];
  resetSelectionPanel();

  if (useDailyPreset) {
    const experiment = dailyExperiment();
    experimentName.textContent = experiment.name;
    experimentHypothesis.textContent = experiment.hypothesis;
    foodRateInput.value = String(experiment.food);
    mutationInput.value = String(experiment.mutation);
    timeScaleInput.value = String(experiment.time);
  }

  for (let index = 0; index < 26; index += 1) creatures.push(makeCreature());
  for (let index = 0; index < 115; index += 1) addFood();
  syncFoodGeometry();
  updateOutputs();
  updateDashboard();
  drawChart();
}

function injectChaos() {
  for (let index = 0; index < 12 && creatures.length < MAX_CREATURES; index += 1) {
    creatures.push(makeCreature(null, true));
  }
  mutationInput.value = String(Math.max(18, Number(mutationInput.value)));
  updateOutputs();
}

function pointerToWorld(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerVector.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerVector.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerVector, camera);
}

function creatureFromPointer(event) {
  pointerToWorld(event);
  const intersections = raycaster.intersectObjects(creatures.map((creature) => creature.mesh), false);
  if (!intersections.length) return null;
  return liveCreatureById(intersections[0].object.userData.creatureId);
}

function seedFoodFromPointer(event) {
  pointerToWorld(event);
  const point = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(seedPlane, point)) {
    if (point.length() > WORLD_RADIUS * 0.82) point.setLength(WORLD_RADIUS * 0.82);
    addFood(point, 18);
    syncFoodGeometry();
  }
}

function handleWorldTap(event) {
  if (replay) return;
  const creature = creatureFromPointer(event);
  if (creature) {
    selectCreature(creature);
    return;
  }
  seedFoodFromPointer(event);
}

function pointerDistance() {
  const values = [...pointerState.values()];
  if (values.length < 2) return 0;
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  renderer.domElement.setPointerCapture(event.pointerId);
  pointerState.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
  dragDistance = 0;
  if (pointerState.size === 2) pinchStart = { distance: pointerDistance(), cameraDistance };
});

renderer.domElement.addEventListener('pointermove', (event) => {
  const pointer = pointerState.get(event.pointerId);
  if (!pointer) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  dragDistance += Math.abs(dx) + Math.abs(dy);

  if (pointerState.size >= 2 && pinchStart) {
    const distance = pointerDistance();
    if (distance > 10) cameraDistance = clamp(pinchStart.cameraDistance * (pinchStart.distance / distance), 22, 68);
    return;
  }

  cameraYaw -= dx * 0.006;
  cameraPitch = clamp(cameraPitch + dy * 0.005, -1.1, 1.1);
});

renderer.domElement.addEventListener('pointerup', (event) => {
  const pointer = pointerState.get(event.pointerId);
  if (pointer && pointerState.size === 1 && dragDistance < 8) handleWorldTap(event);
  pointerState.delete(event.pointerId);
  if (pointerState.size < 2) pinchStart = null;
});

renderer.domElement.addEventListener('pointercancel', (event) => {
  pointerState.delete(event.pointerId);
  if (pointerState.size < 2) pinchStart = null;
});

renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault();
  cameraDistance = clamp(cameraDistance + event.deltaY * 0.025, 22, 68);
}, { passive: false });

pauseButton.addEventListener('click', () => {
  if (replay) return;
  paused = !paused;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
});

chaosButton.addEventListener('click', () => {
  if (!replay) injectChaos();
});
resetButton.addEventListener('click', () => resetUniverse(false));
replayButton.addEventListener('click', startLineageReplay);
clearSelectionButton.addEventListener('click', () => {
  if (replay) stopLineageReplay();
  selectedCreatureId = null;
  resetSelectionPanel();
  refreshCreatureHighlight();
});
[foodRateInput, mutationInput, timeScaleInput].forEach((input) => input.addEventListener('input', updateOutputs));
window.addEventListener('resize', resize);

function animate(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!paused) updateSimulation(delta);
  if (replay) updateLineageReplay(now);
  updateCamera();
  updateDashboard();
  if (selectedCreatureId && now - lastLineagePanelUpdate > 400) {
    updateLineagePanel(false);
    lastLineagePanelUpdate = now;
  }
  drawChart();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

resetUniverse(true);
resize();
updateCamera();
requestAnimationFrame(animate);
