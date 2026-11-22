import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommandPalette from './CommandPalette';

const mockNavigate = vi.fn();
const mockSetTheme = vi.fn();
const mockSetDensity = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ role: 'Director', roles: ['Director', 'Scientist'], setActiveRole: vi.fn() }),
}));

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: mockSetTheme, density: 'medium', setDensity: mockSetDensity }),
}));

vi.mock('../contexts/FeatureControlContext', () => ({
  useFeatureControls: () => ({ canAccess: () => true }),
}));

vi.mock('../contexts/CopilotContext', () => ({
  useCopilot: () => null,
}));

vi.mock('../contexts/DataContext', () => ({
  useData: () => ({
    staff: [{ ID: 'S1', Name: 'Dr. Ananya Rao', Designation: 'Principal Scientist', Division: 'AMD' }],
    projects: [{ ProjectID: 'P1', ProjectNo: 'GAP-0421', ProjectName: 'Solar Nanomaterials', PrincipalInvestigator: 'Dr. Ananya Rao', SponsorerName: 'DST' }],
    phDStudents: [],
    scientificOutputs: [],
    ipIntelligence: [],
    equipment: [],
    divisions: [],
    meetings: [],
  }),
}));

vi.mock('../lib/documents/registry', () => ({
  searchDocuments: vi.fn().mockResolvedValue([]),
  getDocumentUrl: vi.fn(),
  openDocumentUrl: vi.fn(),
}));

describe('CommandPalette keyboard-first command center', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSetTheme.mockReset();
    mockSetDensity.mockReset();
  });

  it('shows recent visits when empty and executes via ArrowDown + Enter', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <CommandPalette
          isOpen
          onClose={onClose}
          recentRoutes={[
            { path: '/projects/P1', label: 'GAP-0421', visitedAt: 100 },
            { path: '/staff/S1', label: 'Dr. Ananya Rao', visitedAt: 90 },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('GAP-0421')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/staff/S1');
    expect(onClose).toHaveBeenCalled();
  });

  it('jumps to pages and triggers theme action by typing + Enter', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <CommandPalette isOpen onClose={onClose} />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText(/Search commands, pages, or records/i);
    fireEvent.change(input, { target: { value: 'Night' } });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
    expect(onClose).toHaveBeenCalled();
  });
});
