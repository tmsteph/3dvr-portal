import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import {
  openDatabase,
  loadState,
  saveState,
  exportWorkspace,
  importWorkspace
} from '../life-space/storage.js';
import { createLifeSpaceSync } from '../life-space/sync.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#noteverse-canvas');
const stage = canvas.closest('.stage-wrap');
const spaceSelect = $('#space-select');
const syncStatus = $('#sync-status');
const emptyState = $('#empty-state');
const itemCount = $('#item-count');
const editorTitle = $('#editor-title');
const itemType = $('#item-type');
const titleInput = $('#item-title');
const bodyInput = $('#item-body');
const bodyLabel = $('#body-label');
const deleteButton = $('#delete-item');
const nudgeButtons = [...document.querySelectorAll('[data-nudge]')];
const addForm = $('#add-note');
const newNoteInput = $('#new-note');

const defaultState = () => ({
  version: 1,
  activeSpaceId: 'space-home',
  spaces: [{
    id: 'space-home',
    name: 'My Life',
    color: '#ffb66e',
    view: { x: 0, y: 0, zoom: 1 },
    items: [],
    strokes: []
  }],
  updatedAt: Date.now()
});

let db = null;
let state = defaultState();
let sync = null;
let selectedId = null;
let saveTimer = null;
let labelTimer = null;
let yaw = 0.45;
let pitch = 0.22;
let radius = 15;
let pointerDown = null;
let moved = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b12);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const objectGroup = new THREE.Group();
const connectionGroup = new THREE.Group();
scene.add(objectGroup, connectionGroup);

scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x1d1830, 2.25));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.7);
keyLight.position.set(6, 8, 9);
scene.add(keyLight);
const warmLight = new THREE.PointLight(0xffc86b, 14, 20);
warmLight.position.set(-5, 1, 4);
scene.add(warmLight);

const core = new THREE.Mesh(
  new THREE.SphereGeometry(0.23, 20, 20),
  new THREE.MeshStandardMaterial({ color: 0xfff5bc, emissive: 0x9a6d1f, emissiveIntensity: 1.5 })
);
scene.add(core);

const starsGeometry = new THREE.BufferGeometry();
const starPositions = new Float32Array(320 * 3);
for (let index = 0; index < 320; index += 1) {
  const distance = 11 + Math.random() * 17;
  const angle = Math.random() * Math.PI * 2;
  const height = Math.random() * 2 - 1;
  const flat = Math.sqrt(1 - height * height);
  starPositions[index * 3] = distance * flat * Math.cos(angle);
  starPositions[index * 3 + 1] = distance * height;
  starPositions[index * 3 + 2] = distance * flat * Math.sin(angle);
}
starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(
  starsGeometry,
  new THREE.PointsMaterial({ color: 0xaec8e8, size: 0.045, transparent: true, opacity: 0.55 })
));

const meshById = new Map();
const selectableMeshes = [];

function currentSpace() {
  return state.spaces.find(space => space.id === state.activeSpaceId) || state.spaces[0];
}

function currentItems() {
  return (currentSpace()?.items || []).slice(0, 160);
}

