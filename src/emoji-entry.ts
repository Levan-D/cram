// Bundled separately (emoji.bundle.js) and loaded the first time the emoji picker opens.
import { Picker } from 'emoji-mart';
import data from '@emoji-mart/data';

window.__emoji = { Picker: Picker as unknown as new (options: Record<string, unknown>) => HTMLElement, data };
