import 'reflect-metadata';

import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import production from '../../core/tests/fixtures/discovery.production.json' with { type: 'json' };
import { AccountModule, AccountService } from '../src';

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
    expect(moduleRef.get(AuthService).account).toBeInstanceOf(AccountService);
  });

  it('fails while bootstrapping when the client id is missing', async () => {
    await expect(
      Test.createTestingModule({
        imports: [AccountModule.forRoot({ issuer: 'production', clientId: '' })],
      }).compile(),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