function idHash(value) {
  let hash = 2166136261;
  for (const char of String(value || 'note')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function defaultPosition(item, index) {
  const seed = idHash(item.id) + index * 997;
  const theta = seededUnit(seed) * Math.PI * 2;
  const y = seededUnit(seed + 1) * 7 - 3.5;
  const ring = 2.6 + seededUnit(seed + 2) * 4.8;
  return {
    x: Math.cos(theta) * ring,
    y,
    z: Math.sin(theta) * ring
  };
}

function itemPosition(item, index) {
  const stored = item.noteversePosition;
  if (stored && [stored.x, stored.y, stored.z].every(Number.isFinite)) return stored;
  return defaultPosition(item, index);
}

function normalizedWords(item) {
  const checklist = (item.rows || []).map(row => row.text || '').join(' ');
  const text = `${item.title || ''} ${item.text || ''} ${item.note || ''} ${checklist}`.toLowerCase();
  return new Set(text.match(/[a-z0-9]{4,}/g) || []);
}

function makeGeometry(type) {
  if (type === 'checklist') return new THREE.BoxGeometry(0.9, 0.9, 0.9);
  if (type === 'link') return new THREE.TorusGeometry(0.52, 0.17, 12, 28);
  if (type === 'image') return new THREE.SphereGeometry(0.53, 20, 16);
  if (type === 'file') return new THREE.OctahedronGeometry(0.62, 0);
  return new THREE.IcosahedronGeometry(0.62, 1);
}

function typeColor(type) {
  if (type === 'checklist') return 0xf2b35f;
  if (type === 'link') return 0x7ad1b8;
  if (type === 'image') return 0xe08fd0;
  if (type === 'file') return 0xb69cff;
  return 0x73a9ff;
}

function labelText(item) {
  const title = String(item.title || '').trim();
  if (title) return title.slice(0, 34);
  if (item.type === 'note') return String(item.text || 'Untitled note').trim().slice(0, 34);
  return item.type || 'item';
}

function makeLabel(item) {
  const text = labelText(item);
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 96;
  const context = labelCanvas.getContext('2d');
  context.clearRect(0, 0, 512, 96);
  context.fillStyle = 'rgba(8, 13, 22, .82)';
  context.roundRect(5, 8, 502, 80, 20);
  context.fill();
  context.strokeStyle = 'rgba(154, 184, 222, .34)';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#edf5ff';
  context.font = '600 28px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text || 'Untitled', 256, 49, 460);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(3.5, 0.66, 1);
  sprite.position.y = 1.12;
  sprite.userData.isLabel = true;
  return sprite;
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse?.(node => {
      node.geometry?.dispose?.();
      if (node.material?.map) node.material.map.dispose?.();
      node.material?.dispose?.();
    });
  }
}

function renderConnections(items) {
  clearGroup(connectionGroup);
  const words = items.map(normalizedWords);
  let made = 0;
  for (let left = 0; left < items.length && made < 90; left += 1) {
    for (let right = left + 1; right < items.length && made < 90; right += 1) {
      let shared = 0;
      for (const word of words[left]) {
        if (words[right].has(word)) shared += 1;
        if (shared >= 2) break;
      }
      if (!shared) continue;
      const a = meshById.get(items[left].id);
      const b = meshById.get(items[right].id);
      if (!a || !b) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints([a.position, b.position]);
      const material = new THREE.LineBasicMaterial({
        color: shared > 1 ? 0xffd987 : 0x6685ae,
        transparent: true,
        opacity: shared > 1 ? 0.27 : 0.12
      });
      connectionGroup.add(new THREE.Line(geometry, material));
      made += 1;
    }
  }
}

function renderScene() {
  clearGroup(objectGroup);
  meshById.clear();
  selectableMeshes.length = 0;
  const items = currentItems();

  items.forEach((item, index) => {
    const material = new THREE.MeshStandardMaterial({
      color: typeColor(item.type),
      roughness: 0.32,
      metalness: 0.2,
      transparent: true,
      opacity: item.archived ? 0.34 : 0.94
    });
    const mesh = new THREE.Mesh(makeGeometry(item.type), material);
    const position = itemPosition(item, index);
    mesh.position.set(position.x, position.y, position.z);
    mesh.userData.itemId = item.id;
    mesh.userData.phase = index * 0.73;
    mesh.add(makeLabel(item));
    objectGroup.add(mesh);
    meshById.set(item.id, mesh);
    selectableMeshes.push(mesh);
  });

  renderConnections(items);
  emptyState.hidden = items.length !== 0;
  itemCount.textContent = `${items.length} object${items.length === 1 ? '' : 's'} in this space`;
  refreshSelection();
}

function itemBody(item) {
  if (!item) return '';
  if (item.type === 'checklist') return (item.rows || []).map(row => row.text || '').join('\n');
  if (item.type === 'link') return item.note || item.url || '';
  if (item.type === 'file' || item.type === 'image') return item.name || item.fileName || '';
  return item.text || '';
}

function selectedItem() {
  return currentSpace()?.items?.find(item => item.id === selectedId) || null;
}

function refreshSelection() {
  const item = selectedItem();
  for (const [id, mesh] of meshById) mesh.scale.setScalar(id === selectedId ? 1.28 : 1);
  if (!item) {
    selectedId = null;
    editorTitle.textContent = 'Choose a crystal';
    itemType.textContent = '—';
    titleInput.value = '';
    bodyInput.value = '';
    titleInput.disabled = true;
    bodyInput.disabled = true;
    deleteButton.disabled = true;
    nudgeButtons.forEach(button => { button.disabled = true; });
    return;
  }

  editorTitle.textContent = labelText(item) || 'Untitled';
  itemType.textContent = item.type || 'note';
  bodyLabel.textContent = item.type === 'checklist' ? 'One task per line' : item.type === 'link' ? 'Link note' : 'Note';
  titleInput.value = item.title || '';
  bodyInput.value = itemBody(item);
  titleInput.disabled = false;
  bodyInput.disabled = item.type === 'file' || item.type === 'image';
  deleteButton.disabled = false;
  nudgeButtons.forEach(button => { button.disabled = false; });
}

function populateSpaces() {
  spaceSelect.innerHTML = '';
  for (const space of state.spaces || []) {
    const option = document.createElement('option');
    option.value = space.id;
    option.textContent = space.name || 'Untitled space';
    option.selected = space.id === state.activeSpaceId;
    spaceSelect.append(option);
  }
}

async function persistNow() {
  state.updatedAt = Date.now();
  const space = currentSpace();
  if (space) space.updatedAt = Date.now();
  await saveState(db, state);
  try {
    const payload = await exportWorkspace(db, state);
    sync?.save(payload);
  } catch {
    syncStatus.textContent = 'Saved on this device';
  }
}

function saveSoon({ relabel = false } = {}) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persistNow, 350);
  if (relabel) {
    window.clearTimeout(labelTimer);
    labelTimer = window.setTimeout(renderScene, 450);
  }
}

