import { describe, it, expect } from 'vitest';
import { inferRouteEntity } from './CopilotContext';

describe('inferRouteEntity', () => {
  it.each([
    ['/projects/AMPRI%2FRD%2F001', '', { type: 'project', id: 'AMPRI/RD/001' }],
    ['/staff/S-104', '', { type: 'staff', id: 'S-104' }],
    ['/staff/analytics', '', null],
    ['/staff/planning', '', null],
    ['/facilities/INS-22', '', { type: 'instrument', id: 'INS-22' }],
    ['/divisions', '?div=AMD', { type: 'division', id: 'AMD' }],
    ['/divisions', '', null],
    ['/pms', '', null],
  ])('parses %s %s', (pathname, search, expected) => {
    expect(inferRouteEntity(pathname, search)).toEqual(expected);
  });
});
