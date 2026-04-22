const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

window.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initTerminalPulse();
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
