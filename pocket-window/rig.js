export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The display is z=0, the viewer is at (eye.x, eye.y, -eye.distance).
// Intersect each eye-to-world ray with the fixed display plane. This is an
// off-axis pinhole projection, not a rotation/scale of the scene as a whole.
export function project(point, eye, width, height) {
  const distance = eye.distance + point.z;
  if (distance < 0.15) return null;
  const scale = eye.distance / distance;
  return {
    x: width / 2 + (eye.x + (point.x - eye.x) * scale) * height / 2,
    y: height / 2 - (eye.y + (point.y - eye.y) * scale) * height / 2,
    scale: scale * height / 2
  };
}

export function createRig() {
  const inputs = {
    pointer: { x: 0, y: 0, z: 0 },
    motion: { x: 0, y: 0 },
    head: { x: 0, y: 0, z: 0 }
  };
  let origin = { x: 0, y: 0, z: 0 };
  const eye = { x: 0, y: 0, distance: 2.7 };
  return {
    inputs, eye,
    centerHead() { origin = { ...inputs.head }; },
    center() {
      origin = { ...inputs.head };
      Object.assign(inputs.pointer, { x: 0, y: 0, z: 0 });
      Object.assign(inputs.motion, { x: 0, y: 0 });
    },
    update(dt, intensity) {
      const alpha = 1 - Math.exp(-Math.min(dt, 0.1) * 11);
      const x = clamp((inputs.pointer.x * 1.2 + inputs.motion.x + (inputs.head.x - origin.x) * 1.4) * intensity, -1.8, 1.8);
      const y = clamp((inputs.pointer.y * .8 + inputs.motion.y + (inputs.head.y - origin.y)) * intensity, -1.1, 1.1);
      const distance = clamp(2.7 - inputs.pointer.z - (inputs.head.z - origin.z), 1.65, 4.4);
      eye.x += (x - eye.x) * alpha;
      eye.y += (y - eye.y) * alpha;
      eye.distance += (distance - eye.distance) * alpha;
      // Settle completely so Center does not leave subpixel drift.
      if (Math.abs(x - eye.x) < .001) eye.x = x;
      if (Math.abs(y - eye.y) < .001) eye.y = y;
      if (Math.abs(distance - eye.distance) < .001) eye.distance = distance;
      return eye;
    }
  };
}
