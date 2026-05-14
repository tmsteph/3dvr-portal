const tokenInput = document.getElementById('tokenInput');
const focusToken = document.getElementById('focusToken');
const temperature = document.getElementById('temperature');
const temperatureValue = document.getElementById('temperatureValue');
const headMix = document.getElementById('headMix');
const headMixValue = document.getElementById('headMixValue');
const focusSummary = document.getElementById('focusSummary');
const canvas = document.getElementById('attentionCanvas');
const heatmap = document.getElementById('heatmap');
const context = canvas.getContext('2d');

const headLabels = ['syntax', 'semantic', 'position'];

function tokenize(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^\w'-]/g, '').toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

function hashToken(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function embeddingFor(token, index, total, mode) {
  const hash = hashToken(token);
  const vowels = (token.match(/[aeiou]/g) || []).length;
  const consonants = Math.max(token.length - vowels, 1);
  const position = total <= 1 ? 0 : index / (total - 1);
  const base = [
    ((hash & 255) / 255) * 2 - 1,
    (((hash >>> 8) & 255) / 255) * 2 - 1,
    (vowels / Math.max(token.length, 1)) * 2 - 1,
    (consonants / Math.max(token.length, 1)) * 2 - 1,
  ];

  if (mode === 1) {
    base[0] += token.length / 8;
    base[2] += vowels > 0 ? 0.45 : -0.25;
  }

  if (mode === 2) {
    base[1] += 1 - Math.abs(position - 0.5) * 2;
    base[3] += position;
  }

  return base;
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function softmax(values, temp) {
  const scaled = values.map((value) => value / temp);
  const max = Math.max(...scaled);
  const exps = scaled.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function buildMatrix(tokens, temp, mode) {
  const embeddings = tokens.map((token, index) => embeddingFor(token, index, tokens.length, mode));
  return embeddings.map((query) => {
    const scores = embeddings.map((key) => dot(query, key) / Math.sqrt(query.length));
    return softmax(scores, temp);
  });
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(300, Math.floor((rect.width * 0.46) * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: rect.width, height: canvas.height / ratio };
}

function drawCanvas(tokens, matrix, selectedIndex) {
  const { width, height } = resizeCanvas();
  context.clearRect(0, 0, width, height);

  const padding = Math.min(78, Math.max(28, width * 0.08));
  const y = height * 0.68;
  const spacing = tokens.length <= 1 ? 0 : (width - padding * 2) / (tokens.length - 1);
  const points = tokens.map((token, index) => ({
    token,
    x: padding + spacing * index,
    y,
  }));

  const query = points[selectedIndex];
  const weights = matrix[selectedIndex] || [];

  weights.forEach((weight, index) => {
    if (index === selectedIndex || weight < 0.035) return;
    const target = points[index];
    const controlY = height * (0.12 + (1 - weight) * 0.18);
    context.beginPath();
    context.moveTo(query.x, query.y - 26);
    context.quadraticCurveTo((query.x + target.x) / 2, controlY, target.x, target.y - 26);
    context.strokeStyle = `rgba(34, 211, 238, ${Math.min(0.95, 0.18 + weight * 2.7)})`;
    context.lineWidth = 1 + weight * 12;
    context.stroke();
  });

  points.forEach((point, index) => {
    const isSelected = index === selectedIndex;
    const weight = weights[index] || 0;
    context.beginPath();
    context.arc(point.x, point.y, isSelected ? 26 : 22 + weight * 16, 0, Math.PI * 2);
    context.fillStyle = isSelected ? '#22d3ee' : `rgba(134, 239, 172, ${0.28 + weight * 1.8})`;
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = 'rgba(226, 232, 240, 0.38)';
    context.stroke();
    context.fillStyle = isSelected ? '#06101c' : '#e5eefb';
    context.font = '700 14px Segoe UI, sans-serif';
    context.textAlign = 'center';
    context.fillText(point.token, point.x, point.y + 5);
  });
}

function renderHeatmap(tokens, matrix) {
  heatmap.innerHTML = '';
  heatmap.style.setProperty('--token-count', tokens.length);

  const header = document.createElement('div');
  header.className = 'heatmap-row';
  header.appendChild(labelCell('Q/K'));
  tokens.forEach((token) => header.appendChild(labelCell(token)));
  heatmap.appendChild(header);

  matrix.forEach((row, rowIndex) => {
    const rowNode = document.createElement('div');
    rowNode.className = 'heatmap-row';
    rowNode.appendChild(labelCell(tokens[rowIndex]));
    row.forEach((weight) => {
      const cell = document.createElement('span');
      cell.className = 'heatmap-cell';
      cell.textContent = weight.toFixed(2);
      cell.style.background = `rgba(34, 211, 238, ${0.18 + weight * 0.9})`;
      rowNode.appendChild(cell);
    });
    heatmap.appendChild(rowNode);
  });
}

function labelCell(text) {
  const cell = document.createElement('span');
  cell.className = 'heatmap-label';
  cell.textContent = text;
  return cell;
}

function syncFocusOptions(tokens) {
  const previous = focusToken.value;
  focusToken.innerHTML = '';
  tokens.forEach((token, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${index + 1}. ${token}`;
    focusToken.appendChild(option);
  });

  if (previous && Number(previous) < tokens.length) {
    focusToken.value = previous;
  } else {
    focusToken.value = String(Math.min(2, tokens.length - 1));
  }
}

function updateSummary(tokens, matrix, selectedIndex) {
  const row = matrix[selectedIndex] || [];
  const strongest = row
    .map((weight, index) => ({ weight, index }))
    .filter((entry) => entry.index !== selectedIndex)
    .sort((left, right) => right.weight - left.weight)[0];

  if (!strongest) {
    focusSummary.textContent = `${tokens[selectedIndex]} has no other token to attend to`;
    return;
  }

  focusSummary.textContent = `${tokens[selectedIndex]} attends most to ${tokens[strongest.index]} (${strongest.weight.toFixed(2)})`;
}

function render() {
  const tokens = tokenize(tokenInput.value);
  if (tokens.length === 0) {
    tokenInput.value = 'the cat sat';
    return render();
  }

  syncFocusOptions(tokens);
  const selectedIndex = Math.min(Number(focusToken.value) || 0, tokens.length - 1);
  const temp = Number(temperature.value);
  const mode = Number(headMix.value);
  const matrix = buildMatrix(tokens, temp, mode);

  temperatureValue.textContent = temp.toFixed(2);
  headMixValue.textContent = headLabels[mode];
  drawCanvas(tokens, matrix, selectedIndex);
  renderHeatmap(tokens, matrix);
  updateSummary(tokens, matrix, selectedIndex);
}

tokenInput.addEventListener('input', render);
focusToken.addEventListener('change', render);
temperature.addEventListener('input', render);
headMix.addEventListener('input', render);
window.addEventListener('resize', render);

render();
