import * as THREE from 'three';

const VISUAL_COLORS = Object.freeze({
  'breathing-orb': 0xd9b26d,
  'spine-wave': 0x91d7ca,
  'heart-light': 0xe7a38b,
  'third-eye-focus': 0xb9a5f0,
  'rising-particles': 0xd9b26d,
  'mandala-calm': 0x91d7ca,
});

export function createInnerAlignmentScene(canvas, options = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0a08);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.1, 6);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  const root = new THREE.Group();
  scene.add(root);

  const ambient = new THREE.AmbientLight(0xf7efe2, 1.3);
  scene.add(ambient);

  const glow = new THREE.PointLight(0xe8be67, 1.5, 12);
  glow.position.set(0, 1.2, 3);
  scene.add(glow);

  const state = {
    visualMode: options.visualMode || 'breathing-orb',
    reduceMotion: Boolean(options.reduceMotion),
    paused: false,
    disposed: false,
    frameId: 0,
    startTime: performance.now(),
    root,
    meshes: [],
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function clearVisual() {
    state.meshes.forEach(mesh => {
      state.root.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(material => material.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    state.meshes = [];
  }

  function addMesh(mesh) {
    state.meshes.push(mesh);
    state.root.add(mesh);
    return mesh;
  }

  function buildVisual(mode) {
    clearVisual();
    const color = VISUAL_COLORS[mode] || VISUAL_COLORS['breathing-orb'];

    if (mode === 'spine-wave') {
      const points = [];
      for (let index = 0; index < 28; index += 1) {
        const y = -1.9 + index * 0.14;
        points.push(new THREE.Vector3(0, y, 0));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, 64, 0.025, 10, false);
      const material = new THREE.MeshBasicMaterial({ color });
      addMesh(new THREE.Mesh(geometry, material));
      addSeatedGuide(color);
      return;
    }

    if (mode === 'heart-light') {
      addMesh(new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 48, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78 })
      ));
      addRing(0.9, color, 0.22);
      addRing(1.35, color, 0.12);
      return;
    }

    if (mode === 'third-eye-focus') {
      addMesh(new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 32, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      ));
      addRing(0.62, color, 0.18);
      addRing(1.05, color, 0.11);
      return;
    }

    if (mode === 'rising-particles') {
      for (let index = 0; index < 42; index += 1) {
        const particle = addMesh(new THREE.Mesh(
          new THREE.SphereGeometry(0.025 + (index % 4) * 0.006, 12, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62 })
        ));
        const angle = index * 0.61;
        particle.position.set(Math.cos(angle) * (0.25 + (index % 7) * 0.08), -2 + (index % 14) * 0.28, 0);
        particle.userData.seed = index * 0.37;
      }
      return;
    }

    if (mode === 'mandala-calm') {
      addRing(0.62, color, 0.28);
      addRing(1.05, 0xd9b26d, 0.2);
      addRing(1.48, color, 0.14);
      addRing(1.9, 0xe7a38b, 0.1);
      for (let index = 0; index < 12; index += 1) {
        const bead = addMesh(new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 16, 12),
          new THREE.MeshBasicMaterial({ color: index % 2 ? color : 0xd9b26d, transparent: true, opacity: 0.72 })
        ));
        const angle = (Math.PI * 2 * index) / 12;
        bead.position.set(Math.cos(angle) * 1.18, Math.sin(angle) * 1.18, 0);
      }
      return;
    }

    addMesh(new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 48, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.62 })
    ));
    addRing(1.18, color, 0.18);
  }

  function addRing(radius, color, opacity) {
    return addMesh(new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.012, 10, 96),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
    ));
  }

  function addSeatedGuide(color) {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32 });
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.9, -1.85, 0),
      new THREE.Vector3(0, -1.45, 0),
      new THREE.Vector3(0.9, -1.85, 0),
      new THREE.Vector3(-0.65, -0.4, 0),
      new THREE.Vector3(0.65, -0.4, 0),
    ]);
    addMesh(new THREE.LineSegments(geometry, material));
  }

  function animate(now) {
    if (state.disposed) return;
    resize();

    if (!state.paused) {
      const elapsed = (now - state.startTime) / 1000;
      const slow = state.reduceMotion ? 0.18 : 1;
      state.meshes.forEach((mesh, index) => {
        if (state.visualMode === 'breathing-orb') {
          const scale = state.reduceMotion ? 1.02 : 0.85 + Math.sin(elapsed * 0.75) * 0.16;
          mesh.scale.setScalar(scale);
          mesh.rotation.z = elapsed * 0.08 * slow;
        } else if (state.visualMode === 'spine-wave') {
          mesh.rotation.z = Math.sin(elapsed * 0.45 + index) * 0.04 * slow;
          mesh.position.x = Math.sin(elapsed * 0.8 + index * 0.5) * 0.08 * slow;
        } else if (state.visualMode === 'heart-light') {
          const scale = state.reduceMotion ? 1.03 : 0.92 + Math.sin(elapsed * 1.1 + index) * 0.1;
          mesh.scale.setScalar(scale);
        } else if (state.visualMode === 'third-eye-focus') {
          mesh.scale.setScalar(state.reduceMotion ? 1 : 0.96 + Math.sin(elapsed * 0.9 + index) * 0.05);
        } else if (state.visualMode === 'rising-particles') {
          mesh.position.y += 0.004 * slow;
          if (mesh.position.y > 2.1) mesh.position.y = -2.05;
          mesh.position.x += Math.sin(elapsed + mesh.userData.seed) * 0.0008 * slow;
        } else if (state.visualMode === 'mandala-calm') {
          mesh.rotation.z = elapsed * 0.04 * (index % 2 ? -1 : 1) * slow;
        }
      });
    }

    renderer.render(scene, camera);
    state.frameId = requestAnimationFrame(animate);
  }

  buildVisual(state.visualMode);
  state.frameId = requestAnimationFrame(animate);

  return {
    setVisualMode(mode) {
      state.visualMode = VISUAL_COLORS[mode] ? mode : 'breathing-orb';
      state.startTime = performance.now();
      buildVisual(state.visualMode);
    },
    setReduceMotion(value) {
      state.reduceMotion = Boolean(value);
    },
    setPaused(value) {
      state.paused = Boolean(value);
    },
    dispose() {
      state.disposed = true;
      cancelAnimationFrame(state.frameId);
      clearVisual();
      renderer.dispose();
    },
  };
}
