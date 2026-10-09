import 'reflect-metadata';

import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };
import { AccountModule, AccountService, defineAccount } from '../src';

const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
  const url = new URL(String(input));
  if (url.pathname === '/.well-known/openid-configuration') return Response.json(production);
  if (url.pathname === '/oauth/userinfo') return Response.json({ sub: 'user-1', name: '홍길동' });
  return new Response('not found', { status: 404 });
});

afterEach(() => clearDiscoveryCache());

describe('AccountModule', () => {
  it('provides AccountService with forRoot', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AccountModule.forRoot({ issuer: 'production', clientId: 'c', fetch })],
    }).compile();
    await expect(moduleRef.get(AccountService).getUserInfo('at-1')).resolves.toMatchObject({
      sub: 'user-1',
    });
  });

  it('reads options from another provider with forRootAsync', async () => {
    @Injectable()
    class Config {
      get(key: string): string {
        return { ACCOUNT_CLIENT_ID: 'from-config' }[key] ?? '';
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
            fetch,
          }),
        }),
      ],
    }).compile();
    await expect(moduleRef.get(AccountService).getUserInfo('at-1')).resolves.toMatchObject({
      name: '홍길동',
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
      imports: [
        AccountModule.forRoot({ issuer: 'production', clientId: 'c', fetch, isGlobal: true }),
        AuthModule,
      ],
    }).compile();
    expect(moduleRef.get(AuthService).account).toBe(moduleRef.get(AccountService));
  });

  it('types and checks the fields of the scopes defineAccount declares', async () => {
    const student = defineAccount({ requiredScopes: ['name', 'student_id'] });
    type StudentAccount = InstanceType<typeof student.AccountService>;

    const moduleRef = await Test.createTestingModule({
      imports: [student.AccountModule.forRoot({ issuer: 'production', clientId: 'c', fetch })],
    }).compile();
    const account: StudentAccount = moduleRef.get(student.AccountService);

    expectTypeOf<
      Awaited<ReturnType<StudentAccount['getUserInfo']>>['studentId']
    >().toEqualTypeOf<string>();
    await expect(account.getUserInfo('at-1')).rejects.toMatchObject({
      code: 'missing_claims',
      description: 'student_id is_student_id_verified',
    });
  });

  it('keeps accounts defined with different scopes apart in one app', async () => {
    const named = defineAccount({ requiredScopes: ['name'] });
    const student = defineAccount({ requiredScopes: ['student_id'] });

    const moduleRef = await Test.createTestingModule({
      imports: [
        named.AccountModule.forRoot({ issuer: 'production', clientId: 'c', fetch }),
        student.AccountModule.forRoot({ issuer: 'production', clientId: 'c', fetch }),
      ],
    }).compile();

    await expect(moduleRef.get(named.AccountService).getUserInfo('at-1')).resolves.toMatchObject({
      name: '홍길동',
    });
    await expect(moduleRef.get(student.AccountService).getUserInfo('at-1')).rejects.toMatchObject({
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
