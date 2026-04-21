const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hasGSAP = typeof window.gsap !== "undefined";
const hasThree = typeof window.THREE !== "undefined";

window.addEventListener("DOMContentLoaded", () => {
  initCursorGlow();
  initScrollState();
  initReveal();
  initIntro();
  initCardTilt();
  initThreeScene();
});

function initCursorGlow() {
  const root = document.documentElement;

  document.addEventListener(
    "pointermove",
    (event) => {
      root.style.setProperty("--cursor-x", `${event.clientX}px`);
      root.style.setProperty("--cursor-y", `${event.clientY}px`);
    },
    { passive: true }
  );
}

function initScrollState() {
  const setState = () => {
    document.body.classList.toggle("is-scrolled", window.scrollY > 12);
  };

  setState();
  window.addEventListener("scroll", setState, { passive: true });
}

function initReveal() {
  const elements = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!elements.length) return;

  if (prefersReducedMotion) {
    return;
  }

  if (hasGSAP) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          gsap.fromTo(
            entry.target,
            { y: 28, opacity: 0, filter: "blur(8px)" },
            { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.95, ease: "power3.out" }
          );
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -10% 0px" }
    );

    elements.forEach((element) => observer.observe(element));
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
    { threshold: 0.16, rootMargin: "0px 0px -10% 0px" }
  );

  elements.forEach((element) => observer.observe(element));
}

function initIntro() {
  if (prefersReducedMotion || !hasGSAP) return;

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.from(".masthead", { y: -12, opacity: 0, duration: 0.7 })
    .from(".issue-line", { y: 12, opacity: 0, duration: 0.5 }, "-=0.2")
    .from("h1", { y: 24, opacity: 0, duration: 0.8 }, "-=0.05")
    .from(".lede", { y: 18, opacity: 0, duration: 0.7 }, "-=0.45")
    .from(".hero-actions", { y: 16, opacity: 0, duration: 0.6 }, "-=0.4")
    .from(".proof-pills li", { y: 10, opacity: 0, stagger: 0.06, duration: 0.5 }, "-=0.45")
    .from(".dossier", { x: 24, opacity: 0, duration: 0.9 }, "-=0.75");
}

function initCardTilt() {
  if (prefersReducedMotion || !hasGSAP) return;

  const cards = Array.from(document.querySelectorAll(
    ".dossier, .feature-card, .method-card, .origin-card, .faq-item, .install-panel, .editorial-story, .note-card"
  ));

  cards.forEach((card) => {
    gsap.set(card, { transformPerspective: 900, transformStyle: "preserve-3d" });

    const toX = gsap.quickTo(card, "rotationX", { duration: 0.35, ease: "power3.out" });
    const toY = gsap.quickTo(card, "rotationY", { duration: 0.35, ease: "power3.out" });
    const glow = gsap.quickTo(card, "boxShadow", { duration: 0.5, ease: "power3.out" });

    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      toX(py * -4.8);
      toY(px * 7.2);
      glow("0 16px 38px rgba(0, 0, 0, 0.34)");
    });

    card.addEventListener("pointerleave", () => {
      toX(0);
      toY(0);
      glow("0 12px 34px rgba(0, 0, 0, 0.24)");
    });
  });
}

