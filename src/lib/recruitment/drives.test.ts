import { describe, it, expect } from 'vitest';
import { drivesByStage, DRIVE_STAGES } from './drives';
import type { VacancyAdvertisement } from '../../types';

function ad(over: Partial<VacancyAdvertisement>): VacancyAdvertisement {
  return { id: 'v', title: 'T', description: '', designation: '', division: '',
           numberOfPositions: 1, qualifications: '', applicationDeadline: '',
           createdAt: '', status: 'Open', staffCategory: 'Permanent',
           driveStage: 'Advertised', ...over };
}

describe('drivesByStage', () => {
  it('has 8 ordered stages', () => {
    expect(DRIVE_STAGES[0]).toBe('Advertised');
    expect(DRIVE_STAGES).toHaveLength(8);
  });

  it('splits counts by staff category per stage', () => {
    const rows = drivesByStage([
      ad({ driveStage: 'Interviews' }),
      ad({ driveStage: 'Interviews', staffCategory: 'Project' }),
      ad({ driveStage: 'Joined', staffCategory: 'Project' }),
    ]);
    const interviews = rows.find(r => r.stage === 'Interviews')!;
    expect(interviews.permanent).toBe(1);
    expect(interviews.project).toBe(1);
    expect(rows.find(r => r.stage === 'Joined')!.project).toBe(1);
    expect(rows.find(r => r.stage === 'Advertised')!.permanent).toBe(0);
  });
});
