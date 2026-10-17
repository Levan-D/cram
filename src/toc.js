// Table of contents: gives headings GitHub-style ids (so #anchor links work) and builds a
// clickable outline with "you are here" tracking.

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-') || 'section';

// Assign unique ids to h1–h4 inside container. Returns the headings.
export function idHeadings(container) {
  const seen = new Map();
  const headings = [...container.querySelectorAll('h1, h2, h3, h4')];
  for (const h of headings) {
    const base = slugify(h.textContent);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    h.id = n ? `${base}-${n}` : base;
  }
  return headings;
}

export function createToc({ list, scroller, onNavigate }) {
  let headings = [];
  let links = [];

  function build(hs) {
    headings = hs;
    // Indent relative to the shallowest heading level present, so a note with only h2/h3 isn't over-indented.
    const min = Math.min(...hs.map((h) => Number(h.tagName[1])));
    links = hs.map((h) => {
      const li = document.createElement('li');
      li.className = `lvl-${Number(h.tagName[1]) - min + 1}`;
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.title = h.textContent;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        h.scrollIntoView({ block: 'start' });
        onNavigate?.();
      });
      li.append(a);
      return li;
    });
    list.replaceChildren(...links);
    requestAnimationFrame(spy); // measure after the note is laid out and visible
  }

  // Highlight the last heading that has scrolled past the top of the reading area.
  function spy() {
    if (!headings.length || !scroller.clientHeight) return; // hidden: nothing to measure yet
    const top = scroller.getBoundingClientRect().top + 24;
    let idx = 0;
    headings.forEach((h, i) => { if (h.getBoundingClientRect().top <= top) idx = i; });
    links.forEach((li, i) => li.firstChild.classList.toggle('current', i === idx));
  }

  let raf = 0;
  scroller.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(spy);
  });

  return { build, get count() { return headings.length; } };
}
