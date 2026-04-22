const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;

const TONES = {
  hero: {
    accent: "#ff9d6b",
    accentSoft: "rgba(255, 157, 107, 0.18)",
    accentFaint: "rgba(255, 157, 107, 0.05)",
    accent2: "#8b7cff",
    accent3: "#7dd9ff",
  },
  signal: {
    accent: "#7dd9ff",
    accentSoft: "rgba(125, 217, 255, 0.16)",
    accentFaint: "rgba(125, 217, 255, 0.045)",
    accent2: "#8b7cff",
    accent3: "#ffb38d",
  },
  violet: {
    accent: "#8b7cff",
    accentSoft: "rgba(139, 124, 255, 0.16)",
    accentFaint: "rgba(139, 124, 255, 0.04)",
    accent2: "#ff9d6b",
    accent3: "#7dd9ff",
  },
  amber: {
    accent: "#ffb38d",
    accentSoft: "rgba(255, 179, 141, 0.16)",
    accentFaint: "rgba(255, 179, 141, 0.045)",
    accent2: "#7dd9ff",
    accent3: "#8b7cff",
  },
  graphite: {
    accent: "#cfd6e6",
    accentSoft: "rgba(207, 214, 230, 0.12)",
    accentFaint: "rgba(207, 214, 230, 0.035)",
    accent2: "#8b7cff",
    accent3: "#7dd9ff",
  },
};

window.addEventListener("DOMContentLoaded", () => {
  initCursorGlow();
  initReveal();
  initToneObserver();
  initBackgroundCanvas();
});

function initCursorGlow() {
  document.addEventListener(
    "pointermove",
    (event) => {
      root.style.setProperty("--cursor-x", `${event.clientX}px`);
      root.style.setProperty("--cursor-y", `${event.clientY}px`);
    },
    { passive: true }
  );
}

function initReveal() {
  const elements = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!elements.length) return;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
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
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
  );

  elements.forEach((element) => observer.observe(element));
}

function initToneObserver() {
  const sections = Array.from(document.querySelectorAll("[data-tone]"));
  if (!sections.length || !("IntersectionObserver" in window)) {
    applyTone("hero");
    return;
  }

  let currentTone = "hero";
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const tone = visible.target.dataset.tone || "hero";
      if (tone !== currentTone) {
        currentTone = tone;
        applyTone(tone);
      }
    },
    { threshold: [0.22, 0.38, 0.55, 0.7] }
  );

  sections.forEach((section) => observer.observe(section));
  applyTone(currentTone);
}

function applyTone(tone) {
  const palette = TONES[tone] || TONES.hero;
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--accent-soft", palette.accentSoft);
  root.style.setProperty("--accent-faint", palette.accentFaint);
  root.style.setProperty("--accent-2", palette.accent2);
  root.style.setProperty("--accent-3", palette.accent3);
  document.body.dataset.tone = tone;
}

