import { describe, expect, it } from 'vitest';
import { recoveryFor } from './errorRecovery';

describe('recoveryFor', () => {
  it('maps CONFLICT to a conflict recovery', () => {
    expect(recoveryFor('CONFLICT')).toBe('conflict');
  });

  it('maps NOT_FOUND to a gone recovery', () => {
    expect(recoveryFor('NOT_FOUND')).toBe('gone');
  });

  it('returns null for other codes and no code', () => {
    expect(recoveryFor('VALIDATION')).toBeNull();
    expect(recoveryFor('BLOCKED_BY_DEPENDENCIES')).toBeNull();
    expect(recoveryFor(undefined)).toBeNull();
  });
});
