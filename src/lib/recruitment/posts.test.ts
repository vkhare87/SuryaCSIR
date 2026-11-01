import { describe, it, expect } from 'vitest';
import { withPostTotals } from './posts';
import { mapVacancyAdvertisementRow } from '../../utils/dataMapper';

describe('withPostTotals (BUG-09)', () => {
  it('reads the real columns and totals positions across posts', () => {
    const ad = mapVacancyAdvertisementRow({ id: 'A1', title: 'T', division_code: 'IMD', closing_date: '2026-12-15', status: 'Open' });
    const [out] = withPostTotals([ad], [
      { advertisement_id: 'A1', designation: 'Scientist', no_of_positions: 2 },
      { advertisement_id: 'A1', designation: 'Senior Scientist', no_of_positions: 1 },
      { advertisement_id: 'OTHER', designation: 'Technician', no_of_positions: 5 },
    ]);
    expect(out.division).toBe('IMD');
    expect(out.applicationDeadline).toBe('2026-12-15');
    expect(out.designation).toBe('Scientist, Senior Scientist');
    expect(out.numberOfPositions).toBe(3);
  });
});
