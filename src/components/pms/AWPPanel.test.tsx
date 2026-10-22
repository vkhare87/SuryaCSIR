import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AWPPanel } from './AWPPanel';
import { emptyAWPContent } from '../../lib/pms/awp';
import type { PMSAWP } from '../../types/pms';

const content = emptyAWPContent();
content.projects[0] = { ...content.projects[0], details: 'Secret strategic sensor', confidential: true };
content.projects[1] = { ...content.projects[1], details: 'Open ICMR exoskeleton' };

const awp: PMSAWP = {
  ...content,
  id: 'a', staffId: 'S1', scientistUserId: null, reportingYear: '2026-27', status: 'APPROVED',
  reportingOfficerId: 'RO', reviewingOfficerId: 'D', roVerdict: 'REASONABLE', roReasons: null,
  roAt: '2026-08-18T00:00:00Z', rvoRemarks: null, rvoAt: null, directorDecision: 'ACCEPTED',
  directorRemarks: null, approvedAt: '2026-08-20T00:00:00Z', communicatedAt: null, returnReasons: null,
  source: 'IMPORTED', sourcePdfPath: null, submittedAt: null, createdAt: '', updatedAt: '',
};

describe('AWPPanel', () => {
  it('shows confidential project text to the plan owner view', () => {
    render(<AWPPanel awp={awp} />);
    expect(screen.getByText('Secret strategic sensor')).toBeInTheDocument();
  });

  it('withholds confidential project text from committees', () => {
    render(<AWPPanel awp={awp} hideConfidential />);
    expect(screen.queryByText('Secret strategic sensor')).not.toBeInTheDocument();
    expect(screen.getByText('Confidential — details withheld')).toBeInTheDocument();
    expect(screen.getByText('Open ICMR exoskeleton')).toBeInTheDocument();
  });
});
