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
