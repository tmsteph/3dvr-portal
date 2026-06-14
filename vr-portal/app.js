import {
  STORAGE_KEY,
  createInitialPortalState,
  deletePortalRecord,
  filterPortalRecords,
  flattenRecordForGun,
  getAppById,
  getAppSummary,
  getRecordById,
  normalizePortalState,
  upsertPortalRecord
} from './data.js';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const state = loadState();
const elements = {
  canvas: document.getElementById('spatial-canvas'),
  dock: document.getElementById('app-dock'),
  appType: document.getElementById('app-type'),
  appTitle: document.getElementById('app-title'),
  appDescription: document.getElementById('app-description'),
  recordTotal: document.getElementById('record-total'),
  recordNext: document.getElementById('record-next'),
  recordSearch: document.getElementById('record-search'),
  recordList: document.getElementById('record-list'),
  recordForm: document.getElementById('record-form'),
  editorFields: document.getElementById('editor-fields'),
  newRecord: document.getElementById('new-record'),
  deleteRecord: document.getElementById('delete-record'),
  appFrame: document.getElementById('app-frame'),
  appFrameLabel: document.getElementById('app-frame-label'),
  openAppLink: document.getElementById('open-app-link'),
  xrButton: document.getElementById('xr-button')
};

let currentTab = 'data';
let syncReady = false;
let portalRoot = null;
let sceneApi = null;

document.body.dataset.deviceMode = 'headset';
render();
bootGunSync();
bootSpatialScene();
bindEvents();

