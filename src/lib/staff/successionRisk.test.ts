import { describe, it, expect } from 'vitest';
import { successionRisk } from './successionRisk';
import type { StaffMember } from '../../types';

function staff(over: Partial<StaffMember>): StaffMember {
  return {
    ID: 's', LabCode: '', EmployeeType: '', Name: 'X', Designation: 'Scientist',
    Group: '', Division: 'CMD', DoAPP: '', DOJ: '', DOB: '', Cat: '',
    AppointmentType: '', Level: '', CoreArea: '', Expertise: '', Email: '',
    Ext: '', VidwanID: '', ReportingID: '', HighestQualification: '', Gender: '',
    ...over,
  };
}

const today = new Date('2026-07-10');

describe('successionRisk', () => {
  it('flags staff retiring within horizon whose CoreArea no one else covers', () => {
    const out = successionRisk([
      staff({ ID: 'a', Name: 'Retiring Alone', DOB: '01/01/1968', CoreArea: 'Corrosion Coatings' }), // retires 2028
      staff({ ID: 'b', Name: 'Young Other', DOB: '01/01/1990', CoreArea: 'Fly Ash' }),
    ], 3, today);
    expect(out).toHaveLength(1);
    expect(out[0].staff.ID).toBe('a');
    expect(out[0].retiresOn.getFullYear()).toBe(2028);
  });

  it('does not flag when a staying colleague shares the CoreArea (case-insensitive)', () => {
    const out = successionRisk([
      staff({ ID: 'a', DOB: '01/01/1968', CoreArea: 'Corrosion Coatings' }),
      staff({ ID: 'b', DOB: '01/01/1990', CoreArea: 'corrosion coatings' }),
    ], 3, today);
    expect(out).toEqual([]);
  });

  it('a fellow retiree with the same area does NOT count as cover', () => {
    const out = successionRisk([
      staff({ ID: 'a', DOB: '01/01/1968', CoreArea: 'Corrosion' }),
      staff({ ID: 'b', DOB: '01/06/1967', CoreArea: 'Corrosion' }), // also retiring in window
    ], 3, today);
    expect(out).toHaveLength(2);
  });

  it('skips blank CoreArea, unparseable DOB, and already-retired staff', () => {
    const out = successionRisk([
      staff({ ID: 'a', DOB: '01/01/1968', CoreArea: '' }),          // no area
      staff({ ID: 'b', DOB: 'garbage', CoreArea: 'Ceramics' }),     // bad DOB
      staff({ ID: 'c', DOB: '01/01/1950', CoreArea: 'Glass' }),     // retired 2010
    ], 3, today);
    expect(out).toEqual([]);
  });

  it('sorts soonest retirement first', () => {
    const out = successionRisk([
      staff({ ID: 'later', DOB: '01/01/1969', CoreArea: 'A' }),
      staff({ ID: 'sooner', DOB: '01/01/1967', CoreArea: 'B' }),
    ], 5, today);
    expect(out.map(r => r.staff.ID)).toEqual(['sooner', 'later']);
  });
});
