import { z } from 'zod';
import { SCORE_RANGE } from './constants';

export const reportMetaSchema = z.object({
  periodFrom: z.string().min(1, 'Period start required'),
  periodTo:   z.string().min(1, 'Period end required'),
  selfScore:  z
    .number()
    .min(SCORE_RANGE.min, `Score must be ≥ ${SCORE_RANGE.min}`)
    .max(SCORE_RANGE.max, `Score must be ≤ ${SCORE_RANGE.max}`),
});

// Helper to count words
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function maxWords(max: number) {
  return z
    .string()
    .refine(v => countWords(v) <= max, { message: `Maximum ${max} words` });
}

export const sectionSchemas = {
  summary: z.object({
    title:       z.string().min(1),
    periodFrom:  z.string().min(1),
    periodTo:    z.string().min(1),
    selfScore:   z
      .number()
      .min(SCORE_RANGE.min)
      .max(SCORE_RANGE.max),
  }),
  section_i1: z.object({ items: z.array(z.record(z.string(), z.string())).default([]) }),
  section_i2: z.object({ items: z.array(z.record(z.string(), z.string())).default([]) }),
  section_i3: z.object({ items: z.array(z.record(z.string(), z.string())).default([]) }),
  section_i4: z.object({ text: maxWords(150).default('') }),
  section_i5: z.object({ text: maxWords(100).default('') }),
  section_ii:  z.object({ items: z.array(z.record(z.string(), z.string())).default([]) }),
  section_iii: z.object({ text: maxWords(300).default('') }),
  section_iv:  z.object({ text: maxWords(300).default('') }),
  section_v_curriculum:  z.object({ text: maxWords(100).default('') }),
  section_v_extension:   z.object({ items: z.array(z.record(z.string(), z.string())).default([]) }),
  section_v_other:       z.object({ text: maxWords(150).default('') }),
  section_vi_national:   z.object({ items: z.array(z.record(z.string(), z.string())).default([]) }),
  section_vi_international: z.object({ items: z.array(z.record(z.string(), z.string())).default([]) }),
};
