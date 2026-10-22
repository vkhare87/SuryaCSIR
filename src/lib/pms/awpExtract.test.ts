import { describe, it, expect } from 'vitest';
import { parseAWPText } from './awpExtract';
import { activityTotal, emptyAWPContent } from './awp';
// Real tesseract output of a scanned CSIR-AMPRI AWP, personal data replaced.
import sample from './__fixtures__/awp-sample-ocr.txt?raw';
import browserSample from './__fixtures__/awp-sample-ocr-browser.txt?raw';

describe('parseAWPText on a scanned AMPRI AWP', () => {
  const r = parseAWPText(sample);

  it('reads Part A identity and the reporting year', () => {
    expect(r.employeeId).toBe('99999');
    expect(r.name).toBe('Test Scientist');
    expect(r.reportingYear).toBe('2026-27');
    expect(r.content.partA.reportingOfficer).toBe('Dr. Test Officer');
    expect(r.content.partA.mobile).toBe('9000000000');
    expect(r.content.partA.prevPmsOnTime).toBe(true);
  });

  it('finds all nine activity rows including the lab-added ones', () => {
    const labels = r.content.activitySplit.map(a => a.label);
    expect(r.content.activitySplit).toHaveLength(9);
    expect(labels).toContain('Industry Projects');
    expect(labels).toContain('Projects Submission');
    expect(r.content.activitySplit.find(a => a.label === 'Industry Projects')!.timePct).toBe(1);
    expect(r.content.activitySplit.find(a => a.label === 'R&D — Translational Research')!.timePct).toBe(50);
  });

  it('flags the activity table when OCR lost a percentage', () => {
    // OCR dropped the Leadership / HoD "5", so the total is 95, not 100.
    expect(activityTotal(r.content.activitySplit)).toBe(95);
    expect(r.confidence.activities).toBe('low');
  });

  it('puts project text under the right kind', () => {
    expect(r.content.projects.find(p => p.kind === 'CSIR')!.objectives).toContain('SMA');
    expect(r.content.projects.find(p => p.kind === 'EXTERNAL')!.objectives).toContain('ICMR');
  });

  it('reads objectives, development and free text sections', () => {
    expect(r.content.objectives.patents).toContain('0-1 patents');
    expect(r.content.objectives.publications).toContain('1-2 publications');
    expect(r.content.development.training).toContain('IIT Roorkee');
    expect(r.content.institutionalWork).toContain('Safety & Waste Management');
    expect(r.content.other).toBe('NA');
  });

  it('strips bullets, label leftovers, percentages and form instructions', () => {
    expect(r.content.objectives.patents).toBe('0-1 patents to be submitted');
    expect(r.content.objectives.hrd.startsWith('PhD supervision')).toBe(true);
    const translational = r.content.activitySplit.find(a => a.label === 'R&D — Translational Research')!.role;
    expect(translational).not.toMatch(/^R&D/);
    expect(translational).not.toMatch(/\b50\b/);
    expect(r.content.activitySplit[0].role).not.toContain('Indicate your role');
  });

  it('reads the HoD verdict from the endorsement block', () => {
    expect(r.roVerdict).toBe('REASONABLE');
  });
});

// Same PDF read by pdf.js + tesseract.js in the browser: noisier.
describe('parseAWPText on the browser OCR of the same AWP', () => {
  const r = parseAWPText(browserSample);

  it('keeps a lab-added row whose label and % landed on different lines', () => {
    const row = r.content.activitySplit.find(a => a.label.startsWith('Industry Project'));
    expect(row?.timePct).toBe(1);
  });

  it('reads "reasonable" when the HoD tick garbled the label but the other box is blank', () => {
    expect(r.roVerdict).toBe('REASONABLE');
  });
});

describe('parseAWPText on unusable input', () => {
  it('returns an empty form for empty text', () => {
    const r = parseAWPText('');
    expect(r.content).toEqual(emptyAWPContent());
    expect(Object.values(r.confidence).every(c => c === 'empty')).toBe(true);
    expect(r.employeeId).toBeNull();
  });

  it('does not throw on random text', () => {
    expect(() => parseAWPText('lorem ipsum 42\ndolor sit')).not.toThrow();
  });
});
