import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataTable, type Column } from './DataTable';

const uiState = { isMobile: false, isTablet: false, isDesktop: true };
vi.mock('../../contexts/UIContext', () => ({
  useUI: () => uiState,
}));

interface Row { id: number; name: string }
const data: Row[] = [{ id: 1, name: 'Acme Instrument' }];
const columns: Column<Row>[] = [
  { header: 'Name', accessorKey: 'name' },
  { header: '', cell: () => <button>Edit</button> },
];

describe('DataTable responsive view', () => {
  it('renders a real <table> on desktop', () => {
    uiState.isMobile = false; uiState.isTablet = false; uiState.isDesktop = true;
    render(<DataTable data={data} columns={columns} keyExtractor={(r) => r.id} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders generic stacked cards (no table) on tablet when no renderGridItem', () => {
    uiState.isMobile = false; uiState.isTablet = true; uiState.isDesktop = false;
    render(<DataTable data={data} columns={columns} keyExtractor={(r) => r.id} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Acme Instrument')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('defaults to custom grid on tablet when renderGridItem is provided', () => {
    uiState.isMobile = false; uiState.isTablet = true; uiState.isDesktop = false;
    render(
      <DataTable
        data={data}
        columns={columns}
        keyExtractor={(r) => r.id}
        renderGridItem={(r) => <div>CARD:{r.name}</div>}
      />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('CARD:Acme Instrument')).toBeInTheDocument();
  });
});
