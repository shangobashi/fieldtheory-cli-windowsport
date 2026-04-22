const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

window.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initTerminalPulse();
  initFieldBackground();
});

function initReveal() {
  const items = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!items.length) return;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
  );

  items.forEach((item) => observer.observe(item));
}

function initTerminalPulse() {
  if (prefersReducedMotion) return;

  const lines = Array.from(document.querySelectorAll(".terminal-line"));
  if (!lines.length) return;

  let index = 0;
  window.setInterval(() => {
    lines.forEach((line) => line.classList.remove("is-active"));
    lines[index % lines.length].classList.add("is-active");
    index += 1;
  }, 1600);
}

function initFieldBackground() {
  const canvas = document.getElementById("field-canvas");
  if (!(canvas instanceof HTMLCanvasElement) || typeof THREE === "undefined") return;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04060a, 0.06);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  const cameraBase = new THREE.Vector3(0, 1.95, 7.7);
  camera.position.copy(cameraBase);
  camera.lookAt(0, -0.1, -1.2);

  const ambient = new THREE.AmbientLight(0x9eb7dc, 0.72);
  const topLight = new THREE.PointLight(0xf2f6ff, 3.2, 32, 2);
  topLight.position.set(0, 7.5, 2.8);
  const sideLight = new THREE.PointLight(0x7fa3d7, 2.2, 28, 2);
  sideLight.position.set(5.2, 3.4, 5.4);
  scene.add(ambient, topLight, sideLight);

  const field = buildField();
  const nodeGroup = buildNodes();
  const starField = buildStarField();
  scene.add(field.group, nodeGroup, starField);

  const pointer = new THREE.Vector2(0, 0);
  const pointerTarget = new THREE.Vector2(0, 0);
  let scrollProgress = 0;

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function updateField(time) {
    const position = field.geometry.attributes.position;
    const nodePosition = field.nodeGeometry.attributes.position;
    const base = field.basePositions;

    const attractorA = {
      x: Math.sin(time * 0.00016) * 1.55 + pointer.x * 1.35,
      z: Math.cos(time * 0.00012) * 1.6,
    };
    const attractorB = {
      x: Math.cos(time * 0.00011) * -2.4 + pointer.y * 0.65,
      z: Math.sin(time * 0.0002) * 1.35 - 1.4,
    };

    for (let i = 0; i < base.length; i += 3) {
      const x = base[i];
      const z = base[i + 2];
      const waveA = Math.sin(x * 0.84 + time * 0.00034) * 0.32;
      const waveB = Math.cos(z * 1.08 - time * 0.00028) * 0.24;
      const waveC = Math.sin((x + z) * 0.52 - time * 0.00018) * 0.14;
      const radialA = attractorHeight(x, z, attractorA.x, attractorA.z, 2.7, 1.3);
      const radialB = attractorHeight(x, z, attractorB.x, attractorB.z, 3.2, -0.92);
      const y = waveA + waveB + waveC + radialA + radialB;

      position.array[i] = x;
      position.array[i + 1] = y;
      position.array[i + 2] = z;

      nodePosition.array[i] = x;
      nodePosition.array[i + 1] = y + 0.02;
      nodePosition.array[i + 2] = z;
    }

    position.needsUpdate = true;
    nodePosition.needsUpdate = true;
    field.geometry.computeVertexNormals();

    field.group.position.x = pointer.x * 0.42;
    field.group.position.y = -0.12 - scrollProgress * 0.34;
    field.group.rotation.y = pointer.x * 0.14;
    field.group.rotation.z = pointer.x * 0.08;
  }

  function updateNodes(time) {
    nodeGroup.children.forEach((node, index) => {
      const phase = time * 0.00048 + index * 1.7;
      node.position.y = 1.05 + Math.sin(phase) * 0.18;
      node.rotation.z = phase * 0.82;
      node.rotation.x = phase * 0.46;
      node.children[1].scale.setScalar(1 + Math.sin(phase * 1.6) * 0.1);
      node.children[2].material.opacity = 0.12 + (Math.sin(phase * 1.3) * 0.5 + 0.5) * 0.08;
    });
  }

  function updateStars(time) {
    starField.rotation.y = time * 0.000022;
    starField.rotation.z = pointer.x * 0.03;
    starField.position.x = pointer.x * 0.24;
    starField.position.y = pointer.y * 0.12;
  }

  function render(time) {
    pointer.lerp(pointerTarget, 0.055);

    updateField(time);
    updateNodes(time);
    updateStars(time);

    camera.position.x = cameraBase.x + pointer.x * 0.82;
    camera.position.y = cameraBase.y + pointer.y * 0.3 - scrollProgress * 0.24;
    camera.position.z = cameraBase.z - scrollProgress * 0.32;
    camera.lookAt(pointer.x * 0.8, -0.15 - scrollProgress * 0.1, -1.2);

    renderer.render(scene, camera);
    if (!prefersReducedMotion) window.requestAnimationFrame(render);
  }

  resize();
  render(0);

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener(
    "pointermove",
    (event) => {
      pointerTarget.x = event.clientX / window.innerWidth * 2 - 1;
      pointerTarget.y = -(event.clientY / window.innerHeight) * 2 + 1;
    },
    { passive: true }
  );
  window.addEventListener(
    "scroll",
    () => {
      const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 1);
      scrollProgress = Math.min(window.scrollY / maxScroll, 1);
    },
    { passive: true }
  );
}

