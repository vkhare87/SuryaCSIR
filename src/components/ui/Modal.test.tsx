import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal keyboard basics', () => {
  it('is a labelled dialog that takes focus and closes on Escape', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Edit thing">body</Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Edit thing' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('returns focus to the opener when closed', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<Modal isOpen onClose={() => {}} title="T">x</Modal>);
    rerender(<Modal isOpen={false} onClose={() => {}} title="T">x</Modal>);
    expect(document.activeElement).toBe(opener);
  });
});

describe('Modal focus containment (BUG-21)', () => {
  it('Tab and Shift+Tab wrap inside the panel', () => {
    render(<Modal isOpen onClose={() => {}} title="T"><button>body</button><button>last</button></Modal>);
    const first = screen.getByRole('button', { name: 'Close' }); // the header's own button comes first
    const last = screen.getByRole('button', { name: 'last' });
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('makes the rest of the page inert and locks scroll while open, and undoes both on close', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const { rerender } = render(<Modal isOpen onClose={() => {}} title="T">x</Modal>);
    expect(outside.inert).toBe(true);
    const backdrop = screen.getByRole('dialog').previousElementSibling as HTMLElement;
    expect(backdrop.inert).toBeFalsy(); // click-to-close keeps working
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Modal isOpen={false} onClose={() => {}} title="T">x</Modal>);
    expect(outside.inert).toBe(false);
    expect(document.body.style.overflow).toBe('');
    outside.remove();
  });
});
