import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReportWizard } from './ReportWizard';
import { wizardStepsFor } from '../../lib/pms/constants';
import type { PmsTrack, PMSReport, PMSReportSection, PMSAnnexure, PMSAWPActivity } from '../../types/pms';

const saveSection = vi.fn().mockResolvedValue(undefined);
const saveBasicInfo = vi.fn().mockResolvedValue(undefined);
const saveAWPActivities = vi.fn().mockResolvedValue(undefined);
const submitReport = vi.fn().mockResolvedValue(undefined);

vi.mock('../../contexts/PMSContext', () => ({
  usePMS: () => ({
    saveSection, saveBasicInfo, saveAWPActivities, submitReport,
    uploadSignature: vi.fn(), uploadAnnexure: vi.fn(), deleteAnnexure: vi.fn(),
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', activeRole: 'Scientist' } }),
}));

function makeReport(track: PmsTrack): PMSReport & {
  sections: PMSReportSection[]; annexures: PMSAnnexure[]; awpActivities: PMSAWPActivity[];
} {
  return {
    id: 'r1', cycleId: 'c1', scientistId: 'u1', status: 'DRAFT', track,
    periodFrom: null, periodTo: null, selfScore: null, submittedAt: null,
    signatureUrl: null, previousPmsSubmittedOnTime: null, previousPmsSubmissionDate: null,
    dutyDays: null, systemRemark: null, scoreCommunicatedAt: null,
    nonSubmissionCertificatePath: null, createdAt: '', updatedAt: '',
    sections: [], annexures: [], awpActivities: [],
  };
}

function renderWizard(track: PmsTrack) {
  return render(
    <MemoryRouter>
      <ReportWizard report={makeReport(track)} cycleOpen />
    </MemoryRouter>
  );
}

describe('ReportWizard track routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the Annexure-I step count and its first section, not the standard one', () => {
    renderWizard('ANNEXURE_I');
    expect(screen.getByText(`Step 1 of ${wizardStepsFor('ANNEXURE_I').length}`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appendix-A: Identification' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name of the Employee')).toBeInTheDocument();
    // The standard proforma's self-score field must not appear.
    expect(screen.queryByLabelText(/Self Assessment Score/)).not.toBeInTheDocument();
  });

  it('shows the Annexure-II proforma for the Director', () => {
    renderWizard('ANNEXURE_II');
    expect(screen.getByText(`Step 1 of ${wizardStepsFor('ANNEXURE_II').length}`)).toBeInTheDocument();
    expect(screen.getByLabelText('Name of the Director')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name of the Employee')).not.toBeInTheDocument();
  });

  it('still shows the standard proforma with its self score', () => {
    renderWizard('STANDARD');
    expect(screen.getByText(`Step 1 of ${wizardStepsFor('STANDARD').length}`)).toBeInTheDocument();
    // SectionForms pre-dates the htmlFor convention SpecSection follows, so
    // this asserts on the visible label rather than the association.
    expect(screen.getByText(/Self Assessment Score/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Name of the Employee')).not.toBeInTheDocument();
  });

  it('lifts the annexure period dates onto the report when advancing a step', async () => {
    renderWizard('ANNEXURE_I');

    fireEvent.change(screen.getByLabelText('Evaluation period from'), { target: { value: '2025-04-01' } });
    fireEvent.change(screen.getByLabelText('Evaluation period to'),   { target: { value: '2026-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & Next/ }));

    await waitFor(() => expect(saveBasicInfo).toHaveBeenCalled());
    expect(saveBasicInfo).toHaveBeenCalledWith('r1', expect.objectContaining({
      periodFrom: '2025-04-01',
      periodTo: '2026-03-31',
      selfScore: null,
    }));
    expect(saveSection).toHaveBeenCalledWith('r1', 'sr_identification', expect.objectContaining({
      periodFrom: '2025-04-01',
    }));
  });

  it('never saves an AWP for a senior track, which has no Part V', async () => {
    renderWizard('ANNEXURE_II');
    for (const step of wizardStepsFor('ANNEXURE_II')) {
      expect(step.awp).toBeUndefined();
    }
    fireEvent.click(screen.getByRole('button', { name: /Save & Next/ }));
    await waitFor(() => expect(saveSection).toHaveBeenCalled());
    expect(saveAWPActivities).not.toHaveBeenCalled();
  });
});
