const taskName = document.querySelector('#task-name');
const taskGoal = document.querySelector('#task-goal');
const includeMic = document.querySelector('#include-mic');
const captureStage = document.querySelector('#capture-stage');
const preview = document.querySelector('#capture-preview');
const placeholder = document.querySelector('#capture-placeholder');
const recordingLabel = document.querySelector('#recording-label');
const recordingTime = document.querySelector('#recording-time');
const captureHint = document.querySelector('#capture-hint');
const startButton = document.querySelector('#start-recording');
const pauseButton = document.querySelector('#pause-recording');
const stopButton = document.querySelector('#stop-recording');
const saveRecording = document.querySelector('#save-recording');
const stepsContainer = document.querySelector('#steps');
const addStepButton = document.querySelector('#add-step');
const successCriteria = document.querySelector('#success-criteria');
const stopConditions = document.querySelector('#stop-conditions');
const generateButton = document.querySelector('#generate-skill');
const skillPanel = document.querySelector('#skill-panel');
const skillOutput = document.querySelector('#skill-output');
const copyButton = document.querySelector('#copy-skill');
const sendOperatorButton = document.querySelector('#send-operator');
const skillStatus = document.querySelector('#skill-status');
const flowItems = [...document.querySelectorAll('.flow li')];

let displayStream = null;
let micStream = null;
let recorder = null;
let chunks = [];
let timer = null;
let recordingStartedAt = 0;
let recordingUrl = '';

function setFlow(step) {
  flowItems.forEach((item, index) => item.classList.toggle('active', index <= step - 1));
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateTimer() {
  recordingTime.textContent = formatDuration(Date.now() - recordingStartedAt);
}

function stopTracks(stream) {
  stream?.getTracks?.().forEach(track => track.stop());
}

function cleanupStreams() {
  stopTracks(displayStream);
  stopTracks(micStream);
  displayStream = null;
  micStream = null;
  if (timer) window.clearInterval(timer);
  timer = null;
}

function chooseMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function safeFilename(value) {
  return String(value || '3dvr-teach')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || '3dvr-teach';
}

function showCaptureError(message) {
  captureStage.dataset.state = 'idle';
  recordingLabel.textContent = 'Not recording';
  captureHint.textContent = message;
  startButton.hidden = false;
  startButton.disabled = false;
  pauseButton.hidden = true;
  stopButton.hidden = true;
  preview.hidden = true;
  placeholder.hidden = false;
}

async function startCapture() {
  if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
    showCaptureError('This browser cannot record the screen here yet. You can still write the steps below and build a skill draft.');
    return;
  }

  startButton.disabled = true;
  captureHint.textContent = 'Choose the screen, window, or tab that contains the task you want to teach.';

  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15, max: 30 } },
      audio: false
    });

    if (includeMic.checked) {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    const recordingStream = new MediaStream([
      ...displayStream.getVideoTracks(),
      ...(micStream?.getAudioTracks() || [])
    ]);
    const mimeType = chooseMimeType();
    recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
    chunks = [];

    recorder.addEventListener('dataavailable', event => {
      if (event.data?.size) chunks.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recordingUrl = URL.createObjectURL(blob);
      preview.srcObject = null;
      preview.src = recordingUrl;
      preview.controls = true;
      preview.muted = false;
      preview.hidden = false;
      placeholder.hidden = true;
      saveRecording.href = recordingUrl;
      saveRecording.download = `${safeFilename(taskName.value)}-demonstration.webm`;
      saveRecording.hidden = false;
      captureStage.dataset.state = 'done';
      recordingLabel.textContent = 'Demonstration captured';
      captureHint.textContent = 'Recording is still only on this device. Add the judgment calls below, then build the skill draft.';
      startButton.hidden = false;
      startButton.disabled = false;
      startButton.textContent = 'Record again';
      pauseButton.hidden = true;
      stopButton.hidden = true;
      cleanupStreams();
      setFlow(2);
    }, { once: true });

    const displayTrack = displayStream.getVideoTracks()[0];
    displayTrack?.addEventListener('ended', finishCapture, { once: true });

    preview.removeAttribute('src');
    preview.srcObject = displayStream;
    preview.controls = false;
    preview.muted = true;
    preview.hidden = false;
    placeholder.hidden = true;
    await preview.play().catch(() => {});

    recorder.start(1000);
    recordingStartedAt = Date.now();
    recordingTime.textContent = '00:00';
    timer = window.setInterval(updateTimer, 500);
    captureStage.dataset.state = 'recording';
    recordingLabel.textContent = 'Recording';
    startButton.hidden = true;
    startButton.disabled = false;
    pauseButton.hidden = false;
    stopButton.hidden = false;
    captureHint.textContent = includeMic.checked
      ? 'Work normally and narrate why you make each important decision.'
      : 'Work normally. Add the important reasoning as steps below when you finish.';
  } catch (error) {
    cleanupStreams();
    const denied = error?.name === 'NotAllowedError';
    showCaptureError(denied
      ? 'Screen or microphone access was not granted. Nothing was recorded.'
      : `Could not start recording: ${error?.message || 'unknown error'}`);
  }
}

