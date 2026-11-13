import 'reflect-metadata';

import { HttpException } from '@nestjs/common';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { AccountError, toHttpException } from '../src';
import { LoginBody, LoginCodeBody } from '../src/dto';

function statusOf(error: unknown): number {
  try {
    toHttpException(error);
  } catch (thrown) {
    if (thrown instanceof HttpException) return thrown.getStatus();
    throw thrown;
  }
  throw new Error('toHttpException returned');
}

describe('toHttpException', () => {
  it.each([
    ['invalid_request', 400],
    ['invalid_grant', 401],
    ['invalid_id_token', 401],
    ['network_error', 502],
    ['discovery_failed', 502],
    ['invalid_client', 500],
    ['missing_claims', 500],
  ] as const)('maps %s to %i', (code, status) => {
    expect(statusOf(new AccountError(code))).toBe(status);
  });

  it('keeps the code in the body and never answers 403', () => {
    expect(() => toHttpException(new AccountError('session_rejected'))).toThrow(
      expect.objectContaining({
        status: 401,
        response: expect.objectContaining({ error: 'session_rejected' }),
      }),
    );
  });

  it('rethrows errors that are not AccountError', () => {
    const error = new Error('db down');
    expect(() => toHttpException(error)).toThrow(error);
  });
});

const code = { code: 'c', code_verifier: 'v', redirect_uri: 'https://s.test/cb', nonce: 'n' };

async function failedFields(body: object): Promise<string[]> {
  return (await validate(body)).map((error) => error.property);
}

describe('login bodies', () => {
  it('requires the code fields', async () => {
    expect(await failedFields(Object.assign(new LoginCodeBody(), code))).toEqual([]);
    expect(await failedFields(Object.assign(new LoginCodeBody(), { code: 'c' }))).toEqual([
      'code_verifier',
      'redirect_uri',
      'nonce',
    ]);
  });

  it('rejects an unknown transport', async () => {
    expect(
      await failedFields(Object.assign(new LoginCodeBody(), code, { transport: 'header' })),
    ).toEqual(['transport']);
  });

  it('accepts a ticket instead of the code fields', async () => {
    expect(await failedFields(Object.assign(new LoginBody(), { ticket: 't' }))).toEqual([]);
    expect(await failedFields(Object.assign(new LoginBody(), code))).toEqual([]);
    expect(await failedFields(new LoginBody())).toEqual([
      'code',
      'code_verifier',
      'redirect_uri',
      'nonce',
    ]);
  });

  it('rejects null optional fields', async () => {
    expect(await failedFields(Object.assign(new LoginBody(), { ticket: null }))).toEqual([
      'ticket',
    ]);
    expect(
      await failedFields(Object.assign(new LoginCodeBody(), code, { iss: null, transport: null })),
    ).toEqual(['iss', 'transport']);
  });

  it('checks fields a service adds by extending the body', async () => {
    const { IsBoolean } = await import('class-validator');
    class SignupBody extends LoginBody {
      @IsBoolean()
      agreed!: boolean;
    }
    expect(await failedFields(Object.assign(new SignupBody(), { ticket: 't' }))).toEqual([
      'agreed',
    ]);
  });
});
