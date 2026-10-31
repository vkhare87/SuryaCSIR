import { equipmentStatusClass } from '../../utils/equipmentStatus';
import type { Equipment, PhDStudent, VacancyAdvertisement } from '../../types';

type Dims<T> = Record<string, (row: T) => string | null>;

// One bucketing function per chart dimension, shared by the analytics charts
// (to group) and the list pages (via applyChartFilter, to filter). Sharing them
// is what keeps chart and list counts equal — blanks land in the same bucket.

export const PHD_DIMS: Dims<PhDStudent> = {
  status:         (s) => s.CurrentStatus,
  supervisor:     (s) => s.SupervisorName || 'Unassigned',
  specialization: (s) => s.Specialization || 'Unspecified',
  division:       (s) => s.DivisionCode || 'Unspecified',
};

export const EQUIPMENT_DIMS: Dims<Equipment> = {
  status:   (e) => equipmentStatusClass(e.WorkingStatus),
  division: (e) => e.Division || 'Unspecified',
  lab:      (e) => e.lab_id ?? null,
};

export const VACANCY_DIMS: Dims<VacancyAdvertisement> = {
  status:  (v) => v.status,
  vacancy: (v) => v.id,
};
