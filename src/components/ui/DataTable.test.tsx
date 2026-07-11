import { render, screen, fireEvent, within } from '@testing-library/react';
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

describe('DataTable v2 features', () => {
  const rows = [
    { id: 1, name: 'Charlie', score: 30 },
    { id: 2, name: 'Alice', score: 10 },
    { id: 3, name: 'Bob', score: 20 },
  ];
  const cols: Column<typeof rows[number]>[] = [
    { header: 'Name', accessorKey: 'name' },
    { header: 'Score', accessorKey: 'score' },
  ];
  const setup = (extra = {}) => {
    uiState.isMobile = false; uiState.isTablet = false; uiState.isDesktop = true;
    return render(<DataTable data={rows} columns={cols} keyExtractor={(r) => r.id} {...extra} />);
  };
  const bodyNames = () =>
    within(screen.getByRole('table')).getAllByRole('row').slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent);

  it('sorts ascending then descending on header click', () => {
    setup();
    const nameHeader = screen.getByText('Name');
    fireEvent.click(nameHeader);
    expect(bodyNames()).toEqual(['Alice', 'Bob', 'Charlie']);
    fireEvent.click(nameHeader);
    expect(bodyNames()).toEqual(['Charlie', 'Bob', 'Alice']);
  });

  it('sorts numeric columns numerically', () => {
    setup();
    fireEvent.click(screen.getByText('Score'));
    expect(bodyNames()).toEqual(['Alice', 'Bob', 'Charlie']); // by score 10,20,30
  });

  it('filters via global search', () => {
    setup({ searchable: true });
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'ali' } });
    expect(bodyNames()).toEqual(['Alice']);
  });

  it('hides a column via the visibility menu', () => {
    setup({ enableColumnVisibility: true });
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Score' }));
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('Score');
  });

  it('toggles an expanded detail row', () => {
    setup({ renderExpanded: (r: typeof rows[number]) => <span>detail-{r.name}</span> });
    expect(screen.queryByText('detail-Charlie')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle('Expand')[0]);
    expect(screen.getByText('detail-Charlie')).toBeInTheDocument();
  });
});
