export interface TicketDraft {
  category: string | null;
  subject: string;
  description: string;
}

export type TicketField = 'category' | 'subject' | 'description';

export function missingTicketFields(d: TicketDraft): TicketField[] {
  const missing: TicketField[] = [];
  if (!d.category) missing.push('category');
  if (!d.subject.trim()) missing.push('subject');
  if (!d.description.trim()) missing.push('description');
  return missing;
}
