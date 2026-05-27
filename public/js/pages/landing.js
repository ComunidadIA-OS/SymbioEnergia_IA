/* Landing page — animaciones y contador de cifras */

const WORD_INTERVAL_MS = 2800;
const COUNT_DURATION_MS = 1800;

function animateCount(el) {
  const target = parseInt(el.dataset.count, 10);
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / COUNT_DURATION_MS, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target).toLocaleString('es-ES');
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });

  counters.forEach(el => observer.observe(el));
}

function initWordRotator() {
  const words = document.querySelectorAll('.hero__word');
  if (!words.length) return;

  let current = 0;

  words[current].classList.add('hero__word--active');

  setInterval(() => {
    const prev = current;
    current = (current + 1) % words.length;

    words[prev].classList.remove('hero__word--active');
    words[prev].classList.add('hero__word--exit');

    setTimeout(() => {
      words[prev].classList.remove('hero__word--exit');
      words[prev].style.transform = 'translateY(100%)';
      words[prev].style.opacity = '0';

      words[current].style.transform = '';
      words[current].style.opacity = '';
      words[current].classList.add('hero__word--active');
    }, 400);

  }, WORD_INTERVAL_MS);
}

document.addEventListener('DOMContentLoaded', () => {
  initWordRotator();
  initCounters();
});
