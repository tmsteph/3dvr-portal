const shortcuts = document.querySelectorAll('.shortcut, .launcher-item');
const launcher = document.getElementById('launcher');
const launcherPanel = document.getElementById('launcher-panel');
const windowLayer = document.getElementById('window-layer');
const taskbarApps = document.getElementById('taskbar-apps');
const brandButtons = document.querySelectorAll('[data-open-url]');
const mobileQuery = window.matchMedia('(max-width: 600px)');
const root = document.documentElement;

function updateViewportUnits() {
  const viewport = window.visualViewport;
  const viewportHeight = viewport ? viewport.height : window.innerHeight;
  if (viewportHeight) {
    const heightUnit = viewportHeight * 0.01;
    root.style.setProperty('--vh', `${heightUnit}px`);
  }

  const viewportWidth = viewport ? viewport.width : window.innerWidth;
  if (viewportWidth) {
    const widthUnit = viewportWidth * 0.01;
    root.style.setProperty('--vw', `${widthUnit}px`);
  }

  if (viewport) {
    root.style.setProperty('--vv-left', `${viewport.offsetLeft}px`);
    root.style.setProperty('--vv-top', `${viewport.offsetTop}px`);
  } else {
    root.style.setProperty('--vv-left', '0px');
    root.style.setProperty('--vv-top', '0px');
  }
}

updateViewportUnits();
window.addEventListener('resize', updateViewportUnits);
window.addEventListener('orientationchange', updateViewportUnits);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', updateViewportUnits);
  window.visualViewport.addEventListener('scroll', updateViewportUnits);
}

const apps = {
  navigator: {
    title: 'Navigator',
    icon: '🧭',
    content: `
      <p><strong>Welcome to Portal Navigator.</strong> Use this window to jump into the most important areas of the 3DVR ecosystem.</p>
      <div class="stacked-links">
        <a class="button" href="/index.html">Launch Dashboard</a>
        <a class="button" href="/website-builder.html">Website Builder</a>
        <a class="button" href="/sales">Sales Command Center</a>
        <a class="button" href="/portal.3dvr.tech/video">Video Library</a>
      </div>
      <p>Tip: Press <kbd>L</kbd> to toggle the launcher from anywhere.</p>
    `
  },
  notes: {
    title: 'Notes',
    icon: '📝',
    content: `
      <p>Capture your ideas, meeting notes, and research here.</p>
      <ul class="note-list">
        <li><strong>Research:</strong> Explore VR onboarding improvements.</li>
        <li><strong>Focus:</strong> Align marketing assets with wellness story.</li>
        <li><strong>Reminder:</strong> Sync with rewards squad every Friday.</li>
      </ul>
      <a class="button" href="/notes.html">Open full Notes app</a>
    `
  },
  mindfulness: {
    title: 'Mindfulness Session',
    icon: '🧘',
    content: `
      <p>Ground yourself before diving into deep work.</p>
      <div class="mindfulness-grid">
        <a class="button" href="/mindfulness-session.html">Start breathing session</a>
        <a class="button" href="/meditation">Explore guided meditations</a>
        <a class="button" href="/wellness.html">Wellness dashboard</a>
      </div>
    `
  },
  terminal: {
    title: 'Command Console',
    icon: '⌨️',
    content: `
      <p>Quick commands to orchestrate your workflow.</p>
      <div class="command-grid">
        <button class="button command" data-open-url="/tasks.html">Open Tasks</button>
        <button class="button command" data-open-url="/calendar">View Calendar</button>
        <button class="button command" data-open-url="/chat.html">Join Chat</button>
        <button class="button command" data-open-url="/crm">CRM Tools</button>
      </div>
      <p class="muted">Command palette coming soon with GunDB integration.</p>
    `
  }
};

let zIndex = 10;
let activeWindowId = null;

function isMobileLayout() {
  return mobileQuery.matches;
}

function setWindowPosition(windowEl, offset = 0) {
  if (!windowEl.dataset.desktopLeft) {
    windowEl.dataset.desktopLeft = `calc(22% + ${offset}px)`;
  }
  if (!windowEl.dataset.desktopTop) {
    windowEl.dataset.desktopTop = `calc(12% + ${offset / 3}px)`;
  }

  if (isMobileLayout()) {
    windowEl.style.left = '0';
    windowEl.style.right = '0';
    windowEl.style.top = 'auto';
  } else {
    windowEl.style.left = windowEl.dataset.desktopLeft;
    windowEl.style.right = '';
    windowEl.style.top = windowEl.dataset.desktopTop;
  }
}

function applyResponsiveWindowLayout() {
  document.querySelectorAll('.window').forEach(windowEl => {
    setWindowPosition(windowEl);
  });
}

function toggleLauncher(forceState) {
  const isOpen = launcherPanel.classList.contains('open');
  const nextState = typeof forceState === 'boolean' ? forceState : !isOpen;
  launcherPanel.classList.toggle('open', nextState);
  launcher.setAttribute('aria-expanded', nextState);
  if (nextState) {
    launcher.focus();
  }
}

function createWindow(appKey) {
  const existing = document.querySelector(`.window[data-app="${appKey}"]`);
  if (existing) {
    focusWindow(existing);
    return existing;
  }

  const app = apps[appKey];
  if (!app) {
    return null;
  }

  const windowEl = document.createElement('section');
  windowEl.className = 'window';
  windowEl.dataset.app = appKey;
  windowEl.innerHTML = `
    <header class="window-header">
      <div class="window-title">
        <span>${app.icon}</span>
        <span>${app.title}</span>
      </div>
      <div class="window-controls">
        <button class="window-control" data-action="close" aria-label="Close ${app.title}">✕</button>
      </div>
    </header>
    <div class="window-content">${app.content}</div>
  `;

  const openWindows = document.querySelectorAll('.window').length;
  const offset = Math.min(120, openWindows * 28);
  setWindowPosition(windowEl, offset);

  windowLayer.appendChild(windowEl);
  makeDraggable(windowEl);
  attachWindowEvents(windowEl);
  addToTaskbar(appKey, app);
  focusWindow(windowEl);
  return windowEl;
}

