import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportAWPSection } from './ReportAWPSection';
import { emptyAWPContent } from '../../lib/pms/awp';
import type { AWPStatus, PMSAWP } from '../../types/pms';

const awp = (status: AWPStatus, year: string): PMSAWP => {
  const c = emptyAWPContent();
  // What the server returns to committees: confidential details already stripped.
  c.projects[0] = { ...c.projects[0], details: '', objectives: '', resources: '', confidential: true };
  c.institutionalWork = 'Safety committee member';
  return {
    ...c, id: `a-${year}`, staffId: 'S1', scientistUserId: 'u1', reportingYear: year, status,
    reportingOfficerId: null, reviewingOfficerId: null, roVerdict: null, roReasons: null, roAt: null,
    rvoRemarks: null, rvoAt: null, directorDecision: null, directorRemarks: null, approvedAt: null,
    communicatedAt: null, returnReasons: null, source: 'IMPORTED', sourcePdfPath: null, submittedAt: null,
    createdAt: '', updatedAt: '',
  };
};

let server: PMSAWP | null = null;
const awpForReport = vi.fn(async () => server);
vi.mock('../../contexts/AWPContext', () => ({ useAWP: () => ({ awpForReport }) }));

const report = { id: 'r1', periodFrom: '2026-04-01' };

describe('ReportAWPSection', () => {
  it('asks the server for the report\'s AWP — works without the scientist\'s staff row (other-division reviewer)', async () => {
    server = awp('APPROVED', '2026-27');
    render(<ReportAWPSection report={report} />);
    expect(await screen.findByText('Annual Work Plan 2026-27')).toBeInTheDocument();
    expect(awpForReport).toHaveBeenCalledWith('r1');
    expect(screen.getByText('Safety committee member')).toBeInTheDocument();
    expect(screen.getByText('Confidential — details withheld')).toBeInTheDocument();
  });

  it('says when no approved AWP is on record', async () => {
    server = awp('WITH_DIRECTOR', '2026-27');
    render(<ReportAWPSection report={report} />);
    expect(await screen.findByText(/No approved Annual Work Plan on record for 2026-27/)).toBeInTheDocument();
    expect(screen.getByText(/With Director/)).toBeInTheDocument();
  });

  it('copes with no AWP at all', async () => {
    server = null;
    render(<ReportAWPSection report={report} />);
    expect(await screen.findByText(/No approved Annual Work Plan on record for 2026-27/)).toBeInTheDocument();
  });
});
