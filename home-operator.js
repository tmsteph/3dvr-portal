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

  const installSubmitLoader = () => {
    if (submit.querySelector('.operator-submit__portal')) return;

    const style = document.createElement('style');
    style.textContent = `
      #homeOperatorSubmit {
        position: relative;
        display: grid;
        place-items: center;
        overflow: hidden;
      }

      #homeOperatorSubmit .operator-submit__arrow,
      #homeOperatorSubmit .operator-submit__portal {
        grid-area: 1 / 1;
        pointer-events: none;
        transition: opacity 160ms ease, transform 180ms ease;
      }

      #homeOperatorSubmit .operator-submit__arrow {
        line-height: 1;
      }

      #homeOperatorSubmit .operator-submit__portal {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        opacity: 0;
        transform: scale(0.68) rotate(-35deg);
        filter: drop-shadow(0 0 6px rgba(103, 232, 249, 0.42));
      }

      #homeOperatorSubmit[data-busy="true"] {
        background: #0f766e;
      }

      #homeOperatorSubmit[data-busy="true"]:disabled {
        opacity: 1;
        cursor: progress;
      }

      #homeOperatorSubmit[data-busy="true"] .operator-submit__arrow {
        opacity: 0;
        transform: scale(0.45) rotate(90deg);
      }

      #homeOperatorSubmit[data-busy="true"] .operator-submit__portal {
        opacity: 1;
        transform: scale(1);
        animation: operator-mini-portal-spin 900ms linear infinite, operator-mini-portal-pulse 760ms ease-in-out infinite alternate;
      }

      @keyframes operator-mini-portal-spin {
        to { transform: scale(1) rotate(360deg); }
      }

      @keyframes operator-mini-portal-pulse {
        from { filter: drop-shadow(0 0 3px rgba(103, 232, 249, 0.28)); }
        to { filter: drop-shadow(0 0 9px rgba(103, 232, 249, 0.72)); }
      }

      @media (prefers-reduced-motion: reduce) {
        #homeOperatorSubmit .operator-submit__arrow,
        #homeOperatorSubmit .operator-submit__portal {
          transition: none;
        }

        #homeOperatorSubmit[data-busy="true"] .operator-submit__portal {
          animation: operator-mini-portal-pulse 1100ms ease-in-out infinite alternate;
        }
      }
    `;
    document.head.appendChild(style);

    const arrow = document.createElement('span');
    arrow.className = 'operator-submit__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    const portal = document.createElement('img');
    portal.className = 'operator-submit__portal';
    portal.src = '/brand/portal-logo.svg';
    portal.alt = '';
    portal.setAttribute('aria-hidden', 'true');

    submit.replaceChildren(arrow, portal);
  };

  installSubmitLoader();

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
    submit.dataset.busy = String(busy);
    submit.setAttribute('aria-label', busy ? 'Operator is working' : 'Send to Operator');
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
