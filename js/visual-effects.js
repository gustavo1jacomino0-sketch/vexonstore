/* Decorative only. Store, authentication and payment handlers remain untouched. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  document.querySelectorAll('[data-product-id]').forEach(card => {
    let frame;
    const reset = () => {
      cancelAnimationFrame(frame);
      card.style.removeProperty('--vx-rx');
      card.style.removeProperty('--vx-ry');
    };
    card.addEventListener('pointermove', event => {
      if (reduced.matches || !finePointer.matches) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--vx-rx', `${-(event.clientY - rect.top - rect.height / 2) / rect.height * 5}deg`);
        card.style.setProperty('--vx-ry', `${(event.clientX - rect.left - rect.width / 2) / rect.width * 6}deg`);
      });
    });
    card.addEventListener('pointerleave', reset);
    reduced.addEventListener('change', reset);
  });
})();
