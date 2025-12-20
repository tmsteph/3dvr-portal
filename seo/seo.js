const STORAGE_KEY = 'portal_seo_plan_progress_v1';

const tasks = [
  {
    id: 'visibility-field',
    label: 'Add visibility field to content objects (public/unlisted/private)',
    status: 'Not started'
  },
  {
    id: 'policy-helper',
    label: 'Add policy helper: getPolicy(viewer, doc)',
    status: 'Not started'
  },
  {
    id: 'public-routes',
    label: 'Public routes: ensure index,follow + included in sitemap',
    status: 'Not started'
  },
  {
    id: 'unlisted-routes',
    label: 'Unlisted routes: noindex,nofollow + not in sitemap',
    status: 'Not started'
  },
  {
    id: 'private-routes',
    label: 'Private routes: auth-gated + noindex + disallowed in robots.txt',
    status: 'Not started'
  },
  {
    id: 'robots-txt',
    label: 'Add robots.txt',
    status: 'Not started'
  },
  {
    id: 'sitemap-xml',
    label: 'Add sitemap.xml (public only)',
    status: 'Not started'
  },
  {
    id: 'snapshot-endpoint',
    label: 'Add snapshot endpoint (generate HTML for public pages)',
    status: 'Not started'
  },
  {
    id: 'snapshot-storage',
    label: 'Add snapshot storage (Blob/KV)',
    status: 'Not started'
  },
  {
    id: 'discussion-index',
    label: 'Add discuss index page that lists public threads',
    status: 'Not started'
  },
  {
    id: 'canonical-urls',
    label: 'Add canonical URLs & slugs for public content',
    status: 'Not started'
  },
  {
    id: 'opengraph-tags',
    label: 'Add OpenGraph tags for public pages',
    status: 'Not started'
  },
  {
    id: 'publish-action',
    label: 'Add “Publish” action that triggers snapshot',
    status: 'Not started'
  }
];

const defaultProgress = tasks.reduce((acc, task) => {
  acc[task.id] = false;
  return acc;
}, {});

function loadProgress() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { ...defaultProgress };
  }
  try {
    const parsed = JSON.parse(stored);
    const items = parsed && typeof parsed === 'object' ? parsed.items : null;
    return {
      ...defaultProgress,
      ...(items && typeof items === 'object' ? items : {})
    };
  } catch (error) {
    console.warn('Unable to parse progress data', error);
    return { ...defaultProgress };
  }
}

function saveProgress(items) {
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function statusClass(status) {
  if (status === 'Done') return 'status-pill status-pill--done';
  if (status === 'In progress') return 'status-pill status-pill--in-progress';
  return 'status-pill status-pill--not-started';
}

function renderTable(progress) {
  const tableBody = document.querySelector('[data-task-table]');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  tasks.forEach(task => {
    const row = document.createElement('tr');
    const taskCell = document.createElement('td');
    const statusCell = document.createElement('td');

    taskCell.textContent = task.label;
    const statusValue = progress[task.id] ? 'Done' : task.status;
    const statusSpan = document.createElement('span');
    statusSpan.className = statusClass(statusValue);
    statusSpan.textContent = statusValue;
    statusSpan.dataset.statusId = task.id;
    statusCell.appendChild(statusSpan);

    row.appendChild(taskCell);
    row.appendChild(statusCell);
    tableBody.appendChild(row);
  });
}

function updateProgressSummary(progress) {
  const countEl = document.querySelector('[data-progress-count]');
  const totalEl = document.querySelector('[data-progress-total]');
  const total = tasks.length;
  const completed = tasks.reduce((sum, task) => sum + (progress[task.id] ? 1 : 0), 0);

  if (countEl) countEl.textContent = completed;
  if (totalEl) totalEl.textContent = total;
}

function renderChecklist(progress) {
  const list = document.querySelector('[data-progress-list]');
  if (!list) return;
  list.innerHTML = '';

  tasks.forEach(task => {
    const item = document.createElement('li');
    const checkbox = document.createElement('input');
    const label = document.createElement('label');

    checkbox.type = 'checkbox';
    checkbox.id = `progress-${task.id}`;
    checkbox.checked = Boolean(progress[task.id]);
    checkbox.addEventListener('change', () => {
      progress[task.id] = checkbox.checked;
      saveProgress(progress);
      updateProgressSummary(progress);
      renderTable(progress);
    });

    label.setAttribute('for', checkbox.id);
    label.textContent = task.label;

    item.appendChild(checkbox);
    item.appendChild(label);
    list.appendChild(item);
  });
}

function handleExport(progress) {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    items: progress
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'seo-plan-progress.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function handleImport(file, progress) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const parsed = JSON.parse(event.target.result);
      const items = parsed && typeof parsed === 'object' ? parsed.items : null;
      if (!items || typeof items !== 'object') {
        throw new Error('Missing items');
      }
      tasks.forEach(task => {
        if (typeof items[task.id] === 'boolean') {
          progress[task.id] = items[task.id];
        }
      });
      saveProgress(progress);
      updateProgressSummary(progress);
      renderChecklist(progress);
      renderTable(progress);
    } catch (error) {
      console.warn('Unable to import progress file', error);
    }
  };
  reader.readAsText(file);
}

function initProgressTracker() {
  const progress = loadProgress();
  renderTable(progress);
  renderChecklist(progress);
  updateProgressSummary(progress);

  const exportButton = document.querySelector('[data-export-progress]');
  if (exportButton) {
    exportButton.addEventListener('click', () => handleExport(progress));
  }

  const importInput = document.querySelector('[data-import-progress]');
  if (importInput) {
    importInput.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      handleImport(file, progress);
      event.target.value = '';
    });
  }
}

window.addEventListener('DOMContentLoaded', initProgressTracker);
