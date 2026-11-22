import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ItemLink } from './ReportItemsPanel';
import type { PmsReportItem } from '../../types/pms';

const makeItem = (link: string | null, text = 'Evidence item'): PmsReportItem => ({
  id: 'item-1',
  section: 'PROJECT',
  sourceRecordType: null,
  sourceRecordId: null,
  link,
  text,
  state: 'CONFIRMED',
});

describe('ItemLink', () => {
  it.each([
    'https://example.com/paper',
    'http://example.com/paper',
    'HTTPS://example.com/upper',
  ])('renders external anchor for %s', (url) => {
    render(<MemoryRouter><ItemLink item={makeItem(url)} /></MemoryRouter>);
    const anchor = screen.getByRole('link', { name: 'Evidence item' });
    expect(anchor).toHaveAttribute('href', url);
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noreferrer');
  });

  it.each(['/projects/P1', '/'])('renders internal router link for single-slash path %s', (path) => {
    render(<MemoryRouter><ItemLink item={makeItem(path)} /></MemoryRouter>);
    const anchor = screen.getByRole('link', { name: 'Evidence item' });
    expect(anchor).toHaveAttribute('href', path);
    expect(anchor).not.toHaveAttribute('target');
  });

  it.each([
    null,
    '//evil.example/phish',
    '/\\evil.example/phish',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'relative/no-leading-slash',
  ])('renders plain text instead of a link for unsafe or missing %s', (unsafe) => {
    render(<MemoryRouter><ItemLink item={makeItem(unsafe)} /></MemoryRouter>);
    expect(screen.getByText('Evidence item')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
