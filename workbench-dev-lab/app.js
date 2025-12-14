(function initLab() {
  const gun = Gun(window.__GUN_PEERS__ || [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun'
  ]);
  const labRoot = gun.get('3dvr-portal').get('workbench-dev-lab');

  const runForm = document.getElementById('runForm');
  const runList = document.getElementById('runList');
  const formStatus = document.getElementById('formStatus');
  const historyStatus = document.getElementById('historyStatus');
  const keyStatus = document.getElementById('keyStatus');
  const resetButton = document.getElementById('resetForm');

  const runs = new Map();

  function formatDate(timestamp) {
    try {
      return new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(new Date(timestamp));
    } catch (err) {
      return new Date(timestamp).toLocaleString();
    }
  }

  function syncKeyStatus() {
    const storedKey = localStorage.getItem('openai-api-key');
    if (storedKey) {
      keyStatus.textContent = '🔑 Workbench key found — you can jump straight into runs.';
      keyStatus.setAttribute('data-state', 'ready');
    } else {
      keyStatus.textContent = '🔒 No Workbench key detected yet. Set it in the Workbench or Site Builder.';
      keyStatus.setAttribute('data-state', 'missing');
    }
  }

  function renderRuns() {
    if (!runList) return;

    const validRuns = Array.from(runs.entries())
      .filter(([id, data]) => Boolean(id && data && data.title))
      .sort(([, a], [, b]) => (b?.updatedAt || 0) - (a?.updatedAt || 0));

    runList.innerHTML = '';

    if (validRuns.length === 0) {
      historyStatus.textContent = 'No runs saved yet.';
      return;
    }

    historyStatus.textContent = '';

    validRuns.forEach(([id, data]) => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = data.title || 'Untitled run';

      const meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent = `${formatDate(data.updatedAt || Date.now())} · ${data.goal || 'Goal pending'}`;

      const prompt = document.createElement('p');
      prompt.textContent = data.prompt || 'No prompt captured yet.';

      const badges = document.createElement('p');
      badges.className = 'meta';
      const shareText = data.shareStatus ? 'Shared' : 'Private';
      const mockText = data.needsMocks ? 'Mocks on' : 'Live data';
      const traceText = data.traceSteps ? 'Replays tracked' : 'Replays off';
      badges.textContent = `${shareText} · ${mockText} · ${traceText}`;

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(prompt);
      item.appendChild(badges);
      runList.appendChild(item);
    });
  }

  function saveRun(event) {
    event.preventDefault();
    if (!runForm || !labRoot) return;

    const title = runForm.runTitle.value.trim() || 'Untitled run';
    const goal = runForm.runGoal.value.trim();
    const prompt = runForm.runPrompt.value.trim();
    const shareStatus = runForm.shareStatus.checked;
    const needsMocks = runForm.needsMocks.checked;
    const traceSteps = runForm.traceSteps.checked;

    const runId = `run-${Date.now()}`;
    const payload = {
      title,
      goal,
      prompt,
      shareStatus,
      needsMocks,
      traceSteps,
      updatedAt: Date.now()
    };

    formStatus.textContent = 'Saving to Gun...';
    labRoot.get(runId).put(payload, (ack) => {
      if (ack?.err) {
        formStatus.textContent = `Save failed: ${ack.err}`;
        return;
      }
      formStatus.textContent = 'Saved. Reload the Workbench or Builder to continue.';
      runs.set(runId, payload);
      renderRuns();
    });
  }

  function resetFormFields() {
    runForm.reset();
    formStatus.textContent = '';
  }

  if (runForm) {
    runForm.addEventListener('submit', saveRun);
  }

  if (resetButton) {
    resetButton.addEventListener('click', resetFormFields);
  }

  labRoot.map().on((data, id) => {
    if (!data || typeof data !== 'object' || !id) return;
    runs.set(id, data);
    renderRuns();
  });

  syncKeyStatus();
})();
