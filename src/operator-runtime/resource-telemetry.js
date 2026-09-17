export const DEFAULT_RESOURCE_LIMITS = Object.freeze({
  minAvailableMemoryMb: 1536,
  maxSwapUsedPct: 85,
  maxBrowserProcesses: 48,
  maxLoadPerCpu: 1.25
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percent(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function normalizeResourceTelemetry(input = {}) {
  const memoryTotalMb = Math.max(0, finite(input.memoryTotalMb));
  const memoryAvailableMb = Math.max(0, finite(input.memoryAvailableMb));
  const swapTotalMb = Math.max(0, finite(input.swapTotalMb));
  const swapUsedMb = Math.max(0, finite(input.swapUsedMb));
  const cpuCount = Math.max(1, Math.floor(finite(input.cpuCount, 1)));
  const load1 = Math.max(0, finite(input.load1));

  return {
    memoryTotalMb,
    memoryAvailableMb,
    memoryAvailablePct: percent(memoryAvailableMb, memoryTotalMb),
    swapTotalMb,
    swapUsedMb,
    swapUsedPct: percent(swapUsedMb, swapTotalMb),
    browserProcesses: Math.max(0, Math.floor(finite(input.browserProcesses))),
    load1,
    cpuCount,
    loadPerCpu: load1 / cpuCount,
    observedAt: String(input.observedAt || new Date().toISOString())
  };
}

export function evaluateResourcePressure(input = {}, limits = DEFAULT_RESOURCE_LIMITS) {
  const telemetry = normalizeResourceTelemetry(input);
  const reasons = [];

  if (telemetry.memoryAvailableMb < limits.minAvailableMemoryMb) reasons.push('memory-reserve');
  if (telemetry.swapUsedPct >= limits.maxSwapUsedPct) reasons.push('swap-pressure');
  if (telemetry.browserProcesses >= limits.maxBrowserProcesses) reasons.push('browser-process-pressure');
  if (telemetry.loadPerCpu >= limits.maxLoadPerCpu) reasons.push('cpu-load');

  let level = 'healthy';
  if (reasons.length >= 3 || telemetry.memoryAvailableMb < 512 || telemetry.swapUsedPct >= 95) level = 'critical';
  else if (reasons.length) level = 'high';
  else if (telemetry.memoryAvailablePct < 30 || telemetry.swapUsedPct >= 60) level = 'moderate';

  return {
    telemetry,
    level,
    reasons,
    admitBrowserWorker: reasons.length === 0
  };
}
