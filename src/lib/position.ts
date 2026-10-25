// Read ⇄ edit position sync. A position is the markdown source line at the top of the view
// (with a fraction), not pixels. The main process tags every rendered block with data-line, so
// read mode maps lines to pixels by interpolating between blocks. The math is pure (and tested);
// the DOM wrappers just measure.

export interface Mark { line: number; top: number }

// Which source line sits at viewport y=`top`, given block marks sorted by position.
// `bottom`/`lastLine` stand in for the "next mark" after the last block.
export function lineAt(marks: Mark[], top: number, bottom: number, lastLine: number): number {
  if (!marks.length) return 0;
  let i = 0;
  while (i + 1 < marks.length && marks[i + 1]!.top <= top) i++;
  const a = marks[i]!;
  if (top <= a.top) return a.line;
  const next = marks[i + 1];
  const tb = next ? next.top : bottom;
  const lb = next ? next.line : lastLine;
  return tb > a.top ? a.line + Math.min(1, (top - a.top) / (tb - a.top)) * (lb - a.line) : a.line;
}

// The viewport y where source line `x` is.
export function yForLine(marks: Mark[], x: number, bottom: number, lastLine: number): number {
  if (!marks.length) return 0;
  let i = 0;
  while (i + 1 < marks.length && marks[i + 1]!.line <= x) i++;
  const a = marks[i]!;
  const next = marks[i + 1];
  const tb = next ? next.top : bottom;
  const lb = next ? next.line : lastLine;
  return lb > a.line ? a.top + Math.min(1, Math.max(0, (x - a.line) / (lb - a.line))) * (tb - a.top) : a.top;
}

const lineCount = (source: string) => (source.match(/\n/g) || []).length + 1;

function measure(body: HTMLElement): Mark[] {
  return [...body.querySelectorAll<HTMLElement>('[data-line]')]
    .filter((el) => el.getClientRects().length)
    .map((el) => ({ line: Number(el.dataset.line), top: el.getBoundingClientRect().top }));
}

export function readerTopLine(reader: HTMLElement, body: HTMLElement, source: string): number {
  return lineAt(measure(body), reader.getBoundingClientRect().top + 1, body.getBoundingClientRect().bottom, lineCount(source));
}

export function scrollReaderToLine(reader: HTMLElement, body: HTMLElement, source: string, x: number) {
  const marks = measure(body);
  if (!marks.length || x <= 0) { reader.scrollTop = 0; return; }
  const y = yForLine(marks, x, body.getBoundingClientRect().bottom, lineCount(source));
  reader.scrollTop += y - reader.getBoundingClientRect().top;
}
