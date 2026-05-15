const preview = document.getElementById('sitePreview');
const cssOutput = document.getElementById('cssOutput');
const contrastBadge = document.getElementById('contrastBadge');
const spacingRange = document.getElementById('spacingRange');
const radiusRange = document.getElementById('radiusRange');
const typeRange = document.getElementById('typeRange');
const spacingValue = document.getElementById('spacingValue');
const radiusValue = document.getElementById('radiusValue');
const typeValue = document.getElementById('typeValue');
const headlineInput = document.getElementById('headlineInput');
const bodyInput = document.getElementById('bodyInput');
const previewHeadline = document.getElementById('previewHeadline');
const previewBody = document.getElementById('previewBody');
const copyCss = document.getElementById('copyCss');

const themes = {
  harbor: {
    bg: '#f3fbfa',
    text: '#16202f',
    muted: '#5b6977',
    accent: '#136f6f',
    accent2: '#2f6fed',
    warm: '#c78914',
  },
  orchard: {
    bg: '#fff8f5',
    text: '#211d19',
    muted: '#75645a',
    accent: '#557a46',
    accent2: '#e45d4f',
    warm: '#b7791f',
  },
  signal: {
    bg: '#f8f7ff',
    text: '#181924',
    muted: '#5e6073',
    accent: '#6d4de0',
    accent2: '#0f8f7e',
    warm: '#d97706',
  },
};

const state = {
  layout: 'landing',
  theme: 'harbor',
  spacing: 24,
  radius: 8,
  typeScale: 1,
};

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function channelToLinear(value) {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function setPressed(selector, activeValue, dataName) {
  document.querySelectorAll(selector).forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset[dataName] === activeValue));
  });
}

function buildCss() {
  const theme = themes[state.theme];
  const layoutRule = state.layout === 'gallery'
    ? 'grid-template-columns: 1fr;'
    : state.layout === 'dashboard'
      ? 'grid-template-columns: 0.65fr 1fr;'
      : 'grid-template-columns: minmax(0, 1.1fr) minmax(220px, 0.75fr);';

  return `.page {
  color: ${theme.text};
  background: ${theme.bg};
  --space: ${state.spacing}px;
  --radius: ${state.radius}px;
  --type-scale: ${state.typeScale.toFixed(2)};
}

.hero {
  display: grid;
  ${layoutRule}
  gap: var(--space);
}

.button {
  border-radius: var(--radius);
  background: ${theme.accent};
  color: white;
}

.card {
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, ${theme.accent} 22%, transparent);
}`;
}

function updateContrast(theme) {
  const ratio = contrastRatio('#ffffff', theme.accent);
  const rounded = ratio.toFixed(1);
  const passes = ratio >= 4.5;
  contrastBadge.textContent = `${passes ? 'AA' : 'Check'} contrast ${rounded}:1`;
  contrastBadge.style.background = passes ? '#e8f7ef' : '#fff1d6';
  contrastBadge.style.color = passes ? '#0d6b3c' : '#815400';
}

function render() {
  const theme = themes[state.theme];
  preview.className = `site-preview site-preview--${state.layout} theme-${state.theme}`;
  preview.style.setProperty('--preview-space', `${state.spacing}px`);
  preview.style.setProperty('--preview-radius', `${state.radius}px`);
  preview.style.setProperty('--preview-type', state.typeScale.toFixed(2));

  spacingValue.textContent = `${state.spacing}px`;
  radiusValue.textContent = `${state.radius}px`;
  typeValue.textContent = state.typeScale.toFixed(2);
  previewHeadline.textContent = headlineInput.value.trim() || 'Build clearer pages faster';
  previewBody.textContent = bodyInput.value.trim() || 'A strong page gives people orientation, one useful action, and enough structure to understand what comes next.';
  cssOutput.textContent = buildCss();

  updateContrast(theme);
  setPressed('[data-layout]', state.layout, 'layout');
  setPressed('[data-theme]', state.theme, 'theme');
}

document.querySelectorAll('[data-layout]').forEach((button) => {
  button.addEventListener('click', () => {
    state.layout = button.dataset.layout;
    render();
  });
});

document.querySelectorAll('[data-theme]').forEach((button) => {
  button.addEventListener('click', () => {
    state.theme = button.dataset.theme;
    render();
  });
});

spacingRange.addEventListener('input', () => {
  state.spacing = Number(spacingRange.value);
  render();
});

radiusRange.addEventListener('input', () => {
  state.radius = Number(radiusRange.value);
  render();
});

typeRange.addEventListener('input', () => {
  state.typeScale = Number(typeRange.value);
  render();
});

headlineInput.addEventListener('input', render);
bodyInput.addEventListener('input', render);

copyCss.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(cssOutput.textContent);
    copyCss.textContent = 'Copied';
    setTimeout(() => {
      copyCss.textContent = 'Copy CSS';
    }, 1400);
  } catch {
    copyCss.textContent = 'Select CSS';
  }
});

render();