function initThreeScene() {
  const host = document.querySelector("[data-scene]");
  if (!(host instanceof HTMLElement) || !hasThree) return;

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.12, 4.55);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  host.prepend(renderer.domElement);
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.filter = "drop-shadow(0 0 24px rgba(184, 109, 79, 0.38))";

  const ambient = new THREE.AmbientLight(0x57545f, 1.65);
  scene.add(ambient);

  const key = new THREE.PointLight(0xe7b18f, 4.6, 20, 2);
  key.position.set(3.2, 2.8, 5.2);
  scene.add(key);

  const fill = new THREE.PointLight(0x8c7cff, 2.2, 20, 2);
  fill.position.set(-3.4, -2.0, 4.6);
  scene.add(fill);

  const rim = new THREE.PointLight(0xf3efe9, 1.6, 18, 2);
  rim.position.set(0, -1.4, 6.4);
  scene.add(rim);

  const group = new THREE.Group();
  group.scale.set(1.22, 1.22, 1.22);
  scene.add(group);

  function radialTexture(inner, outer) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.45, outer);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  const warmGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture("rgba(248,214,191,0.96)", "rgba(184,109,79,0.2)"),
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  warmGlow.scale.set(5.6, 5.6, 1);
  warmGlow.position.set(0.16, 0.1, -0.08);
  group.add(warmGlow);

  const coolGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture("rgba(160,145,255,0.94)", "rgba(125,103,216,0.2)"),
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  coolGlow.scale.set(5.0, 5.0, 1);
  coolGlow.position.set(-0.2, -0.12, 0.08);
  group.add(coolGlow);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.26, 3),
    new THREE.MeshStandardMaterial({
      color: 0x191614,
      roughness: 0.2,
      metalness: 0.95,
      emissive: 0xb86d4f,
      emissiveIntensity: 1.45,
    })
  );
  group.add(core);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.82, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xb86d4f,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(halo);

  const wire = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.04, 1),
    new THREE.MeshBasicMaterial({
      color: 0xb86d4f,
      wireframe: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(wire);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.08, 12, 150),
    new THREE.MeshStandardMaterial({
      color: 0x8c7cff,
      roughness: 0.16,
      metalness: 0.5,
      emissive: 0x22182e,
      emissiveIntensity: 1.4,
    })
  );
  ring.rotation.x = Math.PI * 0.44;
  ring.rotation.y = Math.PI * 0.18;
  group.add(ring);

  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(1.74, 0.06, 10, 160),
    new THREE.MeshBasicMaterial({
      color: 0xf5e7d9,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
    })
  );
  ring2.rotation.x = Math.PI * 0.26;
  ring2.rotation.z = Math.PI * 0.42;
  group.add(ring2);

  const lineGeo = new THREE.BufferGeometry();
  const linePositions = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i++) {
    const angle = (i / 120) * Math.PI * 2;
    const r = 2.15 + Math.sin(i * 0.45) * 0.24;
    linePositions[i * 3] = Math.cos(angle) * r;
    linePositions[i * 3 + 1] = Math.sin(angle * 1.8) * 0.76;
    linePositions[i * 3 + 2] = Math.sin(angle) * r * 0.14;
  }
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xf0d6ba,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
  });
  const orbitLine = new THREE.LineLoop(lineGeo, lineMat);
  orbitLine.rotation.x = Math.PI * 0.12;
  orbitLine.rotation.z = Math.PI * 0.08;
  group.add(orbitLine);

  const particleCount = 980;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const c1 = new THREE.Color(0xe8b18b);
  const c2 = new THREE.Color(0x8d79ff);
  const c3 = new THREE.Color(0xf4efe2);
  for (let i = 0; i < particleCount; i++) {
    const r = 2.6 + Math.random() * 3.1;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    const mix = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
    colors[i * 3] = mix.r;
    colors[i * 3 + 1] = mix.g;
    colors[i * 3 + 2] = mix.b;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  group.add(particles);

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPositions = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i++) {
    sparkPositions[i * 3] = (Math.random() - 0.5) * 8.4;
    sparkPositions[i * 3 + 1] = (Math.random() - 0.5) * 5.2;
    sparkPositions[i * 3 + 2] = (Math.random() - 0.5) * 6.2;
  }
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.03,
    color: 0xf4efe2,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  group.add(sparks);

  let width = 0;
  let height = 0;
  let targetRotX = 0;
  let targetRotY = 0;
  let pointerX = 0;
  let pointerY = 0;

  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener("resize", resize);

  host.addEventListener("pointermove", (event) => {
    const rect = host.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / rect.width - 0.5;
    pointerY = (event.clientY - rect.top) / rect.height - 0.5;
    targetRotY = pointerX * 1.0;
    targetRotX = -pointerY * 0.78;
  });
  host.addEventListener("pointerleave", () => {
    targetRotX = 0;
    targetRotY = 0;
  });

  const clock = new THREE.Clock();

  function animate() {
    const elapsed = clock.getElapsedTime();
    group.rotation.y += (targetRotY - group.rotation.y) * 0.055;
    group.rotation.x += (targetRotX - group.rotation.x) * 0.055;
    group.position.x = Math.sin(elapsed * 0.35) * 0.08;
    group.position.y = Math.cos(elapsed * 0.52) * 0.06;
    core.rotation.x = elapsed * 0.65;
    core.rotation.y = elapsed * 0.8;
    halo.rotation.y = elapsed * 0.18;
    wire.rotation.z = elapsed * -0.18;
    ring.rotation.z = elapsed * 0.28;
    ring2.rotation.y = elapsed * -0.26;
    particles.rotation.y = elapsed * 0.11;
    particles.rotation.x = Math.sin(elapsed * 0.15) * 0.08;
    sparks.rotation.z = elapsed * 0.045;
    warmGlow.material.opacity = 0.68 + Math.sin(elapsed * 1.4) * 0.08;
    coolGlow.material.opacity = 0.44 + Math.cos(elapsed * 1.2) * 0.05;
    camera.position.x += pointerX * 0.08 - camera.position.x * 0.035;
    camera.position.y += -pointerY * 0.06 - camera.position.y * 0.035;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}