function initBackgroundCanvas() {
  const canvas = document.getElementById("bg-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let tone = "hero";
  let cursorX = 0.5;
  let cursorY = 0.22;
  let targetX = 0.5;
  let targetY = 0.22;
  let scrollFactor = 0;
  let hubs = [];
  let stars = [];
  let arcs = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.floor(window.innerWidth));
    height = Math.max(1, Math.floor(window.innerHeight));
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildField();
  }

  function buildField() {
    const presets = {
      hero: [
        [0.54, 0.12],
        [0.18, 0.22],
        [0.82, 0.22],
        [0.7, 0.7],
        [0.28, 0.8],
      ],
      signal: [
        [0.48, 0.16],
        [0.22, 0.3],
        [0.76, 0.28],
        [0.82, 0.72],
        [0.2, 0.76],
      ],
      violet: [
        [0.56, 0.16],
        [0.26, 0.22],
        [0.82, 0.18],
        [0.72, 0.74],
        [0.34, 0.82],
      ],
      amber: [
        [0.52, 0.18],
        [0.2, 0.28],
        [0.8, 0.28],
        [0.78, 0.68],
        [0.3, 0.8],
      ],
      graphite: [
        [0.5, 0.18],
        [0.24, 0.28],
        [0.76, 0.26],
        [0.74, 0.72],
        [0.28, 0.8],
      ],
    };

    const colors = {
      hero: ["255,157,107", "139,124,255", "125,217,255"],
      signal: ["125,217,255", "139,124,255", "255,179,141"],
      violet: ["139,124,255", "255,157,107", "125,217,255"],
      amber: ["255,179,141", "125,217,255", "139,124,255"],
      graphite: ["207,214,230", "139,124,255", "125,217,255"],
    };

    hubs = (presets[tone] || presets.hero).map(([nx, ny], index) => ({
      x: nx * width,
      y: ny * height,
      r: 3 + index * 0.2,
      color: colors[tone][index % colors[tone].length],
    }));

    stars = Array.from({ length: 120 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.5 + Math.random() * 1.6,
      a: 0.05 + Math.random() * 0.18,
      drift: 0.08 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
    }));

    arcs = Array.from({ length: 14 }, (_, index) => ({
      hub: index % hubs.length,
      radius: 100 + Math.random() * Math.min(width, height) * 0.18,
      start: Math.random() * Math.PI * 2,
      span: 0.16 + Math.random() * 0.44,
      speed: 0.000045 + Math.random() * 0.00009,
      alpha: 0.02 + Math.random() * 0.024,
      color: index % 3 === 0 ? "255,157,107" : index % 3 === 1 ? "139,124,255" : "125,217,255",
    }));
  }

  function draw(t) {
    cursorX += (targetX - cursorX) * 0.04;
    cursorY += (targetY - cursorY) * 0.04;
    ctx.clearRect(0, 0, width, height);

    drawWash(t);
    drawGrid(t);
    drawContours(t);
    drawArcs(t);
    drawLinks();
    drawHubs(t);
    drawStars(t);
    drawFocus(t);

    if (!prefersReducedMotion) requestAnimationFrame(draw);
  }

  function drawWash(t) {
    const px = cursorX * width;
    const py = cursorY * height;

    const glowA = ctx.createRadialGradient(px, py, 0, px, py, Math.min(width, height) * 0.35);
    glowA.addColorStop(0, "rgba(125,217,255,0.08)");
    glowA.addColorStop(0.4, "rgba(125,217,255,0.03)");
    glowA.addColorStop(1, "rgba(125,217,255,0)");
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, width, height);

    const drift = Math.sin(t * 0.00018) * 0.08;
    const glowB = ctx.createRadialGradient(width * (0.2 + drift), height * 0.16, 0, width * (0.2 + drift), height * 0.16, Math.min(width, height) * 0.32);
    glowB.addColorStop(0, "rgba(255,157,107,0.08)");
    glowB.addColorStop(0.48, "rgba(255,157,107,0.025)");
    glowB.addColorStop(1, "rgba(255,157,107,0)");
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, width, height);

    const glowC = ctx.createRadialGradient(width * 0.8, height * 0.14, 0, width * 0.8, height * 0.14, Math.min(width, height) * 0.28);
    glowC.addColorStop(0, "rgba(139,124,255,0.08)");
    glowC.addColorStop(0.5, "rgba(139,124,255,0.028)");
    glowC.addColorStop(1, "rgba(139,124,255,0)");
    ctx.fillStyle = glowC;
    ctx.fillRect(0, 0, width, height);
  }

  function drawGrid(t) {
    const cell = 96;
    const yOffset = ((scrollFactor * 0.18) + t * 0.004) % cell;
    const xOffset = ((scrollFactor * 0.08) + t * 0.003) % cell;

    ctx.save();
    ctx.lineWidth = 1;
    for (let x = -cell + xOffset; x < width + cell; x += cell) {
      ctx.strokeStyle = "rgba(255,255,255,0.016)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = -cell + yOffset; y < height + cell; y += cell) {
      ctx.strokeStyle = "rgba(255,255,255,0.012)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawContours(t) {
    const rows = 10;
    const step = Math.max(42, Math.round(height / rows));
    const base = height * 0.38;

    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 0; i < rows; i++) {
      const y = base + (i - rows / 2) * step * 0.78 + Math.sin(t * 0.00035 + i) * 8;
      const alpha = 0.028 + Math.max(0, 0.025 - Math.abs(i - rows / 2) * 0.0022);
      ctx.strokeStyle = i % 2 === 0 ? `rgba(139,124,255,${alpha})` : `rgba(125,217,255,${alpha * 0.85})`;
      ctx.beginPath();
      const segments = 14;
      for (let s = 0; s <= segments; s++) {
        const x = (width / segments) * s;
        const wave = Math.sin(s * 0.75 + t * 0.001 + i) * 14 + Math.cos(s * 1.35 + t * 0.0006 + i * 1.2) * 8;
        const lift = Math.sin((x / width) * Math.PI * 2 + t * 0.0005 + i * 0.28) * 10;
        const yy = y + wave + lift;
        if (s === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawArcs(t) {
    ctx.save();
    ctx.lineWidth = 1.15;
    arcs.forEach((arc) => {
      const hub = hubs[arc.hub];
      const start = arc.start + t * arc.speed;
      ctx.strokeStyle = `rgba(${arc.color},${arc.alpha})`;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, arc.radius, start, start + arc.span);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawLinks() {
    ctx.save();
    hubs.forEach((a, i) => {
      for (let j = i + 1; j < hubs.length; j++) {
        const b = hubs[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > Math.min(width, height) * 0.52) continue;
        const alpha = Math.max(0.02, 0.05 - d / (Math.min(width, height) * 18));
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  function drawHubs(t) {
    ctx.save();
    hubs.forEach((hub, index) => {
      const pulse = 4 + (Math.sin(t * 0.001 + index) * 0.5 + 0.5) * 8;
      const grad = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, pulse * 4.8);
      grad.addColorStop(0, `rgba(${hub.color},0.95)`);
      grad.addColorStop(0.35, `rgba(${hub.color},0.18)`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, pulse * 4.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.74)";
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, pulse * 0.34, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawStars(t) {
    ctx.save();
    stars.forEach((star, index) => {
      const x = star.x + Math.sin(t * 0.00015 + star.phase + index) * star.drift;
      const y = star.y + Math.cos(t * 0.00012 + star.phase + index) * star.drift;
      ctx.fillStyle = `rgba(255,255,255,${star.a})`;
      ctx.beginPath();
      ctx.arc(x, y, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawFocus(t) {
    const px = cursorX * width;
    const py = cursorY * height;
    const radius = Math.min(width, height) * 0.22;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, radius);
    glow.addColorStop(0, "rgba(125,217,255,0.08)");
    glow.addColorStop(0.5, "rgba(125,217,255,0.03)");
    glow.addColorStop(1, "rgba(125,217,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const seam = ctx.createLinearGradient(0, height * 0.1, width, height * 0.32);
    seam.addColorStop(0, "rgba(255,157,107,0.01)");
    seam.addColorStop(0.48, `rgba(255,255,255,${0.02 + Math.sin(t * 0.0004) * 0.004})`);
    seam.addColorStop(1, "rgba(139,124,255,0.01)");
    ctx.fillStyle = seam;
    ctx.fillRect(0, 0, width, height);
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      targetX = event.clientX / window.innerWidth;
      targetY = event.clientY / window.innerHeight;
    },
    { passive: true }
  );

  window.addEventListener(
    "scroll",
    () => {
      scrollFactor = window.scrollY || 0;
    },
    { passive: true }
  );

  const toneObserver = new MutationObserver(() => {
    const nextTone = document.body.dataset.tone || "hero";
    if (nextTone !== tone) {
      tone = nextTone;
      buildField();
    }
  });
  toneObserver.observe(document.body, { attributes: true, attributeFilter: ["data-tone"] });

  window.addEventListener("resize", resize);
  resize();
  if (prefersReducedMotion) {
    draw(0);
    return;
  }
  requestAnimationFrame(draw);
}
