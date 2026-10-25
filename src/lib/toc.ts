// Headings for the table of contents and #anchor links.

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-') || 'section';

// Give h1–h4 inside container unique GitHub-style ids (so #anchor links work). Returns them.
export function idHeadings(container: HTMLElement): HTMLHeadingElement[] {
  const seen = new Map<string, number>();
  const headings = [...container.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4')];
  for (const h of headings) {
    const base = slugify(h.textContent || '');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    h.id = n ? `${base}-${n}` : base;
  }
  return headings;
}

// Markdown headings outside fenced code: [{ level, text, pos }] (pos = offset of the line start).
export function markdownHeadings(text: string): { level: number; text: string; pos: number }[] {
  const out: { level: number; text: string; pos: number }[] = [];
  let fence = false;
  let pos = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence) {
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) out.push({ level: m[1]!.length, text: m[2]!, pos });
    }
    pos += line.length + 1;
  }
  return out;
}

// Normalizes heading text for matching a quiz section to a rendered heading.
export const headingKey = (s: string) => s.replace(/[*_`➕]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
