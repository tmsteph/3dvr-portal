import { runOperatorAction } from './operator/actions.js';
import { collectPortalContext } from './operator/portal-context.js';

const form = document.querySelector('#homeOperatorForm');
const input = document.querySelector('#homeOperatorInput');
const submit = document.querySelector('#homeOperatorSubmit');
const status = document.querySelector('#homeOperatorStatus');
const result = document.querySelector('#homeOperatorResult');
const reply = document.querySelector('#homeOperatorReply');
const followUps = document.querySelector('#homeOperatorFollowUps');
const actionLink = document.querySelector('#homeOperatorAction');

if (form && input && submit && status && result && reply && followUps && actionLink) {
  let history = [];

  const collectPageContext = () => ({
    path: window.location.pathname,
    url: window.location.href,
    title: document.title,
    heading: document.querySelector('#home-title')?.textContent?.trim() || '',
    area: 'home',
    visibleActions: Array.from(document.querySelectorAll('.action-card strong'))
      .map(node => node.textContent?.trim())
      .filter(Boolean)
  });

  const requestOperator = payload => fetch('/api/openai-site?provider=operator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const setBusy = busy => {
    submit.disabled = busy;
    input.disabled = busy;
    form.setAttribute('aria-busy', String(busy));
  };

  const renderResponse = ({ message, suggestions = [], url = '', label = 'Open workspace' }) => {
    reply.textContent = message;
    followUps.replaceChildren();
    suggestions.slice(0, 3).forEach(suggestion => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'operator-follow-up';
      button.textContent = suggestion;
      button.addEventListener('click', () => {
        input.value = suggestion;
        form.requestSubmit();
      });
      followUps.appendChild(button);
    });
    actionLink.hidden = !url;
    if (url) {
      actionLink.href = url;
      actionLink.textContent = `${label} →`;
    }
    result.hidden = false;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    const prior = history.slice(-12);
    history.push({ role: 'user', content: prompt });
    input.value = '';
    setBusy(true);
    status.textContent = 'Operator is working on this page…';

    try {
      const portalContext = await collectPortalContext();
      portalContext.page = collectPageContext();

      const response = await requestOperator({ prompt, history: prior, portalContext });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Operator request failed.');

      let outcome = null;
      if (data.action?.type && data.action.type !== 'none') {
        outcome = await runOperatorAction(data.action);
      }

      const message = [data.reply, outcome?.message].filter(Boolean).join('\n\n');
      history.push({ role: 'assistant', content: message });
      const lifeSpaceActions = new Set(['create_note', 'create_checklist', 'save_link']);
      const label = lifeSpaceActions.has(data.action?.type)
        ? 'Open Life Space'
        : data.action?.type === 'add_lead'
          ? 'Open Lead Finder'
          : 'Open workspace';

      renderResponse({
        message,
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        url: outcome?.url || '',
        label
      });
      status.textContent = 'Operator is ready.';
    } catch (error) {
      const message = `I could not finish that: ${error.message}`;
      history.push({ role: 'assistant', content: message });
      renderResponse({ message });
      status.textContent = 'Operator needs another try.';
    } finally {
      setBusy(false);
      input.focus();
    }
  });
}
