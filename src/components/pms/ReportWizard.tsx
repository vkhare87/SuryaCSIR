import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ComponentType } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePMS } from '../../contexts/PMSContext';
import { WIZARD_STEPS } from '../../lib/pms/constants';
import { canSubmitReport } from '../../lib/pms/permissions';
import { Button } from '../ui/Button';
import {
  SummaryForm,
  SectionI1Form, SectionI2Form, SectionI3Form,
  SectionI4Form, SectionI5Form, SectionIIForm,
  SectionIIIForm, SectionIVForm,
  SectionVCurriculumForm, SectionVExtensionForm, SectionVOtherForm,
  SectionVINationalForm, SectionVIInternationalForm,
} from './SectionForms';
import { SignatureUpload } from './SignatureUpload';
import { AnnexureUpload } from './AnnexureUpload';
import type { PMSReport, PMSReportSection, PMSAnnexure, SectionKey } from '../../types/pms';

type FullReport = PMSReport & { sections: PMSReportSection[]; annexures: PMSAnnexure[] };
type FormComponent = ComponentType<{ data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }>;

interface Props {
  report: FullReport;
  cycleOpen: boolean;
}

const FORM_MAP: Record<SectionKey, FormComponent> = {
  summary:                  SummaryForm,
  section_i1:               SectionI1Form,
  section_i2:               SectionI2Form,
  section_i3:               SectionI3Form,
  section_i4:               SectionI4Form,
  section_i5:               SectionI5Form,
  section_ii:               SectionIIForm,
  section_iii:              SectionIIIForm,
  section_iv:               SectionIVForm,
  section_v_curriculum:     SectionVCurriculumForm,
  section_v_extension:      SectionVExtensionForm,
  section_v_other:          SectionVOtherForm,
  section_vi_national:      SectionVINationalForm,
  section_vi_international: SectionVIInternationalForm,
};

export function ReportWizard({ report: initialReport, cycleOpen }: Props) {
  const { user } = useAuth();
  const { saveSection, uploadSignature, uploadAnnexure, deleteAnnexure, submitReport } = usePMS();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState(initialReport);

  const [sectionData, setSectionData] = useState<Record<string, Record<string, unknown>>>(() =>
    Object.fromEntries(report.sections.map(s => [s.sectionKey, s.data]))
  );

  const getSectionData = (key: SectionKey): Record<string, unknown> =>
    sectionData[key] ?? {};

  const handleSectionChange = (key: SectionKey, data: Record<string, unknown>) => {
    setSectionData(prev => ({ ...prev, [key]: data }));
  };

  const saveCurrent = useCallback(async (currentSectionData: Record<string, Record<string, unknown>>) => {
    const currentStep = WIZARD_STEPS[step];
    if (!currentStep || currentStep.keys.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        currentStep.keys.map(key =>
          saveSection(report.id, key, currentSectionData[key] ?? {})
        )
      );
      if (currentStep.keys.includes('summary')) {
        const s = currentSectionData['summary'] ?? {};
        setReport(r => ({
          ...r,
          periodFrom: (s.periodFrom as string) || r.periodFrom,
          periodTo:   (s.periodTo as string) || r.periodTo,
          selfScore:  typeof s.selfScore === 'number' ? s.selfScore : r.selfScore,
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      throw e;
    } finally {
      setSaving(false);
    }
  }, [step, report.id, saveSection]);

  const goNext = async () => {
    try {
      await saveCurrent(sectionData);
      setStep(s => Math.min(s + 1, WIZARD_STEPS.length - 1));
      setError(null);
    } catch {
      // error already set in saveCurrent
    }
  };

  const goPrev = () => {
    setStep(s => Math.max(s - 1, 0));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!canSubmitReport(user, report, cycleOpen)) {
      setError('Cannot submit — ensure period dates are set and cycle is open.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitReport(report.id);
      navigate(`/pms/reports/${report.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignatureUpload = async (file: File) => {
    await uploadSignature(report.id, file);
  };

  const handleAnnexureUpload = async (file: File) => {
    const annexure = await uploadAnnexure(report.id, file);
    setReport(r => ({ ...r, annexures: [...r.annexures, annexure] }));
  };

  const handleAnnexureDelete = async (annexureId: string, filePath: string) => {
    await deleteAnnexure(annexureId, filePath);
    setReport(r => ({ ...r, annexures: r.annexures.filter(a => a.id !== annexureId) }));
  };

  const currentStepDef = WIZARD_STEPS[step];
  const isLastStep  = step === WIZARD_STEPS.length - 1;
  const isFirstStep = step === 0;

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-text-muted">
          <span>Step {step + 1} of {WIZARD_STEPS.length}</span>
          <span>{currentStepDef.label}</span>
        </div>
        <div className="w-full h-1.5 bg-surface-hover rounded-full overflow-hidden">
          <div
            className="h-full bg-[#c96442] rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {WIZARD_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => { if (i < step) { setStep(i); setError(null); } }}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-6 bg-[#c96442]'
                : i < step  ? 'w-2 bg-[#c96442]/50 cursor-pointer'
                             : 'w-2 bg-surface-hover cursor-default'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-surface border border-border rounded-2xl p-6 min-h-[300px]">
        <h2 className="text-lg font-serif font-medium text-text mb-4">{currentStepDef.label}</h2>

        {isLastStep ? (
          <div className="space-y-6">
            <div className="bg-background border border-border rounded-xl p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-text-muted">Period: </span>
                  <span className="text-text">{report.periodFrom || '—'} – {report.periodTo || '—'}</span>
                </div>
                <div>
                  <span className="text-text-muted">Self Score: </span>
                  <span className="text-text">{report.selfScore ?? '—'}</span>
                </div>
              </div>
              <div>
                <span className="text-text-muted">Sections saved: </span>
                <span className="text-text">{report.sections.length}</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text mb-3">Signature</h3>
              <SignatureUpload
                currentUrl={report.signatureUrl}
                onUpload={handleSignatureUpload}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text mb-3">Annexures</h3>
              <AnnexureUpload
                annexures={report.annexures}
                onUpload={handleAnnexureUpload}
                onDelete={handleAnnexureDelete}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {currentStepDef.keys.map(key => {
              const FormComponent = FORM_MAP[key];
              return (
                <div key={key}>
                  {currentStepDef.keys.length > 1 && (
                    <h3 className="text-sm font-mono font-medium text-text-muted uppercase tracking-wider mb-3">
                      {key.replace(/_/g, ' ')}
                    </h3>
                  )}
                  <FormComponent
                    data={getSectionData(key)}
                    onChange={d => handleSectionChange(key, d)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">
          {error}
        </div>
      )}

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={goPrev} disabled={isFirstStep}>
          ← Previous
        </Button>
        {isLastStep ? (
          <Button onClick={handleSubmit} isLoading={submitting} disabled={!cycleOpen}>
            Submit Report
          </Button>
        ) : (
          <Button onClick={goNext} isLoading={saving}>
            Save &amp; Next →
          </Button>
        )}
      </div>
    </div>
  );
}
