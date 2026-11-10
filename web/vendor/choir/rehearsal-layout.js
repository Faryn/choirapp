/* UI-only sizing and dismissal. Does not touch audio, score sync or loop state. */
(() => {
  const panel = document.querySelector('.player-panel');
  const settings = document.getElementById('playerSettings');
  if (!panel) return;

  const updateHeight = () => {
    document.documentElement.style.setProperty('--player-height', `${Math.ceil(panel.getBoundingClientRect().height)}px`);
  };
  updateHeight();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateHeight).observe(panel);
  window.addEventListener('resize', updateHeight);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !settings?.open) return;
    settings.open = false;
    settings.querySelector('summary')?.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (settings?.open && !settings.contains(event.target)) settings.open = false;
  });
})();
