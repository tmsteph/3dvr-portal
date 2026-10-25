// A deterministic surface approximation, not a cosmological evolution model.
export function randomSequence(seed = 17) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function mandelbulbDistance(x, y, z, power) {
  let a = x;
  let b = y;
  let c = z;
  let derivative = 1;
  let radius = 0;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    radius = Math.hypot(a, b, c);
    if (radius > 3) break;
    if (radius < 1e-9) return 0;
    const theta = Math.acos(Math.max(-1, Math.min(1, c / radius))) * power;
    const phi = Math.atan2(b, a) * power;
    const radialPower = Math.pow(radius, power - 1);
    derivative = power * radialPower * derivative + 1;
    const magnitude = radialPower * radius;
    a = magnitude * Math.sin(theta) * Math.cos(phi) + x;
    b = magnitude * Math.sin(theta) * Math.sin(phi) + y;
    c = magnitude * Math.cos(theta) + z;
  }
  return radius > 1 ? 0.5 * Math.log(radius) * radius / derivative : 0;
}
