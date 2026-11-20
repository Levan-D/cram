// The window: sidebar, the note column (toolbar, bars, note area, status bar), the quiz page,
// and the overlays (image library, emoji picker, menus, dialogs, toast). App-wide wiring lives
// here: body classes the stylesheet keys off, the window title, global shortcuts, and the
// main process's events.
import { useEffect } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import { useQuiz, openQuiz, showQuiz, quizzesChanged } from '../quiz';
import { usePomo, fmtLeft, msLeft, refreshToday } from '../pomodoro';
import {
  AUTOSAVE_MS, autosaveTick, closeFindbar, closeUnresolved, cycleTheme, editMenu, enterEdit, exitEdit, focusSearch, goHistory,
  newNote, onDiskChange, openFindbar, renameNote, requestClose, rerenderForTheme, save, setDrawer, setTocPopover,
  setZoom, start, toggleFavorite, toggleSidebar, toggleUnresolved,
} from '../actions';
import { refs } from '../refs';
import { onThemeChange } from '../lib/extras';
import { useMedia, NARROW_QUERY } from './hooks';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { Banner, FindBar, FormatBar, Progress } from './NoteBars';
import { NoteArea } from './NoteArea';
import { StatusBar, Toast } from './StatusBar';
import { QuizPage } from './QuizPage';
import { Unresolved } from './Unresolved';
import { Settings, openSettings } from './Settings';
import { ImageDialog } from './ImageDialog';
import { EmojiPopover } from './EmojiPopover';
import { MenuHost } from './Menu';
import { AskHost } from './Ask';
import { QuizGenHost } from './QuizGen';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || Boolean((el as Element | null)?.closest?.('.cm-editor'));

export function App() {
  // Load the folder once the layout exists (opening a note measures the reader / editor).
  // Transitions switch on only after the first render, so restoring state doesn't animate.
  useEffect(() => {
    void start().then(() => refreshToday()).finally(() => requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('booting'))));
  }, []);
  useBodyClasses();
  useWindowTitle();
  useGlobalKeys();
  useMainProcessEvents();

  const drawerOpen = useApp((s) => s.drawerOpen);
  return (
    <>
      <Sidebar />
      <div id="scrim" hidden={!drawerOpen} onClick={() => setDrawer(false)} />
      <main id="main">
        <Toolbar />
        <Progress />
        <FormatBar />
        <FindBar />
        <Banner />
        <NoteArea />
        <StatusBar />
        <QuizPage />
        <Unresolved />
      </main>
      <ImageDialog />
      <Settings />
      <EmojiPopover />
      <MenuHost />
      <QuizGenHost />
      <AskHost />
      <Toast />
    </>
  );
}

// The stylesheet keys layout off classes on <body>.
function useBodyClasses() {
  const view = useApp((s) => s.view);
  const mode = useApp((s) => s.mode);
  const collapsed = useApp((s) => s.prefs.sidebarCollapsed);
  const drawerOpen = useApp((s) => s.drawerOpen);
  const quizShown = useQuiz((s) => s.shown);
  const unresolvedOpen = useApp((s) => s.unresolvedOpen);
  useEffect(() => {
    const b = document.body.classList;
    b.toggle('has-note', view === 'note');
    b.toggle('no-folder', view === 'welcome');
    b.toggle('mode-read', mode === 'read');
    b.toggle('mode-edit', mode === 'edit');
    b.toggle('sidebar-collapsed', collapsed);
    b.toggle('drawer-open', drawerOpen);
    b.toggle('quiz-open', quizShown);
    b.toggle('unresolved-open', unresolvedOpen);
  }, [view, mode, collapsed, drawerOpen, quizShown, unresolvedOpen]);

  const narrow = useMedia(NARROW_QUERY);
  useEffect(() => { setDrawer(false); }, [narrow]);
}

function useWindowTitle() {
  const title = useApp((s) => s.current?.title);
  const dirty = useApp((s) => s.dirty);
  const pomo = usePomo((s) => (s.phase ? fmtLeft(msLeft(s)) : '')); // the countdown shows in the taskbar too
  useEffect(() => {
    const base = title ? `${dirty ? '• ' : ''}${title} - Cram` : 'Cram';
    document.title = pomo ? `🍅 ${pomo} · ${base}` : base;
  }, [title, dirty, pomo]);
}

