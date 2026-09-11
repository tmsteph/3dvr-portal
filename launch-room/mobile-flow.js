const form = document.getElementById('movementBriefForm');
const questions = Array.from(document.querySelectorAll('[data-question-step]'));
const progress = document.querySelector('[data-mobile-progress]');
const stepText = document.querySelector('[data-step-text]');
const stepBar = document.querySelector('[data-step-bar]');
const stepActions = document.querySelector('[data-mobile-step-actions]');
const backButton = document.querySelector('[data-step-back]');
const nextButton = document.querySelector('[data-step-next]');
const briefPanel = document.querySelector('[data-brief-panel]');
const clearButton = document.querySelector('[data-action="clear"]');
const editButton = document.querySelector('[data-action="edit-answers"]');
const mobileQuery = window.matchMedia('(max-width: 720px)');

let currentStep = 0;

function activeControl() {
  return questions[currentStep]?.querySelector('input, textarea, select');
}

function updateMobileFlow({ focus = false } = {}) {
  const isMobile = mobileQuery.matches;

  document.body.toggleAttribute('data-mobile-flow', isMobile);
  form?.classList.toggle('is-mobile-flow', isMobile);

  if (!form || !questions.length) return;

  if (!isMobile) {
    questions.forEach(question => {
      question.hidden = false;
    });
    progress.hidden = true;
    stepActions.hidden = true;
    form.classList.remove('is-last-question');
    return;
  }

  currentStep = Math.max(0, Math.min(currentStep, questions.length - 1));

  questions.forEach((question, index) => {
    question.hidden = index !== currentStep;
  });

  progress.hidden = false;
  stepActions.hidden = false;
  form.classList.toggle('is-last-question', currentStep === questions.length - 1);

  stepText.textContent = `Question ${currentStep + 1} of ${questions.length}`;
  stepBar.style.width = `${((currentStep + 1) / questions.length) * 100}%`;
  backButton.disabled = currentStep === 0;
  nextButton.hidden = currentStep === questions.length - 1;

  if (focus) {
    activeControl()?.focus({ preventScroll: true });
  }
}

function moveToStep(nextStep) {
  currentStep = Math.max(0, Math.min(nextStep, questions.length - 1));
  updateMobileFlow({ focus: true });
  questions[currentStep]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

nextButton?.addEventListener('click', () => moveToStep(currentStep + 1));
backButton?.addEventListener('click', () => moveToStep(currentStep - 1));

clearButton?.addEventListener('click', () => {
  currentStep = 0;
  briefPanel?.removeAttribute('data-generated');
  updateMobileFlow({ focus: mobileQuery.matches });
});

editButton?.addEventListener('click', () => {
  if (mobileQuery.matches) {
    moveToStep(0);
  } else {
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

form?.addEventListener('submit', () => {
  briefPanel?.setAttribute('data-generated', 'true');
}, { capture: true });

if (typeof mobileQuery.addEventListener === 'function') {
  mobileQuery.addEventListener('change', () => updateMobileFlow());
} else {
  mobileQuery.addListener(() => updateMobileFlow());
}

updateMobileFlow();
