import { describe, it, expect } from 'vitest';
import { careerRowsFromSheet } from './careers';

describe('careerRowsFromSheet', () => {
  it('reads loose column names and Indian dates; never guesses a bad row', () => {
    const { events, bad } = careerRowsFromSheet([
      { 'Staff ID': 'S-1', Event: 'promotion', 'Effective On': '01/07/2022', 'Order No': 'O/7', Summary: 'D to E' },
      { ID: 'S-2', Kind: 'TRANSFER', Date: '2023-02-15' },
      { ID: 'S-3', Kind: 'Award', Date: '2023-02-15' },
      { ID: 'S-4', Kind: 'TRAINING', Date: 'sometime' },
    ]);
    expect(events).toEqual([
      { staff_id: 'S-1', kind: 'PROMOTION', effective_on: '2022-07-01', order_ref: 'O/7', detail: { summary: 'D to E' } },
      { staff_id: 'S-2', kind: 'TRANSFER', effective_on: '2023-02-15' },
    ]);
    expect(bad).toEqual([{ row: 4, reason: 'Unknown kind "AWARD"' }, { row: 5, reason: 'Date missing or not readable' }]);
  });
});
