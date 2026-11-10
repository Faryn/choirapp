/* Update browser chrome and repaint canvases when the system theme changes. */
(() => {
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  function syncTheme() {
    const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
    window.dispatchEvent(new Event('choir-theme-change'));
  }
  syncTheme();
  preference.addEventListener('change', syncTheme);
})();
