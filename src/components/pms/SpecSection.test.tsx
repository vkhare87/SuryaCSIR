import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpecSection } from './SpecSection';
import { ANNEXURE_SPECS } from '../../lib/pms/annexureSpecs';
import type { SectionSpec } from '../../lib/pms/annexureSpecs';

function renderSpec(spec: SectionSpec, data: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  render(<SpecSection spec={spec} data={data} onChange={onChange} />);
  return onChange;
}

describe('SpecSection', () => {
  it('writes a fields value flat, so the wizard can lift periodFrom onto the report', () => {
    const spec = ANNEXURE_SPECS.sr_identification;
    const onChange = renderSpec(spec);

    fireEvent.change(screen.getByLabelText('Evaluation period from'), {
      target: { value: '2025-04-01' },
    });

    expect(onChange).toHaveBeenCalledWith({ periodFrom: '2025-04-01' });
  });

  it('renders date fields as date inputs', () => {
    renderSpec(ANNEXURE_SPECS.dir_identification);
    expect(screen.getByLabelText('Reporting period from')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Name of the Director')).toHaveAttribute('type', 'text');
  });

  it('writes a prompts value flat under its own key and keeps siblings', () => {
    const spec = ANNEXURE_SPECS.sr_questionnaire;
    const onChange = renderSpec(spec, { q1: 'already answered' });

    fireEvent.change(screen.getByLabelText(/^2\. Your contribution to National Missions/), {
      target: { value: 'Mission work' },
    });

    expect(onChange).toHaveBeenCalledWith({ q1: 'already answered', q2: 'Mission work' });
  });

  it('shows the word counter against the cap the proforma states', () => {
    renderSpec(ANNEXURE_SPECS.dir_qa, { roadmap: 'one two three' });
    expect(screen.getByText('3 / 200 words')).toBeInTheDocument();
  });

  it('writes a text section under `text`', () => {
    const onChange = renderSpec(ANNEXURE_SPECS.sr_b_i4);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A notable contribution' } });
    expect(onChange).toHaveBeenCalledWith({ text: 'A notable contribution' });
  });

  it('writes a table section under `items` and renders its columns', () => {
    const spec = ANNEXURE_SPECS.sr_education;
    const onChange = renderSpec(spec);

    expect(screen.getByText('Qualification')).toBeInTheDocument();
    expect(screen.getByText('University / Institute')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add row/i }));

    expect(onChange).toHaveBeenCalledWith({
      items: [{ qualification: '', specialization: '', year: '', university: '', additionalInfo: '' }],
    });
  });

  it('renders the section hint when the proforma carries one', () => {
    renderSpec(ANNEXURE_SPECS.sr_leave);
    expect(screen.getByText(/Sr\. CoA \/ CoA \/ AO/)).toBeInTheDocument();
  });
});
