import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';

function Picker() {
  const { setDensity } = useTheme();
  return <button onClick={() => setDensity('compact')}>compact</button>;
}

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});

describe('Data Density (BUG-24)', () => {
  it('drives data-density on <html>, which the CSS keys off', () => {
    render(<ThemeProvider><Picker /></ThemeProvider>);
    expect(document.documentElement.dataset.density).toBe('medium');
    fireEvent.click(screen.getByRole('button', { name: 'compact' }));
    expect(document.documentElement.dataset.density).toBe('compact');
  });
});