function randomPosition() {
  const theta = Math.random() * Math.PI * 2;
  const y = Math.random() * 6 - 3;
  const ring = 2.7 + Math.random() * 4.6;
  return { x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring };
}

function addNote(text) {
  const space = currentSpace();
  if (!space) return;
  const id = `note-${crypto.randomUUID()}`;
  const offset = (space.items.length % 8) * 24;
  const item = {
    id,
    type: 'note',
    title: '',
    text,
    x: 40 + offset,
    y: 40 + offset,
    w: 300,
    h: 220,
    color: '#fff3c9',
    z: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    noteversePosition: randomPosition()
  };
  space.items.push(item);
  selectedId = id;
  renderScene();
  saveSoon();
}

function deleteSelected() {
  const space = currentSpace();
  if (!space || !selectedId) return;
  const index = space.items.findIndex(item => item.id === selectedId);
  if (index < 0) return;
  space.deletedItemIds = [...new Set([...(space.deletedItemIds || []), selectedId])];
  space.items.splice(index, 1);
  selectedId = null;
  renderScene();
  saveSoon();
}

function updateCamera() {
  pitch = Math.max(-1.18, Math.min(1.18, pitch));
  radius = Math.max(5.5, Math.min(28, radius));
  camera.position.set(
    radius * Math.cos(pitch) * Math.sin(yaw),
    radius * Math.sin(pitch),
    radius * Math.cos(pitch) * Math.cos(yaw)
  );
  camera.lookAt(0, 0, 0);
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(selectableMeshes, false)[0];
  selectedId = hit?.object?.userData?.itemId || null;
  refreshSelection();
}

spaceSelect.addEventListener('change', () => {
  state.activeSpaceId = spaceSelect.value;
  selectedId = null;
  renderScene();
  saveSoon();
});

$('#center').addEventListener('click', () => {
  yaw = 0.45;
  pitch = 0.22;
  radius = 15;
  updateCamera();
});

