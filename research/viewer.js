(() => {
  const target = document.querySelector('[data-markdown-target]');
  const source = document.body.dataset.document;
  const titleTarget = document.querySelector('[data-paper-title]');
  const statusTarget = document.querySelector('[data-paper-status]');

  if (!target || !source) return;

  const showError = (message) => {
    target.innerHTML = `<div class="render-error"><strong>Unable to load this paper.</strong><p>${message}</p></div>`;
    if (statusTarget) statusTarget.textContent = 'Markdown source unavailable';
  };

  fetch(source, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`Request returned ${response.status}`);
      return response.text();
    })
    .then((markdown) => {
      if (!window.marked || !window.DOMPurify) {
        throw new Error('The Markdown renderer did not load.');
      }

      const firstHeading = markdown.match(/^#\s+(.+)$/m);
      if (firstHeading && titleTarget) {
        titleTarget.textContent = firstHeading[1].trim();
        document.title = `${firstHeading[1].trim()} | 3DVR Research`;
      }

      const rendered = window.marked.parse(markdown, {
        gfm: true,
        breaks: false,
      });
      target.innerHTML = window.DOMPurify.sanitize(rendered, {
        ADD_ATTR: ['target'],
      });

      target.querySelectorAll('a[href^="http"]').forEach((link) => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });

      if (statusTarget) statusTarget.textContent = 'Rendered from the canonical Markdown source';
    })
    .catch((error) => showError(error.message));
})();
