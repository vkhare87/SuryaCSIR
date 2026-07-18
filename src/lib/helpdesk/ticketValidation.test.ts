import { describe, it, expect } from 'vitest';
import { missingTicketFields } from './ticketValidation';

describe('missingTicketFields', () => {
  it('returns all fields for an empty draft', () => {
    expect(missingTicketFields({ category: null, subject: '', description: '' }))
      .toEqual(['category', 'subject', 'description']);
  });

  it('treats whitespace-only text as missing', () => {
    expect(missingTicketFields({ category: 'Infrastructure', subject: '   ', description: '\n\t' }))
      .toEqual(['subject', 'description']);
  });

  it('returns empty array for a complete draft', () => {
    expect(missingTicketFields({ category: 'Finance', subject: 'AC broken', description: 'Room 201 AC leaking' }))
      .toEqual([]);
  });
});
