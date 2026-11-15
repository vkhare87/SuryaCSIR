import { describe, it, expect, vi, beforeEach } from 'vitest';
import { moveIn, readLayout, toggleIn, writeLayout } from './sidebarLayout';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
});

describe('sidebarLayout', () => {
  beforeEach(() => store.clear());

  it('gives the default when nothing or rubbish is stored', () => {
    expect(readLayout('k')).toEqual({ pins: null, closed: [], collapsed: false });
    store.set('k', '{not json');
    expect(readLayout('k').pins).toBeNull();
    store.set('k', JSON.stringify({ pins: [1, 2], closed: 'x', collapsed: 'yes' }));
    expect(readLayout('k')).toEqual({ pins: null, closed: [], collapsed: false });
  });

  it('reads back what was written', () => {
    const layout = { pins: ['/work', '/'], closed: ['Admin'], collapsed: true };
    writeLayout('k', layout);
    expect(readLayout('k')).toEqual(layout);
  });

  it('pins, unpins and moves within bounds', () => {
    expect(toggleIn(['/a'], '/b')).toEqual(['/a', '/b']);
    expect(toggleIn(['/a', '/b'], '/a')).toEqual(['/b']);
    expect(moveIn(['/a', '/b', '/c'], '/c', -1)).toEqual(['/a', '/c', '/b']);
    expect(moveIn(['/a', '/b'], '/a', -1)).toEqual(['/a', '/b']);
    expect(moveIn(['/a', '/b'], '/b', 1)).toEqual(['/a', '/b']);
  });
});
