// Gemeinsame UI-Bausteine: mobiles Menü und Overlays.

export function initNav() {
  const toggle = document.getElementById('menuToggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
}

export function initModals() {
  const open = id => {
    const m = document.getElementById(id);
    if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
  };
  const closeAll = () => {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  };
  document.querySelectorAll('[data-modal]').forEach(el => {
    el.addEventListener('click', () => open(el.dataset.modal));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el.dataset.modal); } });
  });
  document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeAll(); }));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeAll));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
}
