const gun = Gun();
const apiKeyStorageKey = 'openai-api-key';
const vercelTokenStorageKey = 'vercel-token';
const githubTokenStorageKey = 'github-token';
const sessionKey = 'openai-workbench-session';
const storedSession = localStorage.getItem(sessionKey);
const sessionId = storedSession || Gun.text.random();
localStorage.setItem(sessionKey, sessionId);
// Gun graph: ai/workbench/<sessionId> -> { prompt, response, createdAt }
const transcriptNode = gun.get('ai').get('workbench').get(sessionId);
const deploymentNode = gun.get('ai').get('vercel').get(sessionId);
const githubNode = gun.get('ai').get('github').get(sessionId);

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
const vercelTokenInput = document.getElementById('vercel-token');
const saveVercelBtn = document.getElementById('save-vercel');
const clearVercelBtn = document.getElementById('clear-vercel');
const projectInput = document.getElementById('vercel-project');
const deployNoteInput = document.getElementById('deploy-note');
const deployBtn = document.getElementById('deploy-btn');
const vercelStatus = document.getElementById('vercel-status');
const deploymentsList = document.getElementById('deployments');
const githubTokenInput = document.getElementById('github-token');
const saveGithubBtn = document.getElementById('save-github');
const clearGithubBtn = document.getElementById('clear-github');
const githubRepoInput = document.getElementById('github-repo');
const githubBranchInput = document.getElementById('github-branch');
const githubPathInput = document.getElementById('github-path');
const githubMessageInput = document.getElementById('github-message');
const githubBtn = document.getElementById('github-btn');
const githubStatus = document.getElementById('github-status');
const githubHistoryList = document.getElementById('github-history');

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

function loadStoredVercelToken() {
  const stored = localStorage.getItem(vercelTokenStorageKey);
  if (stored) {
    vercelTokenInput.value = stored;
  }
}

