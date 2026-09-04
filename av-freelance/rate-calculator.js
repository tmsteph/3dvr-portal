export function calculateDayRate({
  hourlyRate,
  baseHours,
  overtimeHours = 0,
  dailyCosts = 0,
  bufferPercent = 0,
  overtimeMultiplier = 1.5
}) {
  const values = [hourlyRate, baseHours, overtimeHours, dailyCosts, bufferPercent, overtimeMultiplier];
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) {
    throw new TypeError('Rate calculator values must be non-negative numbers.');
  }

  const straightTime = hourlyRate * baseHours;
  const overtime = hourlyRate * overtimeMultiplier * overtimeHours;
  const beforeBuffer = straightTime + overtime + dailyCosts;
  const total = beforeBuffer * (1 + (bufferPercent / 100));
  const suggestedRate = Math.ceil(total / 25) * 25;

  return {
    straightTime,
    overtime,
    dailyCosts,
    beforeBuffer,
    suggestedRate
  };
}

function money(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function attachCalculator(form) {
  const result = form.querySelector('[data-rate-result]');
  if (!result) return;

  const strong = result.querySelector('strong');
  const detail = result.querySelector('p');

  const update = () => {
    const data = new FormData(form);

    try {
      const calculation = calculateDayRate({
        hourlyRate: Number(data.get('hourlyRate')),
        baseHours: Number(data.get('baseHours')),
        overtimeHours: Number(data.get('overtimeHours')),
        dailyCosts: Number(data.get('dailyCosts')),
        bufferPercent: Number(data.get('bufferPercent'))
      });

      strong.textContent = `${money(calculation.suggestedRate)} / day`;
      detail.textContent = `${money(calculation.beforeBuffer)} before the business buffer, rounded up to the next $25.`;
    } catch {
      strong.textContent = 'Check your numbers';
      detail.textContent = 'Use zero or positive numbers in every field.';
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    update();
  });

  form.addEventListener('input', update);
  update();
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-rate-calculator]').forEach(attachCalculator);
}
