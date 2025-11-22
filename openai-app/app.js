const gun = Gun();
const apiKeyStorageKey = 'openai-api-key';
const sessionKey = 'openai-workbench-session';
const storedSession = localStorage.getItem(sessionKey);
const sessionId = storedSession || Gun.text.random();
localStorage.setItem(sessionKey, sessionId);
// Gun graph: ai/workbench/<sessionId> -> { prompt, response, createdAt }
const transcriptNode = gun.get('ai').get('workbench').get(sessionId);

const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key');
const clearKeyBtn = document.getElementById('clear-key');
const modelSelect = document.getElementById('model-select');
const messageInput = document.getElementById('message');
const outputBox = document.getElementById('output');
const historyList = document.getElementById('history');
const previewFrame = document.getElementById('response-preview');
const applyPreviewBtn = document.getElementById('apply-preview');
const submitBtn = document.getElementById('submit-btn');

const systemPrompt = [
  'You are the 3dvr portal co-pilot.',
  'Suggest concise, actionable edits.',
  'When providing HTML/CSS/JS, keep it minimal and ready for copy/paste.'
].join(' ');

function loadStoredKey() {
  const stored = localStorage.getItem(apiKeyStorageKey);
  if (stored) {
    apiKeyInput.value = stored;
  }
}

function renderHistoryItem(entry) {
  const listItem = document.createElement('li');
  const prompt = document.createElement('div');
  prompt.textContent = entry.prompt || '[no prompt]';
  const response = document.createElement('div');
  response.textContent = entry.response || '[no response]';
  const meta = document.createElement('div');
  meta.className = 'meta';
  const date = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'unknown time';
  meta.textContent = `Saved ${date}`;
  listItem.appendChild(prompt);
  listItem.appendChild(response);
  listItem.appendChild(meta);
  historyList.prepend(listItem);
}

function startHistorySubscription() {
  transcriptNode.map().once((data) => {
    if (!data) return;
    renderHistoryItem(data);
  });
}

async function sendToOpenAI() {
  const apiKey = apiKeyInput.value.trim();
  const prompt = messageInput.value.trim();
  const model = modelSelect.value;

  if (!apiKey) {
    outputBox.textContent = 'Add your OpenAI API key to start chatting.';
    return;
  }

  if (!prompt) {
    outputBox.textContent = 'Type a prompt to send to the model.';
    return;
  }

  submitBtn.disabled = true;
  outputBox.textContent = 'Sending to OpenAI...';

  const body = {
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No reply received.';
    outputBox.textContent = reply;
    transcriptNode.set({ prompt, response: reply, createdAt: Date.now() });
  } catch (error) {
    outputBox.textContent = `Error: ${error.message}`;
  } finally {
    submitBtn.disabled = false;
  }
}

function applyPreview() {
  const content = outputBox.textContent || '';
  const previewStyle = [
    "<style>body{font-family:'Poppins',sans-serif;padding:16px;",
    "background:#f8fbff;color:#1d1d1f;}a{color:#5ca0d3;}</style>"
  ].join('');
  previewFrame.srcdoc = `${previewStyle}${content}`;
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    outputBox.textContent = 'Enter a valid API key first.';
    return;
  }
  localStorage.setItem(apiKeyStorageKey, key);
  outputBox.textContent = 'API key saved locally.';
});

clearKeyBtn.addEventListener('click', () => {
  localStorage.removeItem(apiKeyStorageKey);
  apiKeyInput.value = '';
  outputBox.textContent = 'API key cleared from this browser.';
});

submitBtn.addEventListener('click', sendToOpenAI);
applyPreviewBtn.addEventListener('click', applyPreview);

loadStoredKey();
startHistorySubscription();
