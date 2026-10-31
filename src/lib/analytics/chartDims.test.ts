import { describe, it, expect } from 'vitest';
import { applyChartFilter } from '../../utils/applyChartFilter';
import { PHD_DIMS, EQUIPMENT_DIMS, VACANCY_DIMS } from './chartDims';
import type { PhDStudent, Equipment, VacancyAdvertisement } from '../../types';

describe('chartDims with applyChartFilter', () => {
  it('finds blank values under the chart bucket label', () => {
    const phd = [{ DivisionCode: '' }, { DivisionCode: 'CMD' }] as PhDStudent[];
    expect(applyChartFilter(phd, { dim: 'division', value: 'Unspecified' }, PHD_DIMS)).toHaveLength(1);
    const eq = [{ Division: '', WorkingStatus: 'not working; no AMC' }] as Equipment[];
    expect(applyChartFilter(eq, { dim: 'division', value: 'Unspecified' }, EQUIPMENT_DIMS)).toHaveLength(1);
    expect(applyChartFilter(eq, { dim: 'status', value: 'Not Working' }, EQUIPMENT_DIMS)).toHaveLength(1);
  });

  it('filters vacancies by status', () => {
    const v = [{ id: 'a', status: 'Open' }, { id: 'b', status: 'Closed' }] as VacancyAdvertisement[];
    expect(applyChartFilter(v, { dim: 'status', value: 'Open' }, VACANCY_DIMS).map(x => x.id)).toEqual(['a']);
  });
});
