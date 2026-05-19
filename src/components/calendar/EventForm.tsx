import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import type { CalendarEvent, DivisionInfo } from '../../types';

// --- Types ---

export interface EventFormValues {
  title: string;
  event_date: string;
  event_kind: 'Custom' | 'Pamphlet' | 'Announcement';
  location: string;
  teams_url: string;
  pamphlet_url: string;
  description: string;
  visibility: 'OrgWide' | 'Division' | 'Personal';
  division_code: string;
}

interface EventFormProps {
  initial?: Partial<CalendarEvent>;
  divisions: DivisionInfo[];
  defaultDivisionCode?: string;
  submitLabel: string;
  onSubmit: (values: EventFormValues) => Promise<void> | void;
  onCancel: () => void;
}

// --- Zod schema ---

const URL_REGEX = /^https?:\/\//;

const optionalUrl = z
  .string()
  .max(2000)
  .refine((val) => val === '' || URL_REGEX.test(val), {
    message: 'Must be an http(s) URL',
  });

const schema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    event_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required'),
    event_kind: z.enum(['Custom', 'Pamphlet', 'Announcement']),
    location: z.string().max(200),
    teams_url: optionalUrl,
    pamphlet_url: optionalUrl,
    description: z.string().max(1000),
    visibility: z.enum(['OrgWide', 'Division', 'Personal']),
    division_code: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.visibility === 'Division' && data.division_code === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['division_code'],
        message: 'Division is required when visibility is Division',
      });
    }
  });

// --- Helpers ---

function buildInitialValues(
  initial: Partial<CalendarEvent> | undefined,
  defaultDivisionCode: string | undefined,
): EventFormValues {
  return {
    title: initial?.title ?? '',
    event_date: initial?.event_date ?? '',
    event_kind: initial?.event_kind ?? 'Custom',
    location: initial?.location ?? '',
    teams_url: initial?.teams_url ?? '',
    pamphlet_url: initial?.pamphlet_url ?? '',
    description: initial?.description ?? '',
    visibility: initial?.visibility ?? 'OrgWide',
    division_code:
      initial?.division_code ?? defaultDivisionCode ?? '',
  };
}

// --- Component ---

export function EventForm({
  initial,
  divisions,
  defaultDivisionCode,
  submitLabel,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const [values, setValues] = useState<EventFormValues>(() =>
    buildInitialValues(initial, defaultDivisionCode),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof EventFormValues>(key: K, val: EventFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});

    const result = schema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(result.data);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* Title */}
      <div>
        <label htmlFor="event-title" className="block text-sm font-medium text-text mb-1">
          Title
        </label>
        <input
          id="event-title"
          type="text"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#c96442]"
        />
        {errors.title && (
          <p className="text-rose-500 text-xs mt-1">{errors.title}</p>
        )}
      </div>

      {/* Date */}
      <div>
        <label htmlFor="event-date" className="block text-sm font-medium text-text mb-1">
          Date
        </label>
        <input
          id="event-date"
          type="date"
          value={values.event_date}
          onChange={(e) => set('event_date', e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#c96442]"
        />
        {errors.event_date && (
          <p className="text-rose-500 text-xs mt-1">{errors.event_date}</p>
        )}
      </div>

      {/* Event Kind */}
      <div>
        <label htmlFor="event-kind" className="block text-sm font-medium text-text mb-1">
          Type
        </label>
        <select
          id="event-kind"
          value={values.event_kind}
          onChange={(e) =>
            set('event_kind', e.target.value as EventFormValues['event_kind'])
          }
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#c96442]"
        >
          <option value="Custom">Custom</option>
          <option value="Pamphlet">Pamphlet</option>
          <option value="Announcement">Announcement</option>
        </select>
        {errors.event_kind && (
          <p className="text-rose-500 text-xs mt-1">{errors.event_kind}</p>
        )}
      </div>

      {/* Location */}
      <div>
        <label htmlFor="event-location" className="block text-sm font-medium text-text mb-1">
          Location
        </label>
        <input
          id="event-location"
          type="text"
          value={values.location}
          onChange={(e) => set('location', e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#c96442]"
        />
        {errors.location && (
          <p className="text-rose-500 text-xs mt-1">{errors.location}</p>
        )}
      </div>

      {/* Teams URL */}
      <div>
        <label htmlFor="event-teams-url" className="block text-sm font-medium text-text mb-1">
          Teams URL
        </label>
        <input
          id="event-teams-url"
          type="url"
          value={values.teams_url}
          onChange={(e) => set('teams_url', e.target.value)}
          placeholder="https://teams.microsoft.com/..."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#c96442]"
        />
        {errors.teams_url && (
          <p className="text-rose-500 text-xs mt-1">{errors.teams_url}</p>
        )}
      </div>

      {/* Pamphlet URL */}
      <div>
        <label htmlFor="event-pamphlet-url" className="block text-sm font-medium text-text mb-1">
          Pamphlet URL
        </label>
        <input
          id="event-pamphlet-url"
          type="url"
          value={values.pamphlet_url}
          onChange={(e) => set('pamphlet_url', e.target.value)}
          placeholder="https://..."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#c96442]"
        />
        {errors.pamphlet_url && (
          <p className="text-rose-500 text-xs mt-1">{errors.pamphlet_url}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="event-description" className="block text-sm font-medium text-text mb-1">
          Description
        </label>
        <textarea
          id="event-description"
          rows={3}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#c96442] resize-none"
        />
        {errors.description && (
          <p className="text-rose-500 text-xs mt-1">{errors.description}</p>
        )}
      </div>

      {/* Visibility */}
      <div>
        <span className="block text-sm font-medium text-text mb-2">Visibility</span>
        <div className="flex gap-4">
          {(['OrgWide', 'Division', 'Personal'] as const).map((vis) => (
            <label key={vis} className="flex items-center gap-1.5 text-sm text-text cursor-pointer">
              <input
                type="radio"
                name="visibility"
                value={vis}
                checked={values.visibility === vis}
                onChange={() => set('visibility', vis)}
                {...(vis === 'Division' ? { 'aria-label': 'Division' } : {})}
                className="accent-[#c96442]"
              />
              {vis === 'OrgWide' ? 'Org-Wide' : vis}
            </label>
          ))}
        </div>
        {errors.visibility && (
          <p className="text-rose-500 text-xs mt-1">{errors.visibility}</p>
        )}
      </div>

      {/* Division select — only when visibility = Division */}
      {values.visibility === 'Division' && (
        <div>
          <label htmlFor="event-division" className="block text-sm font-medium text-text mb-1">
            Division
          </label>
          <select
            id="event-division"
            value={values.division_code}
            onChange={(e) => set('division_code', e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-[#c96442]"
          >
            <option value="">Select division…</option>
            {divisions.map((d) => (
              <option key={d.divCode} value={d.divCode}>
                {d.divName}
              </option>
            ))}
          </select>
          {errors.division_code && (
            <p className="text-rose-500 text-xs mt-1">{errors.division_code}</p>
          )}
        </div>
      )}

      {/* Buttons */}
      <div className="pt-2 border-t border-border flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-muted hover:bg-surface-hover rounded-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="bg-[#c96442] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#b5593b] disabled:opacity-50"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
