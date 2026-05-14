(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.querySelector('[data-issue-launcher-root]')) return;
  if (
    document.documentElement?.dataset.issueLauncher === 'off' ||
    document.body?.dataset.issueLauncher === 'off' ||
    document.querySelector('meta[name="portal:issue-launcher"][content="off"]')
  ) {
    return;
  }

  const REPO_OWNER = 'tmsteph';
  const REPO_NAME = '3dvr-portal';
  const ISSUE_BASE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/issues/new`;
  const ISSUE_TYPES = [
    { value: 'bug', label: 'Bug report' },
    { value: 'idea', label: 'Feature idea' },
    { value: 'copy', label: 'Copy or UX note' }
  ];

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const currentUrl = window.location.href;
  const currentPath = window.location.pathname + window.location.search + window.location.hash;
  const currentTitle = document.title || currentPath || 'Portal page';
  const launcherPreference =
    document.documentElement?.dataset.issueLauncher ||
    document.body?.dataset.issueLauncher ||
    document.querySelector('meta[name="portal:issue-launcher"]')?.getAttribute('content') ||
    '';
  const shouldFloatLauncher = launcherPreference === 'floating';

  const encode = (value) => encodeURIComponent(value).replace(/%20/g, '+');

  const buildIssueUrl = ({ issueType, title, summary, expected }) => {
    const bodyLines = [
      `Issue type: ${issueType}`,
      '',
      'Page context',
      `- Page: ${currentTitle}`,
      `- Title: ${currentTitle}`,
      `- Path: ${currentPath}`,
      `- URL: ${currentUrl}`,
      '',
      'What happened',
      summary || 'Please describe the issue or request.',
      '',
      'Expected result',
      expected || 'Please describe what should happen instead.',
      '',
      'Portal note',
      'Created from the in-portal GitHub issue launcher.'
    ];

    return `${ISSUE_BASE_URL}?title=${encode(title)}&body=${encode(bodyLines.join('\n'))}`;
  };

  const style = document.createElement('style');
  style.textContent = `
    .portal-issue-launcher {
      position: fixed;
      left: 50%;
      bottom: max(0.75rem, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      width: min(28rem, calc(100vw - 1.5rem));
      z-index: 1200;
      display: grid;
      gap: 0.75rem;
      justify-items: stretch;
      pointer-events: none;
    }

    .portal-issue-launcher--footer {
      position: relative;
      left: auto;
      bottom: auto;
      transform: none;
      width: auto;
      max-width: min(28rem, calc(100vw - 1.5rem));
      margin: 0.75rem auto max(0.5rem, env(safe-area-inset-bottom));
      justify-items: center;
    }

    .portal-issue-launcher__button,
    .portal-issue-launcher__panel {
      pointer-events: auto;
    }

    .portal-issue-launcher__button {
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 1rem;
      padding: 0.75rem 0.95rem 0.85rem;
      background: rgba(15, 23, 42, 0.92);
      color: #e2e8f0;
      box-shadow: 0 18px 48px rgba(2, 6, 23, 0.45);
      font: inherit;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      backdrop-filter: blur(14px);
      text-align: left;
    }

    .portal-issue-launcher__button:hover,
    .portal-issue-launcher__button:focus-visible {
      transform: translateY(-2px);
      border-color: rgba(56, 189, 248, 0.58);
      box-shadow: 0 24px 56px rgba(2, 6, 23, 0.56);
      outline: none;
    }

    .portal-issue-launcher__button-label {
      display: grid;
      gap: 0.18rem;
    }

    .portal-issue-launcher__button-eyebrow {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #67e8f9;
    }

    .portal-issue-launcher__button-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .portal-issue-launcher__button-meta {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .portal-issue-launcher--footer .portal-issue-launcher__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-color: rgba(148, 163, 184, 0.26);
      border-radius: 999px;
      padding: 0.35rem 0.75rem;
      background: transparent;
      color: inherit;
      box-shadow: none;
      backdrop-filter: none;
      text-align: center;
    }

    .portal-issue-launcher--footer .portal-issue-launcher__button:hover,
    .portal-issue-launcher--footer .portal-issue-launcher__button:focus-visible {
      transform: none;
      border-color: rgba(56, 189, 248, 0.5);
      box-shadow: none;
    }

    .portal-issue-launcher--footer .portal-issue-launcher__button-label {
      display: inline-flex;
    }

    .portal-issue-launcher--footer .portal-issue-launcher__button-eyebrow,
    .portal-issue-launcher--footer .portal-issue-launcher__button-meta {
      display: none;
    }

    .portal-issue-launcher--footer .portal-issue-launcher__button-title {
      color: inherit;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .portal-issue-launcher__panel {
      width: 100%;
      padding: 1rem;
      border-radius: 1rem;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: rgba(15, 23, 42, 0.97);
      color: #e2e8f0;
      box-shadow: 0 30px 70px rgba(2, 6, 23, 0.62);
      backdrop-filter: blur(18px);
    }

    .portal-issue-launcher__panel[hidden] {
      display: none;
    }

    .portal-issue-launcher__header {
      display: grid;
      gap: 0.35rem;
      margin-bottom: 0.9rem;
    }

    .portal-issue-launcher__eyebrow {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #67e8f9;
    }

    .portal-issue-launcher__title {
      margin: 0;
      font-size: 1.05rem;
    }

    .portal-issue-launcher__copy {
      margin: 0;
      font-size: 0.88rem;
      line-height: 1.5;
      color: #94a3b8;
    }

    .portal-issue-launcher__form {
      display: grid;
      gap: 0.75rem;
    }

    .portal-issue-launcher__field {
      display: grid;
      gap: 0.4rem;
    }

    .portal-issue-launcher__field label {
      font-size: 0.82rem;
      font-weight: 600;
      color: #cbd5e1;
    }

    .portal-issue-launcher__field input,
    .portal-issue-launcher__field select,
    .portal-issue-launcher__field textarea {
      width: 100%;
      border-radius: 0.8rem;
      border: 1px solid rgba(148, 163, 184, 0.24);
      background: rgba(30, 41, 59, 0.92);
      color: #f8fafc;
      padding: 0.75rem 0.85rem;
      font: inherit;
      resize: vertical;
      min-height: 2.8rem;
    }

    .portal-issue-launcher__field textarea {
      min-height: 5.4rem;
    }

    .portal-issue-launcher__field input:focus,
    .portal-issue-launcher__field select:focus,
    .portal-issue-launcher__field textarea:focus {
      outline: 2px solid rgba(56, 189, 248, 0.42);
      outline-offset: 1px;
      border-color: rgba(56, 189, 248, 0.5);
    }

    .portal-issue-launcher__hint {
      margin: 0;
      font-size: 0.74rem;
      color: #94a3b8;
      line-height: 1.45;
    }

    .portal-issue-launcher__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      justify-content: flex-end;
    }

    .portal-issue-launcher__action {
      border-radius: 999px;
      padding: 0.72rem 1rem;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid rgba(148, 163, 184, 0.24);
      transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
    }

    .portal-issue-launcher__action:hover,
    .portal-issue-launcher__action:focus-visible {
      transform: translateY(-1px);
      outline: none;
    }

    .portal-issue-launcher__action--ghost {
      background: rgba(30, 41, 59, 0.92);
      color: #e2e8f0;
    }

    .portal-issue-launcher__action--primary {
      background: linear-gradient(135deg, #22d3ee, #38bdf8);
      color: #04111d;
      border-color: rgba(56, 189, 248, 0.5);
    }

    .portal-issue-launcher__status {
      margin: 0;
      min-height: 1.1rem;
      font-size: 0.8rem;
      color: #94a3b8;
    }

    @media (max-width: 640px) {
      .portal-issue-launcher {
        width: calc(100vw - 1rem);
        bottom: max(0.5rem, env(safe-area-inset-bottom));
      }

      .portal-issue-launcher--footer {
        width: auto;
        max-width: calc(100vw - 1rem);
        margin-inline: auto;
      }

      .portal-issue-launcher__panel {
        width: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .portal-issue-launcher__button,
      .portal-issue-launcher__action {
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('section');
  root.className = shouldFloatLauncher
    ? 'portal-issue-launcher'
    : 'portal-issue-launcher portal-issue-launcher--footer';
  root.dataset.issueLauncherRoot = 'true';
  root.setAttribute('aria-label', 'Portal GitHub issue launcher');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'portal-issue-launcher__button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'portalIssueLauncherPanel');
  button.innerHTML = `
    <span class="portal-issue-launcher__button-label">
      <span class="portal-issue-launcher__button-eyebrow">Page feedback</span>
      <span class="portal-issue-launcher__button-title">Report portal issue</span>
      <span class="portal-issue-launcher__button-meta">${currentTitle}</span>
    </span>
  `;

  const panel = document.createElement('div');
  panel.id = 'portalIssueLauncherPanel';
  panel.className = 'portal-issue-launcher__panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="portal-issue-launcher__header">
      <span class="portal-issue-launcher__eyebrow">GitHub issue</span>
      <h2 class="portal-issue-launcher__title">Create an issue from this page</h2>
      <p class="portal-issue-launcher__copy">
        This opens a prefilled GitHub issue for <strong>${REPO_OWNER}/${REPO_NAME}</strong> with the current page context attached.
      </p>
    </div>
    <form class="portal-issue-launcher__form">
      <div class="portal-issue-launcher__field">
        <label for="portalIssueType">Issue type</label>
        <select id="portalIssueType" name="issueType"></select>
      </div>
      <div class="portal-issue-launcher__field">
        <label for="portalIssueTitle">Title</label>
        <input id="portalIssueTitle" name="title" type="text" maxlength="120" />
      </div>
      <div class="portal-issue-launcher__field">
        <label for="portalIssuePage">Page</label>
        <input id="portalIssuePage" name="page" type="text" readonly />
      </div>
      <div class="portal-issue-launcher__field">
        <label for="portalIssueSummary">What happened?</label>
        <textarea id="portalIssueSummary" name="summary" placeholder="What is broken, confusing, or missing?"></textarea>
      </div>
      <div class="portal-issue-launcher__field">
        <label for="portalIssueExpected">What should happen?</label>
        <textarea id="portalIssueExpected" name="expected" placeholder="What would the better behavior or outcome be?"></textarea>
        <p class="portal-issue-launcher__hint">The current page title and URL are added automatically.</p>
      </div>
      <p class="portal-issue-launcher__status" role="status" aria-live="polite"></p>
      <div class="portal-issue-launcher__actions">
        <button type="button" class="portal-issue-launcher__action portal-issue-launcher__action--ghost" data-issue-close>
          Cancel
        </button>
        <button type="submit" class="portal-issue-launcher__action portal-issue-launcher__action--primary">
          Open GitHub issue
        </button>
      </div>
    </form>
  `;

  root.append(button, panel);
  const mountTarget = shouldFloatLauncher
    ? document.body
    : document.querySelector('footer') || document.body;
  mountTarget.appendChild(root);

  const form = panel.querySelector('form');
  const typeInput = form.querySelector('#portalIssueType');
  const titleInput = form.querySelector('#portalIssueTitle');
  const pageInput = form.querySelector('#portalIssuePage');
  const summaryInput = form.querySelector('#portalIssueSummary');
  const expectedInput = form.querySelector('#portalIssueExpected');
  const closeButton = panel.querySelector('[data-issue-close]');
  const status = panel.querySelector('.portal-issue-launcher__status');

  function updateBodyPadding() {
    if (!shouldFloatLauncher) {
      document.body.style.paddingBottom = '';
      return;
    }
    const shouldPad = !root.classList.contains('portal-issue-launcher--footer');
    const launcherHeight = Math.ceil(root.getBoundingClientRect().height || 0);
    document.body.style.paddingBottom = shouldPad && launcherHeight
      ? `${launcherHeight + 16}px`
      : '';
  }

  function syncDockMode() {
    if (!shouldFloatLauncher) {
      root.classList.add('portal-issue-launcher--footer');
      updateBodyPadding();
      return;
    }
    const doc = document.documentElement;
    const remaining = doc.scrollHeight - (window.scrollY + window.innerHeight);
    const shouldDockAsFooter = remaining <= root.offsetHeight + 24;
    root.classList.toggle('portal-issue-launcher--footer', shouldDockAsFooter);
    updateBodyPadding();
  }

  ISSUE_TYPES.forEach((issueType) => {
    const option = document.createElement('option');
    option.value = issueType.value;
    option.textContent = issueType.label;
    typeInput.appendChild(option);
  });

  const defaultTitle = `[portal] ${currentTitle}`;
  titleInput.value = defaultTitle;
  pageInput.value = `${currentTitle} — ${currentPath}`;

  const openPanel = () => {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    status.textContent = `Current page: ${currentPath}`;
    if (!prefersReducedMotion) {
      requestAnimationFrame(() => titleInput.focus());
    } else {
      titleInput.focus();
    }
  };

  const closePanel = () => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    status.textContent = '';
    button.focus();
  };

  button.addEventListener('click', () => {
    if (panel.hidden) {
      openPanel();
      syncDockMode();
      return;
    }
    closePanel();
    syncDockMode();
  });

  closeButton.addEventListener('click', closePanel);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
      syncDockMode();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const issueType = typeInput.options[typeInput.selectedIndex]?.textContent || ISSUE_TYPES[0].label;
    const title = titleInput.value.trim() || defaultTitle;
    const summary = summaryInput.value.trim();
    const expected = expectedInput.value.trim();
    const issueUrl = buildIssueUrl({ issueType, title, summary, expected });
    status.textContent = 'Opening GitHub issue…';
    const opened = window.open(issueUrl, '_blank', 'noopener');
    if (!opened) {
      window.location.href = issueUrl;
    }
  });

  const syncDockModeSoon = () => requestAnimationFrame(syncDockMode);
  window.addEventListener('scroll', syncDockModeSoon, { passive: true });
  window.addEventListener('resize', syncDockModeSoon);
  syncDockModeSoon();
})();
