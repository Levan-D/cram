// Electron entry for the e2e tests: point userData at the test's temp folder, then start the
// real app (main.js). The test has already written config.json there (notes folder, last note).
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

app.setPath('userData', process.env.NV_USERDATA);
await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'main.js')).href);
