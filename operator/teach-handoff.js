(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('teach') !== '1') return;

  const prompt = sessionStorage.getItem('3dvr.teach.operatorPrompt');
  if (!prompt) return;

  const input = document.querySelector('#operator-input');
  if (!input) return;

  input.value = prompt;
  sessionStorage.removeItem('3dvr.teach.operatorPrompt');
  input.focus();
})();
