const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

window.addEventListener("DOMContentLoaded", () => {
  initScrollState();
  initReveal();
});

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
