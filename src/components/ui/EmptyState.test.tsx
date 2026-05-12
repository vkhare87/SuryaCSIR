import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <MemoryRouter>
        <EmptyState title="No staff records" description="Upload via Data Management." />
      </MemoryRouter>
    );
    expect(screen.getByText('No staff records')).toBeInTheDocument();
    expect(screen.getByText('Upload via Data Management.')).toBeInTheDocument();
  });

  it('renders the CTA link when action is provided', () => {
    render(
      <MemoryRouter>
        <EmptyState title="No staff" action={{ label: 'Upload data', to: '/data' }} />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'Upload data' });
    expect(link).toHaveAttribute('href', '/data');
  });

  it('omits CTA when action is undefined', () => {
    render(
      <MemoryRouter>
        <EmptyState title="No data" />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the icon when provided', () => {
    render(
      <MemoryRouter>
        <EmptyState title="No data" icon={Inbox} />
      </MemoryRouter>
    );
    expect(document.querySelector('svg')).toBeInTheDocument();
  });
});