function focusWindow(windowEl) {
  zIndex += 1;
  windowEl.style.zIndex = zIndex;
  windowEl.classList.remove('minimized');
  activeWindowId = windowEl.dataset.app;
  updateTaskbarState();
}

function attachWindowEvents(windowEl) {
  windowEl.addEventListener('mousedown', () => focusWindow(windowEl));
  windowEl.querySelector('.window-controls').addEventListener('click', event => {
    if (event.target.closest('[data-action="close"]')) {
      closeWindow(windowEl.dataset.app);
    }
  });

  windowEl.querySelectorAll('[data-open-url]').forEach(button => {
    button.addEventListener('click', () => {
      window.open(button.dataset.openUrl, '_blank');
    });
  });
}

function closeWindow(appKey) {
  const windowEl = document.querySelector(`.window[data-app="${appKey}"]`);
  if (windowEl) {
    windowEl.remove();
  }
  const taskButton = document.querySelector(`.taskbar-app[data-app="${appKey}"]`);
  if (taskButton) {
    taskButton.remove();
  }
  if (activeWindowId === appKey) {
    activeWindowId = null;
  }
}

function addToTaskbar(appKey, app) {
  const button = document.createElement('button');
  button.className = 'taskbar-app';
  button.dataset.app = appKey;
  button.setAttribute('role', 'tab');
  button.innerHTML = `<span>${app.icon}</span><span>${app.title}</span>`;
  button.addEventListener('click', () => {
    const windowEl = document.querySelector(`.window[data-app="${appKey}"]`);
    if (windowEl) {
      focusWindow(windowEl);
    } else {
      createWindow(appKey);
    }
  });
  taskbarApps.appendChild(button);
  updateTaskbarState();
}

function updateTaskbarState() {
  document.querySelectorAll('.taskbar-app').forEach(button => {
    const isActive = button.dataset.app === activeWindowId;
    button.classList.toggle('active', isActive);
  });
}

function makeDraggable(windowEl) {
  const header = windowEl.querySelector('.window-header');
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;

  function onPointerDown(event) {
    if (isMobileLayout()) {
      return;
    }
    dragging = true;
    windowEl.classList.add('dragging');
    offsetX = event.clientX - windowEl.offsetLeft;
    offsetY = event.clientY - windowEl.offsetTop;
    focusWindow(windowEl);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(event) {
    if (!dragging) {
      return;
    }
    const x = event.clientX - offsetX;
    const y = event.clientY - offsetY;
    const maxX = Math.max(16, window.innerWidth - windowEl.offsetWidth - 16);
    const maxY = Math.max(16, window.innerHeight - windowEl.offsetHeight - 16);
    const nextX = Math.min(Math.max(16, x), maxX);
    const nextY = Math.min(Math.max(16, y), maxY);
    windowEl.style.left = `${nextX}px`;
    windowEl.style.top = `${nextY}px`;
  }

  function onPointerUp() {
    dragging = false;
    windowEl.classList.remove('dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    if (!isMobileLayout()) {
      windowEl.dataset.desktopLeft = windowEl.style.left;
      windowEl.dataset.desktopTop = windowEl.style.top;
    }
  }

  header.addEventListener('pointerdown', onPointerDown);
}

function handleShortcut(event) {
  const appKey = event.currentTarget.dataset.app;
  if (appKey) {
    createWindow(appKey);
    toggleLauncher(false);
  }
}

function handleExternalOpen(event) {
  const url = event.currentTarget.dataset.openUrl;
  if (url) {
    window.open(url, '_blank');
  }
}

function updateClock() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const date = now.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
  document.getElementById('clock-time').textContent = `${hours}:${minutes}`;
  document.getElementById('clock-date').textContent = date;
}

shortcuts.forEach(shortcut => {
  if (shortcut.dataset.app) {
    shortcut.addEventListener('click', handleShortcut);
  } else if (shortcut.dataset.openUrl) {
    shortcut.addEventListener('click', handleExternalOpen);
  }
});

launcher.addEventListener('click', () => toggleLauncher());

brandButtons.forEach(button => {
  button.addEventListener('click', handleExternalOpen);
});

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  const tagName = event.target.tagName.toLowerCase();
  const inTextField = ['input', 'textarea', 'select'].includes(tagName) || event.target.isContentEditable;
  if (key === 'l' && !inTextField) {
    toggleLauncher();
  }
  if (key === 'escape' && activeWindowId) {
    closeWindow(activeWindowId);
  }
});

updateClock();
setInterval(updateClock, 1000 * 30);

window.addEventListener('click', event => {
  if (!launcherPanel.contains(event.target) && !launcher.contains(event.target)) {
    toggleLauncher(false);
  }
});

const handleLayoutChange = () => {
  applyResponsiveWindowLayout();
};

if (typeof mobileQuery.addEventListener === 'function') {
  mobileQuery.addEventListener('change', handleLayoutChange);
} else if (typeof mobileQuery.addListener === 'function') {
  mobileQuery.addListener(handleLayoutChange);
}

window.addEventListener('resize', applyResponsiveWindowLayout);
applyResponsiveWindowLayout();
