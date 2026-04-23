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
  scene.fog = new THREE.FogExp2(0x04060a, 0.058);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
  const cameraBase = new THREE.Vector3(0, 2.05, 8.0);
  camera.position.copy(cameraBase);
  camera.lookAt(0, -0.25, -1.6);

  const ambient = new THREE.AmbientLight(0xa4b9d9, 0.78);
  const topLight = new THREE.PointLight(0xf4f8ff, 3.7, 34, 2);
  topLight.position.set(0, 7.8, 2.4);
  const sideLight = new THREE.PointLight(0x7ea4dc, 2.9, 30, 2);
  sideLight.position.set(5.6, 3.6, 5.8);
  const underLight = new THREE.PointLight(0x3a5477, 1.45, 20, 2);
  underLight.position.set(-3.8, -0.8, -2.2);
  scene.add(ambient, topLight, sideLight, underLight);

  const field = buildField();
  const singularities = buildSingularities();
  const starField = buildStarField();
  const orbitArcs = buildOrbitArcs();
  scene.add(field.group, singularities, starField, orbitArcs.group);

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

  function getAttractors(time) {
    return [
      {
        x: -3.15 + Math.sin(time * 0.00022) * 0.38 + pointer.x * 0.45,
        z: -0.65 + Math.cos(time * 0.00018) * 0.28,
        strength: 1.55,
        radius: 2.35,
      },
      {
        x: 0.2 + Math.sin(time * 0.00015) * 0.25 + pointer.y * 0.32,
        z: -3.15 + Math.cos(time * 0.00021) * 0.34,
        strength: -1.85,
        radius: 2.95,
      },
      {
        x: 3.45 + Math.cos(time * 0.00017) * 0.32 + pointer.x * 0.28,
        z: -0.95 + Math.sin(time * 0.00023) * 0.3,
        strength: 1.28,
        radius: 2.45,
      },
    ];
  }

  function updateField(time) {
    const attractors = getAttractors(time);
    const position = field.geometry.attributes.position;
    const nodePosition = field.nodeGeometry.attributes.position;
    const colorAttr = field.nodeGeometry.attributes.color;
    const base = field.basePositions;

    for (let i = 0; i < base.length; i += 3) {
      const x = base[i];
      const z = base[i + 2];
      const swirl = Math.sin((x - z) * 0.38 - time * 0.00014) * 0.08;
      const carrierA = Math.sin(x * 0.72 + time * 0.00029) * 0.21;
      const carrierB = Math.cos(z * 0.96 - time * 0.00024) * 0.16;

      let forceHeight = 0;
      let intensity = 0;
      let vectorX = 0;
      let vectorZ = 0;

      for (const attractor of attractors) {
        const dx = x - attractor.x;
        const dz = z - attractor.z;
        const dist = Math.sqrt(dx * dx + dz * dz) + 0.0001;
        const falloff = Math.exp(-Math.pow(dist / attractor.radius, 2));
        forceHeight += falloff * attractor.strength;
        intensity += Math.abs(falloff * attractor.strength);
        vectorX += (-dz / dist) * falloff * attractor.strength;
        vectorZ += (dx / dist) * falloff * attractor.strength;
      }

      const interference = Math.sin((vectorX + vectorZ) * 3.4 + time * 0.00042) * 0.06;
      const ringEcho = Math.sin(intensity * 9.5 - time * 0.00065) * 0.055;
      const y = carrierA + carrierB + swirl + forceHeight * 0.82 + interference + ringEcho;

      position.array[i] = x + vectorX * 0.035;
      position.array[i + 1] = y;
      position.array[i + 2] = z + vectorZ * 0.035;

      nodePosition.array[i] = position.array[i];
      nodePosition.array[i + 1] = y + 0.02;
      nodePosition.array[i + 2] = position.array[i + 2];

      const nodeIndex = i;
      const glow = Math.min(1, 0.28 + intensity * 0.7);
      colorAttr.array[nodeIndex] = 0.72 + glow * 0.2;
      colorAttr.array[nodeIndex + 1] = 0.8 + glow * 0.14;
      colorAttr.array[nodeIndex + 2] = 0.94 + glow * 0.06;
    }

    position.needsUpdate = true;
    nodePosition.needsUpdate = true;
    colorAttr.needsUpdate = true;
    field.geometry.computeVertexNormals();

    field.group.position.x = pointer.x * 0.34;
    field.group.position.y = -0.05 - scrollProgress * 0.32;
    field.group.rotation.y = pointer.x * 0.1;
    field.group.rotation.z = pointer.x * 0.05;

    return attractors;
  }

  function updateSingularities(time, attractors) {
    singularities.children.forEach((node, index) => {
      const attractor = attractors[index];
      if (!attractor) return;

      const phase = time * 0.00052 + index * 1.4;
      node.position.set(attractor.x, 1.1 + Math.sin(phase) * 0.16, attractor.z);
      node.rotation.y = phase * 0.7;
      node.children[1].scale.setScalar(1 + Math.sin(phase * 1.7) * 0.12);
      node.children[2].scale.setScalar(1 + Math.cos(phase * 1.35) * 0.08);
      node.children[3].material.opacity = 0.14 + (Math.sin(phase * 1.2) * 0.5 + 0.5) * 0.1;
    });
  }

  function updateOrbitArcs(time, attractors) {
    orbitArcs.rings.forEach((ring, index) => {
      const attractor = attractors[index % attractors.length];
      ring.position.set(attractor.x, 0.22, attractor.z);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = time * 0.00018 * (index % 2 === 0 ? 1 : -1) + index * 0.28;
      ring.material.opacity = 0.08 + (Math.sin(time * 0.00042 + index) * 0.5 + 0.5) * 0.08;
    });
  }

  function updateStars(time, attractors) {
    const positions = starField.geometry.attributes.position;
    const base = starField.userData.basePositions;

    for (let i = 0; i < positions.array.length; i += 3) {
      const x = base[i];
      const y = base[i + 1];
      const z = base[i + 2];

      let driftX = 0;
      let driftZ = 0;
      for (const attractor of attractors) {
        const dx = x - attractor.x;
        const dz = z - attractor.z;
        const dist = Math.sqrt(dx * dx + dz * dz) + 0.0001;
        const falloff = Math.exp(-Math.pow(dist / (attractor.radius * 1.8), 2));
        driftX += (-dz / dist) * falloff * attractor.strength * 0.04;
        driftZ += (dx / dist) * falloff * attractor.strength * 0.04;
      }

      positions.array[i] = x + driftX + Math.sin(time * 0.00005 + y * 0.12) * 0.03;
      positions.array[i + 1] = y + Math.sin(time * 0.00012 + x * 0.08) * 0.01;
      positions.array[i + 2] = z + driftZ;
    }

    positions.needsUpdate = true;
    starField.rotation.y = time * 0.000018;
    starField.rotation.z = pointer.x * 0.02;
    starField.position.x = pointer.x * 0.18;
    starField.position.y = pointer.y * 0.08;
  }

  function render(time) {
    pointer.lerp(pointerTarget, 0.055);

    const attractors = updateField(time);
    updateSingularities(time, attractors);
    updateOrbitArcs(time, attractors);
    updateStars(time, attractors);

    camera.position.x = cameraBase.x + pointer.x * 0.72;
    camera.position.y = cameraBase.y + pointer.y * 0.22 - scrollProgress * 0.22;
    camera.position.z = cameraBase.z - scrollProgress * 0.28;
    camera.lookAt(pointer.x * 0.62, -0.22 - scrollProgress * 0.08, -1.55);

    renderer.render(scene, camera);
    if (!prefersReducedMotion) window.requestAnimationFrame(render);
  }

  resize();
  render(0);

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener(
    "pointermove",
    (event) => {
      pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
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
  const geometry = new THREE.PlaneGeometry(16.5, 12.5, 142, 104);
  geometry.rotateX(-Math.PI / 2.72);
  geometry.translate(0, -0.08, -2.25);

  const basePositions = geometry.attributes.position.array.slice();

  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshPhongMaterial({
      color: 0x5a7398,
      emissive: 0x0f1725,
      emissiveIntensity: 1.0,
      shininess: 44,
      specular: 0xd3e3ff,
      transparent: true,
      opacity: 0.11,
      side: THREE.DoubleSide,
    })
  );

  const wire = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xe5efff,
      wireframe: true,
      transparent: true,
      opacity: 0.33,
    })
  );

  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(basePositions.slice(), 3));

  const colors = new Float32Array(basePositions.length);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = 0.86;
    colors[i + 1] = 0.9;
    colors[i + 2] = 1.0;
  }
  nodeGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const nodes = new THREE.Points(
    nodeGeometry,
    new THREE.PointsMaterial({
      size: 0.034,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  const group = new THREE.Group();
  group.add(surface, wire, nodes);

  return { group, geometry, basePositions, nodeGeometry };
}

function buildSingularities() {
  const group = new THREE.Group();
  const colors = [0xf3f8ff, 0xc0d7ff, 0xe7efff];

  colors.forEach((color, index) => {
    const node = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 24, 24),
      new THREE.MeshBasicMaterial({ color })
    );

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.26 + index * 0.02, 0.012, 14, 88),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 })
    );
    innerRing.rotation.x = Math.PI / 2;

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.42 + index * 0.03, 0.007, 10, 96),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32 })
    );
    outerRing.rotation.x = Math.PI / 2;
    outerRing.rotation.y = Math.PI / 5;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 2.5, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      })
    );
    beam.position.y = -1.15;

    node.add(core, innerRing, outerRing, beam);
    group.add(node);
  });

  return group;
}

function buildOrbitArcs() {
  const group = new THREE.Group();
  const rings = [];
  const ringSpecs = [0.92, 1.2, 1.55, 1.02, 1.34, 1.72];

  ringSpecs.forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.006 + (index % 3) * 0.0015, 10, 120),
      new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? 0xcdddff : 0x9dbce7,
        transparent: true,
        opacity: 0.12,
      })
    );
    group.add(ring);
    rings.push(ring);
  });

  return { group, rings };
}

function buildStarField() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 22;
    positions[i3 + 1] = Math.random() * 8.5 - 0.3;
    positions[i3 + 2] = (Math.random() - 0.5) * 18 - 2;

    const cool = Math.random() > 0.18;
    colors[i3] = cool ? 0.84 : 0.74;
    colors[i3 + 1] = cool ? 0.91 : 0.82;
    colors[i3 + 2] = 1.0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  stars.userData.basePositions = positions.slice();

  return stars;
}
