import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary, PageErrorCard } from './ErrorBoundary';

function Boom(): never { throw new Error('relation "pms_reports" does not exist'); }

describe('ErrorBoundary', () => {
  it('the app-wide screen does not show the raw error text', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByText(/pms_reports/)).toBeNull();
  });

  it('a page boundary keeps the chrome around it alive (SEC-12)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<div><nav>chrome</nav><ErrorBoundary fallback={<PageErrorCard />}><Boom /></ErrorBoundary></div>);
    expect(screen.getByText('chrome')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/This page hit an error/);
  });
});
