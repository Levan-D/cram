// Edit-mode find & replace panel. Replaces CodeMirror's default panel so it looks like the
// read-mode find bar: one compact row (match count, Aa / ab / .* toggles, prev / next, close),
// plus a replace row that folds out. All the searching itself is CodeMirror's.
import {
  SearchQuery, getSearchQuery, setSearchQuery,
  findNext, findPrevious, replaceNext, replaceAll, closeSearchPanel,
} from '@codemirror/search';
import type { EditorState } from '@codemirror/state';
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view';
import { icons, type IconName } from './icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}
const iconBtn = (name: IconName, title: string, onClick: () => void) => {
  const b = el('button', { type: 'button', className: 'icon-btn', title });
  b.setAttribute('aria-label', title);
  b.innerHTML = `<span class="icon">${icons[name]}</span>`;
  b.addEventListener('click', onClick);
  return b;
};
const toggle = (label: string, title: string, onClick: () => void) => {
  const b = el('button', { type: 'button', className: 'opt', title, textContent: label });
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', onClick);
  return b;
};

// Count matches and find which one is selected (capped so huge notes stay fast).
function countMatches(state: EditorState, query: SearchQuery) {
  if (!query.search || !query.valid) return null;
  const sel = state.selection.main;
  const cursor = query.getCursor(state);
  let n = 0;
  let current = 0;
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    n++;
    if (r.value.from === sel.from && r.value.to === sel.to) current = n;
    if (n >= 5000) break;
  }
  return { n, current };
}

export function createSearchPanel(view: EditorView): Panel {
  let opts = { caseSensitive: false, wholeWord: false, regexp: false };
  let replaceOpen = false;

  const find = el('input', { type: 'search', placeholder: 'Find', spellcheck: false, autocomplete: 'off' });
  const replace = el('input', { type: 'search', placeholder: 'Replace', spellcheck: false, autocomplete: 'off' });
  find.setAttribute('aria-label', 'Find in note');
  replace.setAttribute('aria-label', 'Replace with');
  find.setAttribute('main-field', 'true'); // CodeMirror focuses this when the panel opens

  const count = el('span', { className: 'count muted small' });
  const optCase = toggle('Aa', 'Match case', () => flip('caseSensitive', optCase));
  const optWord = toggle('ab', 'Whole word', () => flip('wholeWord', optWord));
  const optRegex = toggle('.*', 'Regular expression', () => flip('regexp', optRegex));
  optWord.classList.add('word');

  const fold = iconBtn('chevron', 'Toggle replace', () => setReplaceOpen(!replaceOpen));
  fold.classList.add('fold');

  const findRow = el('div', { className: 'row' },
    fold,
    el('span', { className: 'field' }, el('span', { className: 'icon lead', innerHTML: icons.search }), find),
    el('span', { className: 'opts' }, optCase, optWord, optRegex),
    count,
    iconBtn('up', 'Previous match (Shift+Enter)', () => { findPrevious(view); }),
    iconBtn('down', 'Next match (Enter)', () => { findNext(view); }),
    iconBtn('close', 'Close (Esc)', () => { closeSearchPanel(view); view.focus(); }),
  );
  const replaceRow = el('div', { className: 'row replace-row', hidden: true },
    el('span', { className: 'fold-spacer' }),
    el('span', { className: 'field' }, el('span', { className: 'icon lead', innerHTML: icons.edit }), replace),
    el('button', { type: 'button', className: 'small', textContent: 'Replace', title: 'Replace this match (Enter)', onclick: () => replaceNext(view) }),
    el('button', { type: 'button', className: 'small', textContent: 'Replace all', title: 'Replace every match', onclick: () => replaceAll(view) }),
  );
  const dom = el('div', { className: 'nv-search' }, findRow, replaceRow);

  function setReplaceOpen(open: boolean) {
    replaceOpen = open;
    replaceRow.hidden = !open;
    fold.classList.toggle('open', open);
    if (open) replace.focus();
  }

  function flip(key: keyof typeof opts, btn: HTMLButtonElement) {
    opts[key] = !opts[key];
    btn.setAttribute('aria-pressed', String(opts[key]));
    commit();
  }

  function commit() {
    const query = new SearchQuery({ search: find.value, replace: replace.value, ...opts });
    if (!query.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(query) });
    updateCount();
  }

  function updateCount() {
    const res = countMatches(view.state, getSearchQuery(view.state));
    find.classList.toggle('invalid', Boolean(find.value) && !getSearchQuery(view.state).valid);
    count.textContent = !res ? '' : res.n ? `${res.current || '–'} / ${res.n}${res.n >= 5000 ? '+' : ''}` : 'No matches';
  }

  // Pull the current query (e.g. the word under the cursor when opened with Ctrl+F) into the inputs.
  function syncFromState() {
    const q = getSearchQuery(view.state);
    find.value = q.search;
    replace.value = q.replace;
    opts = { caseSensitive: q.caseSensitive, wholeWord: q.wholeWord, regexp: q.regexp };
    optCase.setAttribute('aria-pressed', String(opts.caseSensitive));
    optWord.setAttribute('aria-pressed', String(opts.wholeWord));
    optRegex.setAttribute('aria-pressed', String(opts.regexp));
    updateCount();
  }

  find.addEventListener('input', commit);
  replace.addEventListener('input', commit);
  find.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); (e.shiftKey ? findPrevious : findNext)(view); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(view); view.focus(); }
  });
  replace.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); (e.ctrlKey || e.metaKey ? replaceAll : replaceNext)(view); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(view); view.focus(); }
  });

  return {
    dom,
    top: true,
    mount() { syncFromState(); find.select(); },
    update(u: ViewUpdate) {
      if (u.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))) syncFromState();
      else if (u.docChanged || u.selectionSet) updateCount();
    },
  };
}