function buildField() {
  const geometry = new THREE.PlaneGeometry(16, 12, 132, 96);
  geometry.rotateX(-Math.PI / 2.68);
  geometry.translate(0, -0.15, -2.2);

  const basePositions = geometry.attributes.position.array.slice();

  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshPhongMaterial({
      color: 0x5c7497,
      emissive: 0x101a28,
      emissiveIntensity: 0.95,
      shininess: 42,
      specular: 0xc9dbfb,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      flatShading: false,
    })
  );

  const wire = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xe0ebff,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
    })
  );

  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(basePositions.slice(), 3));

  const nodes = new THREE.Points(
    nodeGeometry,
    new THREE.PointsMaterial({
      color: 0xf5f8ff,
      size: 0.038,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  const group = new THREE.Group();
  group.add(surface, wire, nodes);

  return { group, geometry, basePositions, nodeGeometry };
}

function buildNodes() {
  const group = new THREE.Group();
  const anchors = [
    { x: -3.5, z: -1.2, color: 0xf3f8ff },
    { x: 0.4, z: -2.8, color: 0xb4cff5 },
    { x: 3.8, z: -1.1, color: 0xe3edff },
  ];

  anchors.forEach((anchor, index) => {
    const node = new THREE.Group();
    node.position.set(anchor.x, 1.05, anchor.z);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 22, 22),
      new THREE.MeshBasicMaterial({ color: anchor.color })
    );

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.28 + index * 0.03, 0.012, 14, 80),
      new THREE.MeshBasicMaterial({
        color: anchor.color,
        transparent: true,
        opacity: 0.62,
      })
    );
    halo.rotation.x = Math.PI / 2.05;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 2.1, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: anchor.color,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
      })
    );
    beam.position.y = -1.0;

    node.add(core, halo, beam);
    group.add(node);
  });

  return group;
}

function buildStarField() {
  const count = 1100;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 22;
    positions[i3 + 1] = Math.random() * 8.5 - 0.4;
    positions[i3 + 2] = (Math.random() - 0.5) * 18 - 2;

    const warm = Math.random() > 0.88;
    colors[i3] = warm ? 0.74 : 0.87;
    colors[i3 + 1] = warm ? 0.82 : 0.92;
    colors[i3 + 2] = 1.0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
}

function attractorHeight(x, z, cx, cz, radius, amplitude) {
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const strength = Math.max(0, 1 - dist / radius);
  return strength * strength * amplitude;
}
