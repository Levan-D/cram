// Cram: renderer entry (bundled by esbuild into renderer.bundle.js).
// Talks to the main process only through window.notesApi (preload.cjs, typed in api.ts). All
// writes and all file warnings happen in the main process; the renderer only decides *when* to ask.
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './quiz'; // registers the quiz with actions (menus, opening notes)

createRoot(document.getElementById('app')!).render(<App />);

