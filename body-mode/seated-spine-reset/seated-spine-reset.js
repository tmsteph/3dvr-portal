import {
  readBodyModePreferences,
  setBodyModeLastUsed,
  getBodyModeApp,
} from '../body-mode.js';

export const SEATED_SPINE_STEPS = Object.freeze([
  {
    area: 'Arrive',
    title: 'Feet, seat, screen distance',
    duration: 35,
    instruction: 'Place both feet on the ground. Let the chair support you. Move the screen a little farther away.',
    cues: [
      'Let your hands rest somewhere easy.',
      'Notice the weight of your body on the chair.',
      'Unclench the jaw and let the tongue soften.',
    ],
    breath: 'Breathe through the nose if comfortable. Let the exhale be easy.',
  },
  {
    area: 'Neck',
    title: 'Slow side glides',
    duration: 35,
    instruction: 'Keep the chest quiet. Let the right ear drift toward the right shoulder, then return and switch sides.',
    cues: [
      'Move at half speed.',
      'Do not pull on the head.',
      'Keep both shoulders heavy.',
    ],
    breath: 'Exhale as the head returns to center.',
  },
  {
    area: 'Shoulders',
    title: 'Shoulder rolls and release',
    duration: 35,
    instruction: 'Lift the shoulders gently, roll them back, then let them settle down without forcing posture.',
    cues: [
      'Make the circles small enough to feel safe.',
      'Let the shoulder blades slide instead of pinch.',
      'Pause after each roll.',
    ],
    breath: 'Inhale as the shoulders rise. Exhale as they settle.',
  },
  {
    area: 'Spine',
    title: 'Seated cat and neutral',
    duration: 35,
    instruction: 'Round the upper back slightly, then return to a tall neutral seat. Keep the movement smooth.',
    cues: [
      'Move from the ribs, not only the neck.',
      'Keep the pelvis supported.',
      'Stop before strain.',
    ],
    breath: 'Exhale into the round shape. Inhale toward neutral.',
  },
  {
    area: 'Hips',
    title: 'Pelvic rock',
    duration: 35,
    instruction: 'Rock the pelvis forward and back in a small range so the low back remembers it can move.',
    cues: [
      'Keep feet planted.',
      'Let the motion be subtle.',
      'Notice if one side feels different.',
    ],
    breath: 'Let the breath stay quiet and unforced.',
  },
  {
    area: 'Breath',
    title: 'Wide ribs, soft belly',
    duration: 35,
    instruction: 'Place attention around the lower ribs. Let the inhale widen the body and the exhale soften it.',
    cues: [
      'No breath holds are needed.',
      'Let the belly move if it wants to.',
      'Let the face stay easy.',
    ],
    breath: 'Inhale for comfort. Exhale a little longer if that feels calming.',
  },
  {
    area: 'Return',
    title: 'Choose one grounded action',
    duration: 35,
    instruction: 'Look away from the screen. Name one small action you can do next with your body involved.',
    cues: [
      'Drink water.',
      'Stand and take ten steps.',
      'Send one clear message.',
    ],
    breath: 'Take one ordinary breath before returning to work.',
  },
]);

export function getRoutineDuration(steps = SEATED_SPINE_STEPS) {
  return steps.reduce((total, step) => total + step.duration, 0);
}

export function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function calculateRoutineProgress(stepIndex, remainingInStep, steps = SEATED_SPINE_STEPS) {
  const total = getRoutineDuration(steps);
  const completedBeforeStep = steps
    .slice(0, Math.max(0, stepIndex))
    .reduce((sum, step) => sum + step.duration, 0);
  const currentStep = steps[stepIndex] || steps[steps.length - 1];
  const completedInStep = currentStep ? currentStep.duration - Math.max(0, remainingInStep) : 0;
  return Math.max(0, Math.min(1, (completedBeforeStep + completedInStep) / total));
}

function initSeatedSpineReset() {
  if (typeof document === 'undefined') {
    return;
  }

  const refs = {
    timeRemaining: document.getElementById('timeRemaining'),
    stepCounter: document.getElementById('stepCounter'),
    routineProgress: document.getElementById('routineProgress'),
    startPauseButton: document.getElementById('startPauseButton'),
    previousStepButton: document.getElementById('previousStepButton'),
    nextStepButton: document.getElementById('nextStepButton'),
    resetButton: document.getElementById('resetButton'),
    stepList: document.getElementById('stepList'),
    currentStepArea: document.getElementById('currentStepArea'),
    currentStepTitle: document.getElementById('currentStepTitle'),
    currentStepInstruction: document.getElementById('currentStepInstruction'),
    currentStepCues: document.getElementById('currentStepCues'),
    currentBreathCue: document.getElementById('currentBreathCue'),
    lastUsedApp: document.getElementById('lastUsedApp'),
  };

  if (!refs.timeRemaining || !refs.stepList || !refs.startPauseButton) {
    return;
  }

  const state = {
    stepIndex: 0,
    remainingInStep: SEATED_SPINE_STEPS[0].duration,
    running: false,
    completed: false,
    intervalId: null,
  };

  setBodyModeLastUsed('seated-spine-reset');
  updateLastUsedLabel(refs);
  renderStepList(refs, state);
  bindEvents(refs, state);
  renderRoutine(refs, state);
}

