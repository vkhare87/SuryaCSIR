import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25+ ships its own localStorage global (undefined without a storage
// file), and it hides the one jsdom provides.
if (typeof localStorage === 'undefined') {
  const dom = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom;
  if (dom) Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
}

afterEach(() => {
  cleanup();
});
