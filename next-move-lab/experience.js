const MODE_TONES = Object.freeze({
  career: 196,
  startup: 220,
  build: 174.61
});

function audioConstructor() {
  return window.AudioContext || window.webkitAudioContext || null;
}

export function createCompassExperience({ form, soundToggle }) {
  let audio = null;
  let soundOn = false;
  let modeTone = MODE_TONES.career;
  let completedFields = new WeakSet();

  function makeAudio() {
    if (audio) return audio;
    const AudioContext = audioConstructor();
    if (!AudioContext) return null;

    const context = new AudioContext();
    const master = context.createGain();
    const filter = context.createBiquadFilter();
    const warm = context.createOscillator();
    const air = context.createOscillator();
    const warmGain = context.createGain();
    const airGain = context.createGain();

    master.gain.value = 0.0001;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    warm.type = 'sine';
    warm.frequency.value = modeTone / 2;
    warmGain.gain.value = 0.05;
    air.type = 'triangle';
    air.frequency.value = modeTone;
    airGain.gain.value = 0.012;

    warm.connect(warmGain);
    warmGain.connect(filter);
    air.connect(airGain);
    airGain.connect(filter);
    filter.connect(master);
    master.connect(context.destination);
    warm.start();
    air.start();

    audio = { context, master, filter, warm, air };
    return audio;
  }

  function setPadTone(tone) {
    modeTone = tone;
    if (!audio) return;
    const now = audio.context.currentTime;
    audio.warm.frequency.setTargetAtTime(tone / 2, now, 0.35);
    audio.air.frequency.setTargetAtTime(tone, now, 0.35);
  }

  function playTone(ratio = 1, delay = 0, length = 0.7) {
    if (!soundOn || !audio) return;
    const now = audio.context.currentTime + delay;
    const oscillator = audio.context.createOscillator();
    const gain = audio.context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(modeTone * ratio, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    oscillator.connect(gain);
    gain.connect(audio.filter);
    oscillator.start(now);
    oscillator.stop(now + length + 0.05);
  }

  function playStep(step) {
    const notes = [1, 1.125, 1.25, 1.5];
    playTone(notes[Math.max(0, Math.min(step - 1, notes.length - 1))], 0, 0.45);
  }

  function playReveal() {
    [1, 1.25, 1.5, 2].forEach((ratio, index) => playTone(ratio, index * 0.11, 1.1));
  }

  async function setSound(enabled) {
    if (enabled && !makeAudio()) {
      soundToggle.disabled = true;
      soundToggle.querySelector('b').textContent = 'No sound';
      return;
    }

    soundOn = enabled;
    if (enabled) await audio.context.resume();
    const now = audio.context.currentTime;
    audio.master.gain.cancelScheduledValues(now);
    audio.master.gain.setTargetAtTime(enabled ? 0.16 : 0.0001, now, 0.08);
    soundToggle.setAttribute('aria-pressed', String(enabled));
    soundToggle.querySelector('b').textContent = enabled ? 'Sound on' : 'Sound off';
    document.body.classList.toggle('has-sound', enabled);
    if (enabled) playTone(1.5, 0.03, 0.6);
  }

  function progress() {
    const hasMode = Boolean(form.querySelector('input[name="mode"]:checked'));
    const answers = [...form.querySelectorAll('textarea')].filter(field => field.value.trim()).length;
    return Number(hasMode) + answers;
  }

  function paintProgress() {
    const value = progress();
    document.body.dataset.progress = String(value);
    document.documentElement.style.setProperty('--journey', String(value / 4));
  }

  form.querySelectorAll('input[name="mode"]').forEach((input, index) => {
    input.addEventListener('change', () => {
      document.body.dataset.mode = input.value;
      setPadTone(MODE_TONES[input.value] || MODE_TONES.career);
      paintProgress();
      playStep(index + 1);
    });
  });

  form.querySelectorAll('textarea').forEach(field => {
    field.addEventListener('input', paintProgress);
    field.addEventListener('change', () => {
      if (!field.value.trim() || completedFields.has(field)) return;
      completedFields.add(field);
      playStep(progress());
    });
  });

  soundToggle.addEventListener('click', () => setSound(!soundOn));
  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    if (document.hidden) audio.context.suspend();
    else if (soundOn) audio.context.resume();
  });

  paintProgress();

  return {
    setThinking(thinking) {
      document.body.classList.toggle('is-thinking', thinking);
      if (!audio) return;
      const now = audio.context.currentTime;
      audio.filter.frequency.setTargetAtTime(thinking ? 1700 : 900, now, 0.35);
    },
    reveal() {
      document.body.classList.remove('is-thinking');
      document.body.classList.add('has-result');
      playReveal();
    },
    reset() {
      completedFields = new WeakSet();
      document.body.classList.remove('is-thinking', 'has-result');
      document.body.dataset.mode = '';
      document.body.dataset.progress = '0';
      document.documentElement.style.setProperty('--journey', '0');
      setPadTone(MODE_TONES.career);
    }
  };
}
