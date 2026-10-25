// Small text helpers.

export const WORDS_PER_PAGE = 300;

export const countWords = (text: string) => (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

export const pagesFor = (text: string) => Math.max(1, Math.ceil(countWords(text) / WORDS_PER_PAGE));

// Errors from ipcRenderer.invoke carry a prefix the user doesn't need to see.
export const errMsg = (err: unknown) =>
  String((err as Error)?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const stem = (name: string) => name.replace(/\.[^.]+$/, '');

// Long names share prefixes (database-types-…), so keep both ends: "database-ty…types-3".
export const shortName = (s: string, max = 26) => (s.length <= max ? s : `${s.slice(0, max - 10)}…${s.slice(-9)}`);

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