$('#remix').addEventListener('click', () => {
  const space = currentSpace();
  if (!space) return;
  for (const item of space.items || []) {
    item.noteversePosition = randomPosition();
    item.updatedAt = Date.now();
  }
  renderScene();
  saveSoon();
});

addForm.addEventListener('submit', event => {
  event.preventDefault();
  const text = newNoteInput.value.trim();
  if (!text) return newNoteInput.focus();
  addNote(text);
  newNoteInput.value = '';
});

titleInput.addEventListener('input', () => {
  const item = selectedItem();
  if (!item) return;
  item.title = titleInput.value;
  item.updatedAt = Date.now();
  editorTitle.textContent = labelText(item) || 'Untitled';
  saveSoon({ relabel: true });
});

bodyInput.addEventListener('input', () => {
  const item = selectedItem();
  if (!item) return;
  if (item.type === 'checklist') {
    const previous = item.rows || [];
    item.rows = bodyInput.value.split('\n').map((text, index) => ({
      id: previous[index]?.id || `row-${crypto.randomUUID()}`,
      text,
      done: previous[index]?.done || false
    }));
  } else if (item.type === 'link') {
    item.note = bodyInput.value;
  } else if (item.type === 'note') {
    item.text = bodyInput.value;
  }
  item.updatedAt = Date.now();
  saveSoon({ relabel: true });
});

deleteButton.addEventListener('click', deleteSelected);

nudgeButtons.forEach(button => button.addEventListener('click', () => {
  const item = selectedItem();
  if (!item) return;
  const [axis, direction] = button.dataset.nudge.split(':');
  const position = { ...itemPosition(item, 0) };
  position[axis] += Number(direction) * 0.65;
  item.noteversePosition = position;
  item.updatedAt = Date.now();
  const mesh = meshById.get(item.id);
  mesh?.position.set(position.x, position.y, position.z);
  renderConnections(currentItems());
  saveSoon();
}));

canvas.addEventListener('pointerdown', event => {
  pointerDown = { x: event.clientX, y: event.clientY };
  moved = false;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  if (!pointerDown) return;
  const dx = event.clientX - pointerDown.x;
  const dy = event.clientY - pointerDown.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
  yaw -= dx * 0.007;
  pitch += dy * 0.007;
  pointerDown = { x: event.clientX, y: event.clientY };
  updateCamera();
});

canvas.addEventListener('pointerup', event => {
  if (!moved) pick(event.clientX, event.clientY);
  pointerDown = null;
});
canvas.addEventListener('pointercancel', () => { pointerDown = null; });
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  radius += Math.sign(event.deltaY) * 0.85;
  updateCamera();
}, { passive: false });

async function initialize() {
  updateCamera();
  resize();
  db = await openDatabase();
  state = await loadState(db) || defaultState();
  if (!Array.isArray(state.spaces) || !state.spaces.length) state = defaultState();

  sync = createLifeSpaceSync({
    onStatus(message) { syncStatus.textContent = message; }
  });

  try {
    const localPayload = await exportWorkspace(db, state);
    const merged = await sync.load(localPayload);
    if (merged?.state) {
      state = merged.state;
      try { await importWorkspace(db, merged); }
      catch { await saveState(db, state); }
    }
  } catch {
    syncStatus.textContent = 'Saved on this device · account sync unavailable';
  }

  populateSpaces();
  renderScene();
}

new ResizeObserver(resize).observe(stage);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function animate(time) {
  if (!reduceMotion) {
    for (const mesh of selectableMeshes) {
      mesh.rotation.x += 0.0013;
      mesh.rotation.y += 0.0021;
      const base = itemPosition(selectedItem()?.id === mesh.userData.itemId ? selectedItem() : currentItems().find(item => item.id === mesh.userData.itemId), 0);
      if (base) mesh.position.y += (base.y + Math.sin(time * 0.00075 + mesh.userData.phase) * 0.055 - mesh.position.y) * 0.06;
    }
    core.scale.setScalar(1 + Math.sin(time * 0.0024) * 0.08);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

initialize();
requestAnimationFrame(animate);