function finishCapture() {
  if (!recorder || recorder.state === 'inactive') {
    cleanupStreams();
    return;
  }
  if (timer) window.clearInterval(timer);
  timer = null;
  recorder.stop();
}

function togglePause() {
  if (!recorder) return;
  if (recorder.state === 'recording') {
    recorder.pause();
    captureStage.dataset.state = 'paused';
    recordingLabel.textContent = 'Paused';
    pauseButton.textContent = 'Resume';
  } else if (recorder.state === 'paused') {
    recorder.resume();
    captureStage.dataset.state = 'recording';
    recordingLabel.textContent = 'Recording';
    pauseButton.textContent = 'Pause';
  }
}

function renumberSteps() {
  [...stepsContainer.querySelectorAll('.step-card')].forEach((card, index) => {
    card.dataset.order = String(index + 1);
    card.querySelector('[data-step-title]').textContent = `Step ${index + 1}`;
  });
}

function addStep(values = {}) {
  const card = document.createElement('article');
  card.className = 'step-card';

  const head = document.createElement('div');
  head.className = 'step-card__head';
  const title = document.createElement('strong');
  title.dataset.stepTitle = '';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    card.remove();
    renumberSteps();
  });
  head.append(title, remove);

  const fields = document.createElement('div');
  fields.className = 'step-card__fields';
  const actionLabel = document.createElement('label');
  const actionTitle = document.createElement('span');
  actionTitle.textContent = 'What I did';
  const action = document.createElement('textarea');
  action.rows = 3;
  action.dataset.stepAction = '';
  action.placeholder = 'Checked the dates against my calendar before replying.';
  action.value = values.action || '';
  actionLabel.append(actionTitle, action);

  const whyLabel = document.createElement('label');
  const whyTitle = document.createElement('span');
  whyTitle.textContent = 'Why / what to notice';
  const why = document.createElement('textarea');
  why.rows = 3;
  why.dataset.stepWhy = '';
  why.placeholder = 'A conflict matters more than speed; never confirm until both days are clear.';
  why.value = values.why || '';
  whyLabel.append(whyTitle, why);

  fields.append(actionLabel, whyLabel);
  card.append(head, fields);
  stepsContainer.append(card);
  renumberSteps();
  return card;
}

function lines(value) {
  return String(value || '')
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function collectSteps() {
  return [...stepsContainer.querySelectorAll('.step-card')]
    .map((card, index) => ({
      order: index + 1,
      action: card.querySelector('[data-step-action]').value.trim(),
      reasoning: card.querySelector('[data-step-why]').value.trim()
    }))
    .filter(step => step.action || step.reasoning);
}

function buildSkillDraft() {
  const draft = {
    schema: '3dvr.skill.v1',
    name: taskName.value.trim() || 'Untitled demonstrated task',
    goal: taskGoal.value.trim(),
    source: {
      method: 'screen-demonstration',
      recording: recordingUrl ? 'captured-device-only' : 'not-attached',
      narration: Boolean(includeMic.checked)
    },
    trust: {
      status: 'draft',
      humanReviewRequired: true,
      recordingUploaded: false
    },
    steps: collectSteps(),
    successCriteria: lines(successCriteria.value),
    stopConditions: lines(stopConditions.value),
    execution: {
      defaultMode: 'preview',
      requireApprovalFor: [
        'external communication',
        'payments or purchases',
        'account or permission changes',
        'destructive actions'
      ]
    }
  };

  skillOutput.value = JSON.stringify(draft, null, 2);
  skillPanel.hidden = false;
  skillStatus.textContent = 'Draft generated locally. Review and edit it before handing it to Operator.';
  setFlow(3);
  skillPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copySkill() {
  if (!skillOutput.value.trim()) return;
  try {
    await navigator.clipboard.writeText(skillOutput.value);
    skillStatus.textContent = 'Skill draft copied.';
  } catch {
    skillOutput.focus();
    skillOutput.select();
    skillStatus.textContent = 'Select the draft and copy it from your browser.';
  }
}

function sendToOperator() {
  const draft = skillOutput.value.trim();
  if (!draft) return;
  const prompt = [
    'I used 3DVR Teach to demonstrate a real task.',
    'Turn this reviewed draft into a reusable Operator skill.',
    'Validate missing steps and success criteria before execution.',
    'Keep risky external actions approval-gated and test the skill before trusting it.',
    '',
    draft
  ].join('\n');
  sessionStorage.setItem('3dvr.teach.operatorPrompt', prompt);
  window.location.href = '/operator/?teach=1';
}

startButton.addEventListener('click', startCapture);
pauseButton.addEventListener('click', togglePause);
stopButton.addEventListener('click', finishCapture);
addStepButton.addEventListener('click', () => addStep());
generateButton.addEventListener('click', buildSkillDraft);
copyButton.addEventListener('click', copySkill);
sendOperatorButton.addEventListener('click', sendToOperator);
window.addEventListener('pagehide', () => cleanupStreams());

addStep({
  action: '',
  why: ''
});