function loadStoredGithubToken() {
  const stored = localStorage.getItem(githubTokenStorageKey);
  if (stored) {
    githubTokenInput.value = stored;
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

function renderDeploymentItem(entry) {
  const listItem = document.createElement('li');

  const title = document.createElement('div');
  title.textContent = entry.projectName || 'Untitled project';
  listItem.appendChild(title);

  const links = document.createElement('div');
  links.className = 'meta-row';

  if (entry.url) {
    const liveLink = document.createElement('a');
    liveLink.href = entry.url;
    liveLink.target = '_blank';
    liveLink.rel = 'noopener noreferrer';
    liveLink.textContent = 'View site';
    links.appendChild(liveLink);
  }

  if (entry.inspectUrl) {
    const inspectLink = document.createElement('a');
    inspectLink.href = entry.inspectUrl;
    inspectLink.target = '_blank';
    inspectLink.rel = 'noopener noreferrer';
    inspectLink.textContent = 'Inspect deployment';
    links.appendChild(inspectLink);
  }

  const meta = document.createElement('div');
  meta.className = 'meta-row';

  const created = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'unknown time';
  const createdText = document.createElement('span');
  createdText.textContent = `Deployed ${created}`;
  meta.appendChild(createdText);

  if (entry.note) {
    const note = document.createElement('span');
    note.textContent = `Note: ${entry.note}`;
    meta.appendChild(note);
  }

  listItem.appendChild(links);
  listItem.appendChild(meta);

  deploymentsList.prepend(listItem);
}

function renderGithubCommit(entry) {
  const listItem = document.createElement('li');

  const title = document.createElement('div');
  title.textContent = entry.repo || 'Unknown repo';
  listItem.appendChild(title);

  const links = document.createElement('div');
  links.className = 'meta-row';

  if (entry.htmlUrl) {
    const fileLink = document.createElement('a');
    fileLink.href = entry.htmlUrl;
    fileLink.target = '_blank';
    fileLink.rel = 'noopener noreferrer';
    fileLink.textContent = entry.path || 'View file';
    links.appendChild(fileLink);
  }

  const meta = document.createElement('div');
  meta.className = 'meta-row';
  const created = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'unknown time';
  const createdText = document.createElement('span');
  createdText.textContent = `Committed ${created}`;
  meta.appendChild(createdText);

  if (entry.branch) {
    const branch = document.createElement('span');
    branch.textContent = `Branch: ${entry.branch}`;
    meta.appendChild(branch);
  }

  if (entry.message) {
    const message = document.createElement('span');
    message.textContent = `Message: ${entry.message}`;
    meta.appendChild(message);
  }

  listItem.appendChild(links);
  listItem.appendChild(meta);

  githubHistoryList.prepend(listItem);
}

function startHistorySubscription() {
  transcriptNode.map().once((data) => {
    if (!data) return;
    renderHistoryItem(data);
  });
}

function startDeploymentSubscription() {
  deploymentNode.map().once((data) => {
    if (!data || !data.id) return;
    renderDeploymentItem(data);
  });
}

function startGithubSubscription() {
  githubNode.map().once((data) => {
    if (!data || !data.commitSha) return;
    renderGithubCommit(data);
  });
}

function setVercelStatus(message) {
  vercelStatus.textContent = message;
}

function setGithubStatus(message) {
  githubStatus.textContent = message;
}

function persistDeployment(entry) {
  const id = entry.id || Gun.text.random();
  const record = {
    ...entry,
    id,
    createdAt: entry.createdAt || Date.now(),
  };

  deploymentNode.get(id).put(record);
  return record;
}

function persistGithubCommit(entry) {
  const id = entry.commitSha || Gun.text.random();
  const record = {
    ...entry,
    id,
    createdAt: entry.createdAt || Date.now(),
  };

  // Gun graph: ai/github/<sessionId>/<commitSha>
  githubNode.get(id).put(record);
  return record;
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

async function deployCurrentResponse() {
  const token = vercelTokenInput.value.trim();
  const projectName = projectInput.value.trim();
  const note = deployNoteInput.value.trim();
  const html = (outputBox.textContent || '').trim();

  if (!token) {
    setVercelStatus('Add your Vercel token to deploy.');
    return;
  }

  if (!projectName) {
    setVercelStatus('Name the Vercel project before deploying.');
    return;
  }

  if (!html || html.length < 20 || !html.toLowerCase().includes('<html')) {
    setVercelStatus('Generate HTML in the response before deploying to Vercel.');
    return;
  }

  deployBtn.disabled = true;
  setVercelStatus('Deploying to Vercel...');

  try {
    const response = await fetch('/api/vercel-deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, projectName, html })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deploy error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    persistDeployment({
      id: data.id,
      projectName,
      url: data.url,
      inspectUrl: data.inspectUrl,
      note,
      createdAt: data.createdAt
    });

    setVercelStatus(data.url ? `Deployment live at ${data.url}` : 'Deployment created.');
  } catch (error) {
    setVercelStatus(`Error: ${error.message}`);
  } finally {
    deployBtn.disabled = false;
  }
}

async function publishToGithub() {
  const token = githubTokenInput.value.trim();
  const repo = githubRepoInput.value.trim();
  const branch = githubBranchInput.value.trim() || 'main';
  const path = githubPathInput.value.trim() || 'index.html';
  const message = githubMessageInput.value.trim();
  const html = (outputBox.textContent || '').trim();

  if (!token) {
    setGithubStatus('Add your GitHub token to publish.');
    return;
  }

  if (!repo || !repo.includes('/')) {
    setGithubStatus('Provide the repo in the form owner/name.');
    return;
  }

  if (!html || html.length < 20 || !html.toLowerCase().includes('<html')) {
    setGithubStatus('Generate HTML in the response before publishing to GitHub.');
    return;
  }

  githubBtn.disabled = true;
  setGithubStatus('Publishing to GitHub...');

  try {
    const response = await fetch('/api/github-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, repo, branch, path, content: html, message })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    persistGithubCommit({
      commitSha: data.commitSha,
      repo: data.repo,
      path: data.path,
      branch: data.branch,
      htmlUrl: data.htmlUrl,
      message: data.message,
      createdAt: data.createdAt,
    });

    setGithubStatus(data.htmlUrl ? `Committed to ${data.htmlUrl}` : 'Commit created.');
  } catch (error) {
    setGithubStatus(`Error: ${error.message}`);
  } finally {
    githubBtn.disabled = false;
  }
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
saveVercelBtn.addEventListener('click', () => {
  const token = vercelTokenInput.value.trim();
  if (!token) {
    setVercelStatus('Enter a valid Vercel token first.');
    return;
  }

  localStorage.setItem(vercelTokenStorageKey, token);
  setVercelStatus('Vercel token saved locally.');
});

clearVercelBtn.addEventListener('click', () => {
  localStorage.removeItem(vercelTokenStorageKey);
  vercelTokenInput.value = '';
  setVercelStatus('Vercel token cleared from this browser.');
});

deployBtn.addEventListener('click', deployCurrentResponse);

saveGithubBtn.addEventListener('click', () => {
  const token = githubTokenInput.value.trim();
  if (!token) {
    setGithubStatus('Enter a valid GitHub token first.');
    return;
  }

  localStorage.setItem(githubTokenStorageKey, token);
  setGithubStatus('GitHub token saved locally.');
});

clearGithubBtn.addEventListener('click', () => {
  localStorage.removeItem(githubTokenStorageKey);
  githubTokenInput.value = '';
  setGithubStatus('GitHub token cleared from this browser.');
});

githubBtn.addEventListener('click', publishToGithub);

loadStoredKey();
loadStoredVercelToken();
loadStoredGithubToken();
startHistorySubscription();
startDeploymentSubscription();
startGithubSubscription();
