// Built separately into mermaid.bundle.js and loaded only when a note contains a diagram,
// so notes without diagrams don't pay for Mermaid's size.
import mermaid from 'mermaid';

window.__mermaid = mermaid;
