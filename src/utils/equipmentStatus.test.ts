import { describe, it, expect } from 'vitest';
import { equipmentStatusClass } from './equipmentStatus';

describe('equipmentStatusClass', () => {
  it.each([
    ['Working', 'Working'],
    ['Working, No AMC', 'Working'],
    ['working/No AMC', 'Working'],
    ['Working* & Under Warantee', 'Working'],
    ['Not Working No AMC', 'Not Working'],
    ['not working; no AMC; water chiller pump not working', 'Not Working'],
    ['Not in operation & No AMC', 'Not Working'],
    ['Returned to Stores', 'Not Working'],
    ['Under Maintenance', 'Under Maintenance'],
    ['Warrenty till March 2026', 'Unknown'],
    ['issues in vacuum', 'Unknown'],
    [null, 'Unknown'],
  ] as const)('%s → %s', (raw, expected) => {
    expect(equipmentStatusClass(raw)).toBe(expected);
  });
});