function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // CodeMirror (or an input) already handled it
      const s = useApp.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const hasNote = Boolean(s.current);
      // The quiz page handles its own keys; only app-wide ones (search, sidebar, zoom, theme, new) pass.
      const appWide = (mod && ['p', 'k', 'n', '\\', '=', '+', '-', '0', ','].includes(key)) || (mod && e.shiftKey && (key === 'l' || key === 'u'));
      if (useQuiz.getState().shown && !appWide) return;
      const zoom = s.prefs.zoom || 1;

      if ((mod && (key === 'p' || key === 'k')) || (e.key === '/' && !mod && !isTyping(e.target))) {
        e.preventDefault();
        if (s.prefs.root) focusSearch();
      } else if (mod && key === 'f') {
        e.preventDefault();
        if (!hasNote) return;
        if (s.mode === 'edit') refs.editor?.find();
        else openFindbar(s.find.text);
      } else if (mod && key === 'e') {
        e.preventDefault();
        if (hasNote) void (s.mode === 'read' ? enterEdit() : exitEdit());
      } else if (mod && key === 's') {
        e.preventDefault();
        void save();
      } else if (mod && key === 'n') {
        e.preventDefault();
        void newNote();
      } else if (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        void goHistory(e.key === 'ArrowLeft' ? -1 : 1);
      } else if (e.key === 'F2' && hasNote) {
        e.preventDefault();
        void renameNote();
      } else if (mod && e.shiftKey && key === 'q') {
        e.preventDefault();
        const q = useQuiz.getState();
        if ((q.run && !q.run.done) || q.view === 'results') showQuiz(); // waiting in the sidebar box
        else if (s.prefs.root) void openQuiz(hasNote ? 'note' : 'folder', s.current?.path || '');
      } else if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        void cycleTheme();
      } else if (mod && e.shiftKey && key === 'u') {
        e.preventDefault();
        if (s.prefs.root) toggleUnresolved();
      } else if (mod && key === ',') {
        e.preventDefault();
        openSettings();
      } else if (mod && key === 'd') {
        e.preventDefault();
        void toggleFavorite();
      } else if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        setZoom(zoom + 0.1);
      } else if (mod && key === '-') {
        e.preventDefault();
        setZoom(zoom - 0.1);
      } else if (mod && key === '0') {
        e.preventDefault();
        setZoom(1);
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        if (s.prefs.root) toggleSidebar();
      } else if (e.key === 'Escape') {
        if (s.tocPopoverOpen) setTocPopover(false);
        else if (s.drawerOpen) setDrawer(false);
        else if (s.find.open) closeFindbar();
        else if (s.unresolvedOpen) closeUnresolved();
      }
    };
    // Ctrl + wheel zooms.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((useApp.getState().prefs.zoom || 1) + (e.deltaY < 0 ? 0.1 : -0.1));
    };
    // Files dropped anywhere else must not make the window navigate to them.
    const stop = (e: DragEvent) => e.preventDefault();
    document.addEventListener('keydown', onKey);
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('dragover', stop);
    document.addEventListener('drop', stop);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('dragover', stop);
      document.removeEventListener('drop', stop);
    };
  }, []);
}

function useMainProcessEvents() {
  useEffect(() => {
    const offs = [
      api.onChanged((changed) => void onDiskChange(changed)),
      api.onRequestClose(() => void requestClose()),
      api.onNav((dir) => void goHistory(dir === 'back' ? -1 : 1)),
      api.onEditMenu((info) => void editMenu(info)),
      api.onQuizzesChanged(() => void quizzesChanged()),
      onThemeChange(rerenderForTheme), // diagrams follow the light/dark theme
    ];
    const timer = setInterval(autosaveTick, AUTOSAVE_MS);
    return () => { offs.forEach((off) => off()); clearInterval(timer); };
  }, []);
}
