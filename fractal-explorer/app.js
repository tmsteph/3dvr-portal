import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const canvas = document.getElementById('fractal-canvas');
const statusEl = document.getElementById('status');
const controls = {
  power: document.getElementById('power'),
  iterations: document.getElementById('iterations'),
  detail: document.getElementById('detail'),
  bloom: document.getElementById('bloom'),
  palette: document.getElementById('palette')
};

const outputs = {
  power: document.getElementById('power-value'),
  iterations: document.getElementById('iterations-value'),
  detail: document.getElementById('detail-value'),
  bloom: document.getElementById('bloom-value')
};

const params = new URLSearchParams(window.location.search);
const state = {
  yaw: numberParam('yaw', 0.58),
  pitch: numberParam('pitch', 0.23),
  distance: numberParam('distance', 3.45),
  paused: false,
  dragging: false,
  pointerX: 0,
  pointerY: 0,
  startYaw: 0,
  startPitch: 0,
  lastUrlWrite: 0
};

const uniforms = {
  uResolution: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  uPower: { value: numberParam('power', 8) },
  uIterations: { value: intParam('iterations', 9) },
  uSteps: { value: intParam('detail', 72) },
  uBloom: { value: numberParam('bloom', 0.35) },
  uPalette: { value: intParam('palette', 0) },
  uYaw: { value: state.yaw },
  uPitch: { value: state.pitch },
  uDistance: { value: state.distance }
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance'
});
renderer.setClearColor(0x070b12, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;

    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uPower;
    uniform int uIterations;
    uniform int uSteps;
    uniform float uBloom;
    uniform int uPalette;
    uniform float uYaw;
    uniform float uPitch;
    uniform float uDistance;

    varying vec2 vUv;

    mat3 cameraBasis(vec3 ro, vec3 target) {
      vec3 forward = normalize(target - ro);
      vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(right, forward);
      return mat3(right, up, forward);
    }

    float mandelbulbDE(vec3 p) {
      vec3 z = p;
      float dr = 1.0;
      float r = 0.0;

      for (int i = 0; i < 14; i++) {
        if (i >= uIterations) break;
        r = max(length(z), 0.0001);
        if (r > 4.0) break;

        float theta = acos(clamp(z.z / r, -1.0, 1.0));
        float phi = atan(z.y, z.x);
        float zr = pow(r, uPower);
        dr = pow(r, uPower - 1.0) * uPower * dr + 1.0;

        theta *= uPower;
        phi *= uPower;

        z = zr * vec3(
          sin(theta) * cos(phi),
          sin(theta) * sin(phi),
          cos(theta)
        ) + p;
      }

      return 0.5 * log(r) * r / dr;
    }

    vec3 calcNormal(vec3 p) {
      vec2 e = vec2(0.0014, 0.0);
      return normalize(vec3(
        mandelbulbDE(p + e.xyy) - mandelbulbDE(p - e.xyy),
        mandelbulbDE(p + e.yxy) - mandelbulbDE(p - e.yxy),
        mandelbulbDE(p + e.yyx) - mandelbulbDE(p - e.yyx)
      ));
    }

    float ambientOcclusion(vec3 p, vec3 n) {
      float occ = 0.0;
      float scale = 1.0;
      for (int i = 1; i <= 5; i++) {
        float h = 0.025 * float(i);
        float d = mandelbulbDE(p + n * h);
        occ += (h - d) * scale;
        scale *= 0.58;
      }
      return clamp(1.0 - occ * 2.2, 0.0, 1.0);
    }

    vec3 palette(float v, float shade) {
      if (uPalette == 1) {
        return mix(vec3(0.17, 0.08, 0.04), vec3(1.0, 0.56, 0.22), v) * shade;
      }
      if (uPalette == 2) {
        return mix(vec3(0.04, 0.12, 0.22), vec3(0.62, 0.94, 1.0), v) * shade;
      }
      if (uPalette == 3) {
        return vec3(v * shade);
      }
      vec3 a = vec3(0.05, 0.12, 0.22);
      vec3 b = vec3(0.14, 0.92, 0.78);
      vec3 c = vec3(0.78, 0.32, 1.0);
      return mix(mix(a, b, smoothstep(0.0, 0.65, v)), c, smoothstep(0.55, 1.0, v)) * shade;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
      vec3 target = vec3(0.0, 0.0, 0.0);
      vec3 ro = vec3(
        sin(uYaw) * cos(uPitch),
        sin(uPitch),
        cos(uYaw) * cos(uPitch)
      ) * uDistance;
      mat3 basis = cameraBasis(ro, target);
      vec3 rd = normalize(basis * vec3(uv * 1.25, 1.65));

      float t = 0.0;
      float glow = 0.0;
      float hit = 0.0;
      vec3 p = ro;

      for (int i = 0; i < 112; i++) {
        if (i >= uSteps) break;
        p = ro + rd * t;
        float d = mandelbulbDE(p);
        glow += exp(-22.0 * abs(d)) * 0.008;
        if (d < max(0.0008, 0.00035 * t)) {
          hit = 1.0;
          break;
        }
        t += clamp(d * 0.78, 0.006, 0.11);
        if (t > 9.0) break;
      }

      vec3 color = vec3(0.01, 0.025, 0.045) + vec3(0.02, 0.08, 0.11) * (1.0 - length(uv) * 0.45);

      if (hit > 0.5) {
        vec3 n = calcNormal(p);
        vec3 lightDir = normalize(vec3(-0.48, 0.72, 0.5));
        float diff = max(dot(n, lightDir), 0.0);
        float rim = pow(max(1.0 - dot(n, -rd), 0.0), 2.3);
        float ao = ambientOcclusion(p, n);
        float depth = smoothstep(0.8, 4.4, t);
        float bands = 0.5 + 0.5 * sin(10.0 * length(p) + uTime * 0.12);
        float shade = (0.28 + diff * 0.88 + rim * 0.52) * ao;
        color = palette(mix(bands, 1.0 - depth, 0.28), shade);
        color += rim * vec3(0.26, 0.68, 0.92);
      }

      color += glow * uBloom * vec3(0.6, 1.0, 0.94);
      color = pow(color, vec3(0.86));
      gl_FragColor = vec4(color, 1.0);
    }
  `
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

hydrateControls();
resize();
animate(0);

window.addEventListener('resize', resize);
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('wheel', onWheel, { passive: false });

for (const [key, input] of Object.entries(controls)) {
  input.addEventListener('input', () => {
    if (key === 'palette') {
      uniforms.uPalette.value = Number(input.value);
    } else if (key === 'iterations') {
      uniforms.uIterations.value = Number(input.value);
    } else if (key === 'detail') {
      uniforms.uSteps.value = Number(input.value);
    } else if (key === 'power') {
      uniforms.uPower.value = Number(input.value);
    } else if (key === 'bloom') {
      uniforms.uBloom.value = Number(input.value);
    }
    syncOutputs();
    writeUrlSoon();
  });
}

document.getElementById('reset-view').addEventListener('click', () => {
  state.yaw = 0.58;
  state.pitch = 0.23;
  state.distance = 3.45;
  updateCameraUniforms();
  writeUrlSoon(true);
});

document.getElementById('pause').addEventListener('click', (event) => {
  state.paused = !state.paused;
  event.currentTarget.textContent = state.paused ? 'Resume' : 'Pause';
  event.currentTarget.setAttribute('aria-pressed', String(state.paused));
});

document.getElementById('randomize').addEventListener('click', () => {
  controls.power.value = String((4.8 + Math.random() * 5.2).toFixed(1));
  controls.iterations.value = String(7 + Math.floor(Math.random() * 6));
  controls.detail.value = String(56 + Math.floor(Math.random() * 11) * 4);
  controls.bloom.value = String((0.16 + Math.random() * 0.5).toFixed(2));
  controls.palette.value = String(Math.floor(Math.random() * 4));
  state.yaw = Math.random() * Math.PI * 2;
  state.pitch = -0.25 + Math.random() * 0.65;
  state.distance = 2.7 + Math.random() * 1.35;
  updateUniformsFromControls();
  writeUrlSoon(true);
});

document.getElementById('copy-link').addEventListener('click', async () => {
  writeUrlSoon(true);
  try {
    await navigator.clipboard.writeText(window.location.href);
    setStatus('Share link copied.');
  } catch (error) {
    setStatus('Share link is in the address bar.');
  }
});

function numberParam(name, fallback) {
  if (!params.has(name)) return fallback;
  const value = Number(params.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function intParam(name, fallback) {
  const value = Math.round(numberParam(name, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function hydrateControls() {
  controls.power.value = String(clamp(uniforms.uPower.value, 2, 12));
  controls.iterations.value = String(clamp(uniforms.uIterations.value, 4, 14));
  controls.detail.value = String(clamp(uniforms.uSteps.value, 36, 112));
  controls.bloom.value = String(clamp(uniforms.uBloom.value, 0, 0.9));
  controls.palette.value = String(clamp(uniforms.uPalette.value, 0, 3));
  updateUniformsFromControls();
}

function updateUniformsFromControls() {
  uniforms.uPower.value = Number(controls.power.value);
  uniforms.uIterations.value = Number(controls.iterations.value);
  uniforms.uSteps.value = Number(controls.detail.value);
  uniforms.uBloom.value = Number(controls.bloom.value);
  uniforms.uPalette.value = Number(controls.palette.value);
  updateCameraUniforms();
  syncOutputs();
}

function updateCameraUniforms() {
  state.pitch = clamp(state.pitch, -1.15, 1.15);
  state.distance = clamp(state.distance, 1.85, 6.2);
  uniforms.uYaw.value = state.yaw;
  uniforms.uPitch.value = state.pitch;
  uniforms.uDistance.value = state.distance;
}

function syncOutputs() {
  outputs.power.textContent = Number(controls.power.value).toFixed(1);
  outputs.iterations.textContent = controls.iterations.value;
  outputs.detail.textContent = controls.detail.value;
  outputs.bloom.textContent = Number(controls.bloom.value).toFixed(2);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  uniforms.uResolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
}

function animate(time) {
  if (!state.paused) {
    uniforms.uTime.value = time * 0.001;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onPointerDown(event) {
  state.dragging = true;
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  state.startYaw = state.yaw;
  state.startPitch = state.pitch;
  canvas.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!state.dragging) return;
  const dx = event.clientX - state.pointerX;
  const dy = event.clientY - state.pointerY;
  state.yaw = state.startYaw - dx * 0.006;
  state.pitch = state.startPitch + dy * 0.0045;
  updateCameraUniforms();
  writeUrlSoon();
}

function onPointerUp(event) {
  if (!state.dragging) return;
  state.dragging = false;
  canvas.releasePointerCapture?.(event.pointerId);
  writeUrlSoon(true);
}

function onWheel(event) {
  event.preventDefault();
  state.distance += Math.sign(event.deltaY) * 0.18;
  updateCameraUniforms();
  writeUrlSoon();
}

function writeUrlSoon(force = false) {
  const now = performance.now();
  if (!force && now - state.lastUrlWrite < 180) return;
  state.lastUrlWrite = now;
  const next = new URL(window.location.href);
  next.searchParams.set('power', Number(controls.power.value).toFixed(1));
  next.searchParams.set('iterations', controls.iterations.value);
  next.searchParams.set('detail', controls.detail.value);
  next.searchParams.set('bloom', Number(controls.bloom.value).toFixed(2));
  next.searchParams.set('palette', controls.palette.value);
  next.searchParams.set('yaw', state.yaw.toFixed(3));
  next.searchParams.set('pitch', state.pitch.toFixed(3));
  next.searchParams.set('distance', state.distance.toFixed(2));
  window.history.replaceState(null, '', next);
}

function setStatus(message) {
  statusEl.textContent = message;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}
