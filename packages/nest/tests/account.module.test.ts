import 'reflect-metadata';

import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };
import { createSigner } from '../../core/tests/helpers';
import { AccountModule, AccountService, defineAccount } from '../src';

const signer = await createSigner();
const now = Math.floor(Date.now() / 1000);

const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
  const url = new URL(String(input));
  if (url.pathname === '/.well-known/openid-configuration') return Response.json(production);
  if (url.pathname === '/oauth/token') {
    const idToken = await signer.sign({
      iss: 'https://api.account.gistory.me',
      aud: 'c',
      iat: now,
      exp: now + 3600,
      nonce: 'n-1',
      sub: 'user-1',
      name: '홍길동',
    });
    return Response.json({ access_token: 'at-1', token_type: 'Bearer', id_token: idToken });
  }
  return new Response('not found', { status: 404 });
});

const options = { issuer: 'production', clientId: 'c', clientSecret: 's', fetch } as const;
const login = { code: 'x', codeVerifier: 'v', redirectUri: 'https://app.example/cb', nonce: 'n-1' };

afterEach(() => clearDiscoveryCache());

describe('AccountModule', () => {
  it('provides AccountService with forRoot', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AccountModule.forRoot(options)],
    }).compile();
    await expect(moduleRef.get(AccountService).loginWithCode(login)).resolves.toMatchObject({
      user: { sub: 'user-1' },
    });
  });

  it('reads options from another provider with forRootAsync', async () => {
    @Injectable()
    class Config {
      get(key: string): string {
        return { ACCOUNT_CLIENT_ID: 'c' }[key] ?? '';
      }
    }
    @Module({ providers: [Config], exports: [Config] })
    class ConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        AccountModule.forRootAsync({
          imports: [ConfigModule],
          inject: [Config],
          useFactory: (config: Config) => ({
            issuer: 'production',
            clientId: config.get('ACCOUNT_CLIENT_ID'),
            clientSecret: 's',
            fetch,
          }),
        }),
      ],
    }).compile();
    await expect(moduleRef.get(AccountService).loginWithCode(login)).resolves.toMatchObject({
      user: { name: '홍길동' },
    });
  });

  it('is injectable from feature modules when global', async () => {
    @Injectable()
    class AuthService {
      constructor(@Inject(AccountService) readonly account: AccountService) {}
    }
    @Module({ providers: [AuthService] })
    class AuthModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [AccountModule.forRoot({ ...options, isGlobal: true }), AuthModule],
    }).compile();
    expect(moduleRef.get(AuthService).account).toBe(moduleRef.get(AccountService));
  });

  it('types and checks the fields of the scopes defineAccount declares', async () => {
    const student = defineAccount({ requiredScopes: ['name', 'student_id'] });
    type StudentAccount = InstanceType<typeof student.AccountService>;

    const moduleRef = await Test.createTestingModule({
      imports: [student.AccountModule.forRoot(options)],
    }).compile();
    const account: StudentAccount = moduleRef.get(student.AccountService);

    expectTypeOf<
      Awaited<ReturnType<StudentAccount['loginWithCode']>>['user']['studentId']
    >().toEqualTypeOf<string>();
    await expect(account.loginWithCode(login)).rejects.toMatchObject({
      code: 'missing_claims',
      description: 'student_id is_student_id_verified',
    });
  });

  it('keeps accounts defined with different scopes apart in one app', async () => {
    const named = defineAccount({ requiredScopes: ['name'] });
    const student = defineAccount({ requiredScopes: ['student_id'] });

    const moduleRef = await Test.createTestingModule({
      imports: [named.AccountModule.forRoot(options), student.AccountModule.forRoot(options)],
    }).compile();

    await expect(moduleRef.get(named.AccountService).loginWithCode(login)).resolves.toMatchObject({
      user: { name: '홍길동' },
    });
    await expect(moduleRef.get(student.AccountService).loginWithCode(login)).rejects.toMatchObject({
      code: 'missing_claims',
    });
  });

  it('fails while bootstrapping when the client id is missing', async () => {
    await expect(
      Test.createTestingModule({
        imports: [AccountModule.forRoot({ issuer: 'production', clientId: '' })],
      }).compile(),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