function bindEvents(refs, state) {
  refs.startPauseButton.addEventListener('click', () => {
    if (state.completed) {
      resetRoutine(state);
    }
    if (state.running) {
      pauseRoutine(state);
    } else {
      startRoutine(refs, state);
    }
    renderRoutine(refs, state);
  });

  refs.previousStepButton.addEventListener('click', () => {
    pauseRoutine(state);
    goToStep(state, Math.max(0, state.stepIndex - 1));
    renderRoutine(refs, state);
  });

  refs.nextStepButton.addEventListener('click', () => {
    pauseRoutine(state);
    goToStep(state, Math.min(SEATED_SPINE_STEPS.length - 1, state.stepIndex + 1));
    renderRoutine(refs, state);
  });

  refs.resetButton.addEventListener('click', () => {
    pauseRoutine(state);
    resetRoutine(state);
    renderRoutine(refs, state);
  });
}

function startRoutine(refs, state) {
  state.running = true;
  state.completed = false;
  if (state.intervalId) {
    clearInterval(state.intervalId);
  }
  state.intervalId = setInterval(() => {
    tickRoutine(state);
    renderRoutine(refs, state);
  }, 1000);
}

function pauseRoutine(state) {
  state.running = false;
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function resetRoutine(state) {
  state.stepIndex = 0;
  state.remainingInStep = SEATED_SPINE_STEPS[0].duration;
  state.running = false;
  state.completed = false;
}

function goToStep(state, stepIndex) {
  state.stepIndex = stepIndex;
  state.remainingInStep = SEATED_SPINE_STEPS[stepIndex].duration;
  state.completed = false;
}

function tickRoutine(state) {
  if (state.completed) {
    pauseRoutine(state);
    return;
  }

  state.remainingInStep -= 1;
  if (state.remainingInStep > 0) {
    return;
  }

  if (state.stepIndex < SEATED_SPINE_STEPS.length - 1) {
    goToStep(state, state.stepIndex + 1);
    return;
  }

  state.remainingInStep = 0;
  state.completed = true;
  pauseRoutine(state);
}

function getTotalRemaining(state) {
  const afterCurrent = SEATED_SPINE_STEPS
    .slice(state.stepIndex + 1)
    .reduce((total, step) => total + step.duration, 0);
  return state.remainingInStep + afterCurrent;
}

function renderStepList(refs, state) {
  refs.stepList.innerHTML = SEATED_SPINE_STEPS.map((step, index) => `
    <li>
      <button type="button" data-step-index="${index}">
        <strong>${index + 1}. ${escapeHtml(step.area)}</strong><br>
        <span>${escapeHtml(step.title)}</span>
      </button>
    </li>
  `).join('');

  refs.stepList.querySelectorAll('button[data-step-index]').forEach(button => {
    button.addEventListener('click', () => {
      pauseRoutine(state);
      goToStep(state, Number(button.getAttribute('data-step-index')));
      renderRoutine(refs, state);
    });
  });
}

function renderRoutine(refs, state) {
  const step = SEATED_SPINE_STEPS[state.stepIndex];
  const totalRemaining = getTotalRemaining(state);
  const progress = calculateRoutineProgress(state.stepIndex, state.remainingInStep);

  refs.timeRemaining.textContent = formatDuration(totalRemaining);
  refs.stepCounter.textContent = state.completed
    ? 'Routine complete'
    : `Step ${state.stepIndex + 1} of ${SEATED_SPINE_STEPS.length}`;
  refs.routineProgress.style.setProperty('--progress', `${Math.round(progress * 100)}%`);
  refs.startPauseButton.textContent = state.completed ? 'Restart' : (state.running ? 'Pause' : 'Start');
  refs.previousStepButton.disabled = state.stepIndex === 0;
  refs.nextStepButton.disabled = state.stepIndex === SEATED_SPINE_STEPS.length - 1;

  refs.currentStepArea.textContent = step.area;
  refs.currentStepTitle.textContent = step.title;
  refs.currentStepInstruction.textContent = step.instruction;
  refs.currentBreathCue.textContent = step.breath;
  refs.currentStepCues.innerHTML = step.cues.map(cue => `<li>${escapeHtml(cue)}</li>`).join('');

  refs.stepList.querySelectorAll('button[data-step-index]').forEach(button => {
    const isActive = Number(button.getAttribute('data-step-index')) === state.stepIndex;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-current', isActive ? 'step' : 'false');
  });
}

function updateLastUsedLabel(refs) {
  if (!refs.lastUsedApp) {
    return;
  }
  const preferences = readBodyModePreferences();
  const app = getBodyModeApp(preferences.lastUsedApp);
  refs.lastUsedApp.textContent = app ? app.title : 'None yet';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSeatedSpineReset, { once: true });
  } else {
    initSeatedSpineReset();
  }
}
