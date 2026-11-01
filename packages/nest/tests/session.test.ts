import 'reflect-metadata';

import { PGlite } from '@electric-sql/pglite';
import { clearDiscoveryCache } from '@gsainfoteam/account-core';
import { createFakeIdp } from '@gsainfoteam/account-testing';
import { Controller, Get, Module, UseGuards, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import RedisMock from 'ioredis-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/mini';

import {
  CurrentSession,
  defineAccount,
  memorySessionStore,
  prismaSessionStore,
  redisSessionStore,
  SessionRejected,
  type PrismaSessionDelegate,
  type RedisSessionClient,
  type SessionModuleOptions,
  type SessionOf,
  type SessionRecord,
  type SessionStore,
} from '../src';
import { drizzleSessionStore } from '../src/drizzle';

const idp = await createFakeIdp();
const code = async () =>
  (await idp.authorize({ clientId: 'c', user: { sub: 'idp-user-1', name: '홍길동' } })).body;

const account = defineAccount({
  requiredScopes: ['name'],
  session: { claims: z.object({ devicePk: z.number() }) },
});
type Session = SessionOf<typeof account>;

@Controller()
class MeController {
  @Get('me')
  @UseGuards(account.SessionGuard)
  me(@CurrentSession() session: Session): Session {
    return session;
  }
}

let app: INestApplication;
let base: string;

async function start(
  session: Partial<SessionModuleOptions<'name', { devicePk: number }>> = {},
): Promise<void> {
  @Module({
    imports: [
      account.AccountModule.forRoot({
        issuer: 'production',
        clientId: 'c',
        clientSecret: 's',
        fetch: idp.fetch,
        isGlobal: true,
        session: {
          secret: 'a-test-secret-that-is-long-enough!',
          store: memorySessionStore(),
          resolve: (user, { body }) => ({
            subject: `local-${user.sub}`,
            claims: { devicePk: Number(body.device_id ?? 0) },
          }),
          ...session,
        },
      }),
    ],
    controllers: [MeController],
  })
  class AppModule {}

  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
}

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method: 'POST',
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const me = (accessToken: string) =>
  fetch(`${base}/me`, { headers: { authorization: `Bearer ${accessToken}` } });

const cookieOf = (response: Response): string => response.headers.get('set-cookie')!.split(';')[0]!;

beforeEach(() => clearDiscoveryCache());
afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});

describe('cookie transport (web)', () => {
  it('logs in with the code, sets an httpOnly refresh cookie and guards routes', async () => {
    await start();
    const response = await post('/auth/login', {
      ...(await code()),
      transport: 'cookie',
      device_id: '7',
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { access_token: string; refresh_token?: string };
    expect(body.refresh_token).toBeUndefined();
    expect(response.headers.get('set-cookie')).toMatch(
      /^refresh_token=[\w-]+; Max-Age=2592000; Path=\/auth; HttpOnly; Secure; SameSite=Strict$/,
    );

    await expect((await me(body.access_token)).json()).resolves.toEqual({
      sub: 'local-idp-user-1',
      sid: expect.any(String),
      auth_time: expect.any(Number),
      amr: ['pwd'],
      devicePk: 7,
    });
    expect((await me('forged')).status).toBe(401);
  });

  it('rotates the refresh cookie and ends the session when an old one comes back later', async () => {
    await start();
    const login = await post('/auth/login', await code());
    const first = cookieOf(login);

    const refreshed = await post('/auth/refresh', undefined, { cookie: first });
    expect(refreshed.status).toBe(200);
    const second = cookieOf(refreshed);
    expect(second).not.toBe(first);

    const { access_token } = (await refreshed.json()) as { access_token: string };
    await expect((await me(access_token)).json()).resolves.toMatchObject({ amr: ['pwd'] });

    expect((await post('/auth/refresh', undefined, { cookie: first })).status).toBe(200);

    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 60_000 });
    expect((await post('/auth/refresh', undefined, { cookie: first })).status).toBe(401);
    expect((await post('/auth/refresh', undefined, { cookie: second })).status).toBe(401);
  });

  it('logs out, clears the cookie and stops the access token at once', async () => {
    await start();
    const login = await post('/auth/login', await code());
    const { access_token } = (await login.json()) as { access_token: string };

    const logout = await post('/auth/logout', undefined, {
      authorization: `Bearer ${access_token}`,
    });
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toMatch(/^refresh_token=; Max-Age=0; Path=\/auth/);
    expect((await me(access_token)).status).toBe(401);
    expect((await post('/auth/refresh', undefined, { cookie: cookieOf(login) })).status).toBe(401);
  });

  it('answers a used or forged code with 401', async () => {
    await start();
    const response = await post('/auth/login', { ...(await code()), code: 'bad-code' });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_grant' });
  });
});

