import { describe, expect, expectTypeOf, it } from 'vitest';

import { AccountError } from '../src';

describe('AccountError', () => {
  it('builds the variant that matches the code', () => {
    const error = new AccountError('session_rejected', { reason: 'terms_required', details: 1 });

    expect(error).toBeInstanceOf(AccountError);
    expect(error).toBeInstanceOf(AccountError.Rejected);
    expect(error).not.toBeInstanceOf(AccountError.Cancelled);
    expect(error).toMatchObject({ kind: 'rejected', reason: 'terms_required', details: 1 });
    expect(new AccountError('missing_claims')).toBeInstanceOf(AccountError.Unknown);
  });

  it('keeps reason and details only on a rejection', () => {
    const error = new AccountError('server_error', { reason: 'r', details: 1 });

    expect(error).toBeInstanceOf(AccountError.Network);
    expect(error).not.toHaveProperty('reason');
    expect(error).not.toHaveProperty('details');
  });

  it('recognizes an error from another copy of the module by its shape', () => {
    const copy = Object.assign(new Error('session_rejected'), {
      name: 'AccountError',
      code: 'session_rejected',
      kind: 'rejected',
    });

    expect(copy instanceof AccountError).toBe(true);
    expect(copy instanceof AccountError.Rejected).toBe(true);
    expect(copy instanceof AccountError.Expired).toBe(false);
  });

  it('narrows by instanceof and by an exhaustive switch on kind', () => {
    const error = new AccountError('session_rejected') as AccountError;

    if (error instanceof AccountError.Rejected) {
      expectTypeOf(error).toEqualTypeOf<AccountError.Rejected>();
      expectTypeOf(error.reason).toEqualTypeOf<string | undefined>();
    }

    const title = (e: AccountError): string => {
      switch (e.kind) {
        case 'cancelled':
        case 'verification':
        case 'expired':
        case 'network':
        case 'unknown':
          return e.code;
        case 'rejected':
          return e.reason ?? e.code;
        default:
          return e satisfies never;
      }
    };
    expect(title(error)).toBe('session_rejected');

    // @ts-expect-error reason exists only on AccountError.Rejected
    void error.reason;
    // @ts-expect-error variants are read with instanceof, not constructed
    void new AccountError.Rejected('session_rejected');
  });
});