function bindEvents() {
  elements.recordSearch.addEventListener('input', renderRecords);

  elements.newRecord.addEventListener('click', () => {
    const app = getAppById(state, state.selectedAppId);
    state.selectedRecordId = '';
    renderEditor(app, null);
  });

  elements.deleteRecord.addEventListener('click', () => {
    const app = getAppById(state, state.selectedAppId);
    const record = getRecordById(app, state.selectedRecordId);
    if (!app || !record) {
      return;
    }
    deletePortalRecord(state, app.id, record.id);
    saveState();
    syncDelete(app.id, record.id);
    render();
  });

  elements.recordForm.addEventListener('submit', event => {
    event.preventDefault();
    const app = getAppById(state, state.selectedAppId);
    if (!app) {
      return;
    }
    const formData = new FormData(elements.recordForm);
    const values = Object.fromEntries(formData.entries());
    try {
      upsertPortalRecord(state, app.id, values);
      const record = getRecordById(app, state.selectedRecordId);
      saveState();
      syncRecord(app.id, record);
      render();
    } catch (error) {
      elements.editorFields.querySelector('[name="title"]')?.focus();
    }
  });

  document.querySelectorAll('[data-device-mode]').forEach(button => {
    button.addEventListener('click', () => {
      const mode = button.dataset.deviceMode;
      document.body.dataset.deviceMode = mode;
      document.querySelectorAll('[data-device-mode]').forEach(item => {
        item.classList.toggle('is-active', item === button);
      });
      if (mode === 'flat') {
        state.viewMode = 'flat';
      } else {
        state.viewMode = 'spatial';
      }
      saveState();
      sceneApi?.resize();
    });
  });

  document.querySelectorAll('[data-panel-tab]').forEach(button => {
    button.addEventListener('click', () => {
      currentTab = button.dataset.panelTab;
      document.querySelectorAll('[data-panel-tab]').forEach(tab => {
        const selected = tab === button;
        tab.classList.toggle('is-active', selected);
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      document.querySelectorAll('[data-panel-view]').forEach(view => {
        view.hidden = view.dataset.panelView !== currentTab;
      });
      if (currentTab === 'app') {
        renderAppFrame();
      }
    });
  });

  elements.xrButton.addEventListener('click', async () => {
    if (!navigator.xr || typeof navigator.xr.isSessionSupported !== 'function') {
      elements.xrButton.textContent = 'XR off';
      return;
    }
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    elements.xrButton.textContent = supported ? 'XR ready' : 'XR off';
  });
}

function render() {
  renderDock();
  renderAppPanel();
  renderRecords();
  renderAppFrame();
  sceneApi?.setActiveApp(state.selectedAppId);
}

function renderDock() {
  elements.dock.replaceChildren(...state.apps.map((app, index) => {
    const summary = getAppSummary(app);
    const button = document.createElement('button');
    const active = app.id === state.selectedAppId;
    button.type = 'button';
    button.className = `app-tile${active ? ' is-active' : ''}`;
    button.style.setProperty('--tile-accent', app.accent);
    button.style.setProperty('--tile-x', `${(index - 2) * 6.5}rem`);
    button.style.setProperty('--tile-y', `${index % 2 === 0 ? -4 : 3.5}rem`);
    button.style.setProperty('--tile-z', `${-80 - (index % 3) * 48}px`);
    button.style.setProperty('--tile-rotate', `${index < 2 ? 12 : index > 2 ? -12 : 0}deg`);
    button.innerHTML = `
      <span class="app-tile__name">${escapeHtml(app.name)}</span>
      <span class="app-tile__meta">${escapeHtml(app.type)}</span>
      <span class="app-tile__count">${summary.total} records</span>
    `;
    button.addEventListener('click', () => {
      state.selectedAppId = app.id;
      state.selectedRecordId = app.records[0]?.id || '';
      saveState();
      render();
    });
    return button;
  }));
}

function renderAppPanel() {
  const app = getAppById(state, state.selectedAppId);
  const record = getRecordById(app, state.selectedRecordId);
  const summary = getAppSummary(app);
  elements.appType.textContent = app.type;
  elements.appTitle.textContent = app.name;
  elements.appDescription.textContent = app.description;
  elements.recordTotal.textContent = summary.total;
  elements.recordNext.textContent = summary.nextDue || 'None';
  renderEditor(app, record);
}

function renderRecords() {
  const app = getAppById(state, state.selectedAppId);
  const records = filterPortalRecords(app, elements.recordSearch.value);
  elements.recordList.replaceChildren(...records.map(record => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `record-button${record.id === state.selectedRecordId ? ' is-active' : ''}`;
    button.style.setProperty('--active-accent', app.accent);
    button.innerHTML = `
      <span class="record-button__title">${escapeHtml(record.title)}</span>
      <span class="record-button__meta">${escapeHtml([record.stage, record.owner, record.due].filter(Boolean).join(' / '))}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedRecordId = record.id;
      saveState();
      renderRecords();
      renderEditor(app, record);
    });
    return button;
  }));
}

function renderEditor(app, record) {
  elements.recordForm.reset();
  elements.recordForm.elements.id.value = record?.id || '';
  elements.deleteRecord.disabled = !record;
  elements.editorFields.replaceChildren(...app.fields.map(field => createField(field, record)));
}

function createField(field, record) {
  const label = document.createElement('label');
  label.className = 'field';
  const text = document.createElement('span');
  text.textContent = field.label;
  label.append(text);

  const value = record?.[field.name] || '';
  let input;
  if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 5;
    input.value = value;
  } else if (field.type === 'select') {
    input = document.createElement('select');
    field.options.forEach(option => {
      const optionEl = document.createElement('option');
      optionEl.value = option;
      optionEl.textContent = option;
      input.append(optionEl);
    });
    input.value = value || field.options[0] || '';
  } else {
    input = document.createElement('input');
    input.type = field.type || 'text';
    input.value = value;
  }

  input.name = field.name;
  input.required = !!field.required;
  label.append(input);
  return label;
}

function renderAppFrame() {
  const app = getAppById(state, state.selectedAppId);
  if (!app) {
    return;
  }
  elements.appFrameLabel.textContent = `${app.name} app`;
  elements.openAppLink.href = app.path;
  if (currentTab === 'app' && elements.appFrame.getAttribute('src') !== app.path) {
    elements.appFrame.src = app.path;
  }
}

function bootGunSync() {
  if (typeof Gun !== 'function') {
    return;
  }
  const peers = window.__GUN_PEERS__ || ['wss://relay.3dvr.tech/gun', 'wss://gun-relay-3dvr.fly.dev/gun'];
  const gun = Gun(peers);
  portalRoot = gun.get('3dvr-portal').get('spatialPortal').get('apps');
  syncReady = true;
  state.apps.forEach(app => {
    const recordsNode = portalRoot.get(app.id).get('records');
    recordsNode.map().on((value, key) => {
      if (!value || key === '_' || !syncReady) {
        return;
      }
      if (value.deleted) {
        deletePortalRecord(state, app.id, key);
      } else {
        upsertPortalRecord(state, app.id, { ...value, id: key }, { select: false });
      }
      saveState(false);
      render();
    });
    app.records.forEach(record => syncRecord(app.id, record));
  });
}

function syncRecord(appId, record) {
  if (!portalRoot || !record) {
    return;
  }
  portalRoot.get(appId).get('records').get(record.id).put(flattenRecordForGun(record));
}

function syncDelete(appId, recordId) {
  if (!portalRoot || !recordId) {
    return;
  }
  portalRoot.get(appId).get('records').get(recordId).put({
    id: recordId,
    deleted: true,
    updatedAt: new Date().toISOString()
  });
}

function bootSpatialScene() {
  const renderer = new THREE.WebGLRenderer({
    canvas: elements.canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0.4, 6.8);

  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const keyLight = new THREE.PointLight(0x8be9fd, 60, 16);
  keyLight.position.set(2, 3, 4);
  scene.add(keyLight);

  const grid = new THREE.GridHelper(18, 18, 0x38bdf8, 0x334155);
  grid.position.y = -2.1;
  grid.material.opacity = 0.28;
  grid.material.transparent = true;
  scene.add(grid);

  const panels = state.apps.map((app, index) => {
    const geometry = new THREE.BoxGeometry(1.8, 1.1, 0.08);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(app.accent),
      metalness: 0.25,
      roughness: 0.38,
      emissive: new THREE.Color(app.accent),
      emissiveIntensity: 0.08
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((index - 2) * 1.9, index % 2 === 0 ? 0.55 : -0.35, -Math.abs(index - 2) * 0.45);
    mesh.rotation.y = (index - 2) * -0.12;
    group.add(mesh);
    return { appId: app.id, mesh, material };
  });

  function resize() {
    const rect = elements.canvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
  }

  function animate(time) {
    const seconds = time * 0.001;
    group.rotation.y = Math.sin(seconds * 0.32) * 0.08;
    panels.forEach((panel, index) => {
      panel.mesh.position.y += Math.sin(seconds * 0.8 + index) * 0.0008;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  function setActiveApp(appId) {
    panels.forEach(panel => {
      panel.material.emissiveIntensity = panel.appId === appId ? 0.38 : 0.08;
      panel.mesh.scale.setScalar(panel.appId === appId ? 1.12 : 1);
    });
  }

  resize();
  setActiveApp(state.selectedAppId);
  requestAnimationFrame(animate);
  window.addEventListener('resize', resize);
  sceneApi = { resize, setActiveApp };
}

function loadState() {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return normalizePortalState(cached);
  } catch (error) {
    return createInitialPortalState();
  }
}

function saveState(persist = true) {
  if (!persist) {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return `${value || ''}`.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}
