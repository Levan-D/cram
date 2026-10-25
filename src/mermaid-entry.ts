// Bundled separately (mermaid.bundle.js) and loaded only when a note has a diagram.
import mermaid from 'mermaid';

window.__mermaid = mermaid as unknown as NonNullable<Window['__mermaid']>;