const hooks: { beforeSave?: () => Promise<unknown>; midDelete?: () => Promise<unknown> } = {};
const fire = async (name: keyof typeof hooks) => {
  const run = hooks[name];
  delete hooks[name];
  await run?.();
};

function fakePrisma(): PrismaSessionDelegate {
  const rows = new Map<string, SessionRecord>();
  return {
    async create({ data }) {
      rows.set(data.tokenHash, { ...data });
    },
    async findUnique({ where }) {
      const row = rows.get(where.tokenHash);
      return row ? { ...row } : null;
    },
    async updateMany({ where, data }) {
      const row = rows.get(where.tokenHash);
      if (!row || row.usedAt) return { count: 0 };
      row.usedAt = data.usedAt;
      return { count: 1 };
    },
    async deleteMany({ where }) {
      const hit = [...rows.values()].filter((row) =>
        'subject' in where
          ? row.subject === where.subject
          : row.sessionId === where.sessionId &&
            (!where.usedAt || (!!row.usedAt && row.usedAt < where.usedAt.lt)),
      );
      await fire('midDelete');
      for (const row of hit) rows.delete(row.tokenHash);
    },
  };
}

const pg = drizzle(new PGlite());
await pg.execute(sql`
  create table account_session (
    token_hash text primary key,
    session_id text not null,
    subject text not null,
    claims jsonb not null,
    expires_at timestamptz not null,
    used_at timestamptz
  )
`);

const raceStores: [string, () => SessionStore][] = [
  [
    'memory',
    () => {
      const store = memorySessionStore();
      return {
        ...store,
        async deleteSession(sessionId) {
          await fire('midDelete');
          await store.deleteSession(sessionId);
        },
      };
    },
  ],
  [
    'redis',
    () => {
      const redis: RedisSessionClient = new RedisMock();
      const smembers = redis.smembers.bind(redis);
      redis.smembers = async (key) => {
        const members = await smembers(key);
        await fire('midDelete');
        return members;
      };
      return redisSessionStore(redis);
    },
  ],
  ['prisma', () => prismaSessionStore(fakePrisma())],
  [
    'drizzle',
    () => {
      const store = drizzleSessionStore(pg, { checkActive: true });
      return {
        ...store,
        async deleteSession(sessionId) {
          await fire('midDelete');
          await store.deleteSession(sessionId);
        },
      };
    },
  ],
];

