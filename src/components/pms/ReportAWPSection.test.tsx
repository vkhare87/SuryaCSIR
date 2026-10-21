import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportAWPSection } from './ReportAWPSection';
import { emptyAWPContent } from '../../lib/pms/awp';
import type { AWPStatus, PMSAWP } from '../../types/pms';

const awp = (status: AWPStatus, year: string): PMSAWP => {
  const c = emptyAWPContent();
  c.projects[0] = { ...c.projects[0], details: 'Confidential gripper', confidential: true };
  c.institutionalWork = 'Safety committee member';
  return {
    ...c, id: `a-${year}`, staffId: 'S1', scientistUserId: 'u1', reportingYear: year, status,
    reportingOfficerId: null, reviewingOfficerId: null, roVerdict: null, roReasons: null, roAt: null,
    rvoRemarks: null, rvoAt: null, directorDecision: null, directorRemarks: null, approvedAt: null,
    communicatedAt: null, returnReasons: null, source: 'IMPORTED', sourcePdfPath: null, submittedAt: null,
    createdAt: '', updatedAt: '',
  };
};

let awps: PMSAWP[] = [];
vi.mock('../../contexts/AWPContext', () => ({
  useAWP: () => ({ awpFor: (s: string, y: string) => awps.find(a => a.staffId === s && a.reportingYear === y) }),
}));
vi.mock('../../contexts/DataContext', () => ({
  useData: () => ({ staff: [{ ID: 'S1', user_id: 'u1', Name: 'Test Scientist' }] }),
}));

const report = { scientistId: 'u1', periodFrom: '2026-04-01', periodTo: '2027-03-31' };

describe('ReportAWPSection', () => {
  it('shows the approved AWP of the report year, hiding confidential projects', () => {
    awps = [awp('APPROVED', '2026-27'), awp('APPROVED', '2025-26')];
    render(<ReportAWPSection report={report} />);
    expect(screen.getByText('Annual Work Plan 2026-27')).toBeInTheDocument();
    expect(screen.getByText('Safety committee member')).toBeInTheDocument();
    expect(screen.queryByText('Confidential gripper')).not.toBeInTheDocument();
  });

  it('says when no approved AWP is on record', () => {
    awps = [awp('WITH_DIRECTOR', '2026-27')];
    render(<ReportAWPSection report={report} />);
    expect(screen.getByText(/No approved Annual Work Plan on record for 2026-27/)).toBeInTheDocument();
    expect(screen.getByText(/With Director/)).toBeInTheDocument();
  });
});
