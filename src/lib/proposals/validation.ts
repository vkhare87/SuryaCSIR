import { z } from 'zod';
import {
  FUND_TYPES,
  SPONSOR_TYPES,
  PROJECT_CATEGORIES,
  DOMAIN_THEMES,
} from './constants';

export const coPISchema = z.object({
  staffId: z.string().min(1),
  staffName: z.string().min(1),
});

const trlSchema = z.number().int().min(1).max(9).nullable();

export const draftSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  acronym: z.string().nullish(),
  piName: z.string().nullish(),
  domainTheme: z.enum([...DOMAIN_THEMES]).nullish(),
  fundType: z.enum([...FUND_TYPES]).nullish(),
  sponsorType: z.enum([...SPONSOR_TYPES]).nullish(),
  sponsorName: z.string().nullish(),
  projectCategory: z.enum([...PROJECT_CATEGORIES]).nullish(),
  proposedStartDate: z.string().nullish(),
  proposedDurationMonths: z.number().int().positive().nullish(),
  requestedBudget: z.number().nonnegative().nullish(),
  divisionCode: z.string().nullish(),
  abstract: z.string().nullish(),
  problemStatement: z.string().nullish(),
  objectives: z.string().nullish(),
  expectedOutcomes: z.string().nullish(),
  currentTrl: trlSchema.optional(),
  targetTrl: trlSchema.optional(),
  coPIs: z.array(coPISchema).optional(),
});

export const submitSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  acronym: z.string().nullish(),
  piName: z.string().min(1, 'PI name is required'),
  domainTheme: z.enum([...DOMAIN_THEMES]),
  fundType: z.enum([...FUND_TYPES]),
  sponsorType: z.enum([...SPONSOR_TYPES]),
  sponsorName: z.string().min(1),
  projectCategory: z.enum([...PROJECT_CATEGORIES]),
  proposedStartDate: z.string().min(1),
  proposedDurationMonths: z.number().int().positive(),
  requestedBudget: z.number().nonnegative(),
  divisionCode: z.string().min(1),
  abstract: z.string().min(1),
  problemStatement: z.string().min(1),
  objectives: z.string().min(1),
  expectedOutcomes: z.string().min(1),
  currentTrl: trlSchema,
  targetTrl: trlSchema,
  coPIs: z.array(coPISchema).optional(),
});

export type DraftInput = z.infer<typeof draftSchema>;
export type SubmitInput = z.infer<typeof submitSchema>;