describe.each(raceStores)('a logout racing a refresh (%s store)', (_, create) => {
  let store: SessionStore;
  const saved: string[] = [];

  beforeEach(async () => {
    store = create();
    saved.length = 0;
    await start({
      store: {
        ...store,
        async save(record) {
          await fire('beforeSave');
          saved.push(record.tokenHash);
          await store.save(record);
        },
      },
    });
  });

  const login = async () => {
    const response = await post('/auth/login', await code());
    const { access_token } = (await response.json()) as { access_token: string };
    const { sid } = (await (await me(access_token)).json()) as { sid: string };
    return { cookie: cookieOf(response), access_token, sid };
  };

  const expectSessionGone = async (sid: string) => {
    for (const tokenHash of saved) await expect(store.find(tokenHash)).resolves.toBeNull();
    if (store.isActive) await expect(store.isActive(sid)).resolves.toBe(false);
  };

  it('fails a refresh when the logout lands between its read and its save', async () => {
    const { cookie, access_token, sid } = await login();

    hooks.beforeSave = () =>
      post('/auth/logout', undefined, { authorization: `Bearer ${access_token}` });
    expect((await post('/auth/refresh', undefined, { cookie })).status).toBe(401);

    expect(hooks.beforeSave).toBeUndefined();
    await expectSessionGone(sid);
  });

  it('removes the token a refresh saves while the logout is deleting', async () => {
    const { cookie, access_token, sid } = await login();

    let refreshed: Response | undefined;
    hooks.midDelete = async () => {
      refreshed = await post('/auth/refresh', undefined, { cookie });
    };
    await post('/auth/logout', undefined, { authorization: `Bearer ${access_token}` });

    expect(refreshed).toBeDefined();
    if (refreshed!.status === 200) {
      expect(
        (await post('/auth/refresh', undefined, { cookie: cookieOf(refreshed!) })).status,
      ).toBe(401);
    }
    await expectSessionGone(sid);
  });
});

describe('body transport (app)', () => {
  it('returns and takes the refresh token in the body', async () => {
    await start();
    const login = await post('/auth/login', { ...(await code()), transport: 'body' });
    const { refresh_token } = (await login.json()) as { refresh_token: string };

    expect(login.headers.get('set-cookie')).toBeNull();
    const refreshed = await post('/auth/refresh', { refresh_token, transport: 'body' });
    await expect(refreshed.json()).resolves.toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
    });
  });
});

describe('a login the service turns down first (house-moving-out consent)', () => {
  it('answers 403 with a ticket, and the retry with the ticket reaches resolve again', async () => {
    const resolve = vi.fn<SessionModuleOptions<'name', { devicePk: number }>['resolve']>(
      (user, { body }) => {
        if (body.agreed !== true) throw new SessionRejected({ requiredConsents: ['privacy'] });
        return { subject: user.sub, claims: { devicePk: 1 } };
      },
    );
    await start({ resolve });

    const rejected = await post('/auth/login', await code());
    expect(rejected.status).toBe(403);
    const { ticket, ...rest } = (await rejected.json()) as { ticket: string };
    expect(rest).toEqual({
      error: 'session_rejected',
      details: { requiredConsents: ['privacy'] },
    });

    const retried = await post('/auth/login', { ticket, agreed: true });
    expect(retried.status).toBe(200);
    expect(resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({ sub: 'idp-user-1', name: '홍길동' }),
      { body: { agreed: true } },
    );

    expect((await post('/auth/login', { ticket: `${ticket}x`, agreed: true })).status).toBe(401);
  });
});

describe('onLogin: replace (single session)', () => {
  it('ends the earlier session of the same user', async () => {
    await start({ onLogin: 'replace' });
    const first = await post('/auth/login', await code());
    const { access_token } = (await first.json()) as { access_token: string };

    await post('/auth/login', await code());
    expect((await me(access_token)).status).toBe(401);
  });
});

describe('on Fastify', () => {
  it('sets and reads the refresh cookie the same way', async () => {
    @Module({
      imports: [
        account.AccountModule.forRoot({
          issuer: 'production',
          clientId: 'c',
          clientSecret: 's',
          fetch: idp.fetch,
          session: {
            secret: 'a-test-secret-that-is-long-enough!',
            store: memorySessionStore(),
            resolve: (user) => ({ subject: user.sub, claims: { devicePk: 0 } }),
          },
        }),
      ],
    })
    class FastifyModule {}

    app = await NestFactory.create(FastifyModule, new FastifyAdapter(), { logger: false });
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');

    const login = await post('/auth/login', await code());
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toMatch(
      /^refresh_token=[\w-]+;.*HttpOnly; Secure; SameSite=Strict$/,
    );

    const refreshed = await post('/auth/refresh', undefined, { cookie: cookieOf(login) });
    expect(refreshed.status).toBe(200);
    expect((await post('/auth/refresh', {}, { cookie: 'refresh_token=nope' })).status).toBe(401);
  });
});
