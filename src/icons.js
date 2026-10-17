// Inline SVG icons (24×24, stroke = currentColor). Hand-drawn in the style of Lucide.
const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  find: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M14 3v5h5"/><circle cx="16" cy="16" r="3"/><path d="m21 21-2.6-2.6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  panel: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  toc: svg('<path d="M4 6h1M9 6h11M4 12h1M9 12h11M4 18h1M9 18h11"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  read: svg('<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2Z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7Z"/>'),
  save: svg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
  up: svg('<path d="m18 15-6-6-6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'),
  monitor: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>'),
  starFilled: svg('<path fill="currentColor" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>'),
  listOrdered: svg('<path d="M10 6h10M10 12h10M10 18h10M4 4.5 5 4v5M4 9h2M4 14a1.5 1.5 0 0 1 2.5 1.1L4 19h3"/>'),
  task: svg('<rect x="3" y="4" width="6" height="6" rx="1"/><path d="m3.5 16 2 2 3.5-4M13 7h8M13 16h8"/>'),
  quote: svg('<path d="M4 6v12M9 8h11M9 12h11M9 16h7"/>'),
  code: svg('<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>'),
  codeBlock: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 10-2 2 2 2M14 10l2 2-2 2"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  table: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M12 4v16"/>'),
  hr: svg('<path d="M3 12h18"/><path d="M6 7h12M6 17h12" opacity=".35"/>'),
};

// Fill every <span class="icon" data-icon="name"> under root.
export function mountIcons(root = document) {
  root.querySelectorAll('.icon[data-icon]').forEach((el) => {
    el.innerHTML = icons[el.dataset.icon] || '';
  });
}
