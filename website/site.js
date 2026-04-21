const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

window.addEventListener("DOMContentLoaded", () => {
  initPointerGlow();
  initScrollState();
  initReveal();
  initHeroTilt();
});

function initPointerGlow() {
  if (prefersReducedMotion) {
    return;
  }

  const root = document.documentElement;
  let currentX = window.innerWidth * 0.5;
  let currentY = window.innerHeight * 0.14;
  let targetX = currentX;
  let targetY = currentY;
  let frame = null;

  function tick() {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    root.style.setProperty("--pointer-x", `${currentX}px`);
    root.style.setProperty("--pointer-y", `${currentY}px`);

    if (Math.abs(targetX - currentX) > 0.2 || Math.abs(targetY - currentY) > 0.2) {
      frame = window.requestAnimationFrame(tick);
      return;
    }

    frame = null;
  }

  document.addEventListener("pointermove", (event) => {
    targetX = event.clientX;
    targetY = event.clientY;

    if (!frame) {
      frame = window.requestAnimationFrame(tick);
    }
  }, { passive: true });
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

  if (!elements.length) {
    return;
  }

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
  );

  elements.forEach((element) => observer.observe(element));
}

function initCopyChecksum() {
  const button = document.querySelector("[data-copy-checksum]");
  const checksum = document.querySelector("[data-checksum-value]");

  if (!(button instanceof HTMLButtonElement) || !(checksum instanceof HTMLElement)) {
    return;
  }

  const defaultLabel = button.textContent?.trim() || "Copy checksum";

  button.addEventListener("click", async () => {
    const value = checksum.textContent?.trim() || "";

    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
      button.setAttribute("aria-label", "Checksum copied to clipboard");
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(checksum);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("copy");
      selection?.removeAllRanges();
      button.textContent = "Copied";
    }

    window.setTimeout(() => {
      button.textContent = defaultLabel;
      button.setAttribute("aria-label", "Copy checksum to clipboard");
    }, 1600);
  });
}

function initHeroTilt() {
  if (prefersReducedMotion || !finePointer) {
    return;
  }

  const card = document.querySelector(".hero-visual");
  if (!(card instanceof HTMLElement)) {
    return;
  }

  let animate = null;
  let rotateX = 0;
  let rotateY = 0;
  let targetX = 0;
  let targetY = 0;

  function tick() {
    rotateX += (targetX - rotateX) * 0.08;
    rotateY += (targetY - rotateY) * 0.08;
    card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-1px)`;

    if (Math.abs(targetX - rotateX) > 0.01 || Math.abs(targetY - rotateY) > 0.01) {
      animate = window.requestAnimationFrame(tick);
      return;
    }

    animate = null;
  }

  card.addEventListener("pointermove", (event) => {
    const bounds = card.getBoundingClientRect();
    const percentX = (event.clientX - bounds.left) / bounds.width;
    const percentY = (event.clientY - bounds.top) / bounds.height;

    targetY = (percentX - 0.5) * 4.8;
    targetX = (0.5 - percentY) * 4.8;

    if (!animate) {
      animate = window.requestAnimationFrame(tick);
    }
  });

  card.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;

    if (!animate) {
      animate = window.requestAnimationFrame(tick);
    }
  });
}
