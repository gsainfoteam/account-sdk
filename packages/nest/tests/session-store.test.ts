import RedisMock from 'ioredis-mock';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  memorySessionStore,
  redisSessionStore,
  type RedisSessionClient,
  type SessionRecord,
  type SessionStore,
} from '../src';

const redisClient: RedisSessionClient = new RedisMock();

const stores: [string, () => SessionStore][] = [
  ['memory', memorySessionStore],
  ['redis', () => redisSessionStore(redisClient, { prefix: `t${Math.random()}:` })],
];

const HOUR = 3_600_000;

const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  tokenHash: 'h1',
  sessionId: 's1',
  subject: 'u1',
  claims: { devicePk: 7 },
  expiresAt: new Date(Date.now() + HOUR),
  usedAt: null,
  ...overrides,
});

afterEach(() => vi.useRealTimers());

describe.each(stores)('%s session store', (_, create) => {
  it('finds what it saved and marks a token used only once', async () => {
    const store = create();
    await store.save(record());

    await expect(store.find('h1')).resolves.toEqual({ ...record(), expiresAt: expect.any(Date) });
    await expect(store.find('nope')).resolves.toBeNull();

    const at = new Date();
    const results = await Promise.all([store.markUsed('h1', at), store.markUsed('h1', at)]);
    expect(results.sort()).toEqual([false, true]);
    await expect(store.find('h1')).resolves.toMatchObject({ usedAt: at });
    await expect(store.markUsed('nope', at)).resolves.toBe(false);
  });

  it('deletes used tokens of a session, a whole session and a subject', async () => {
    const store = create();
    await store.save(record());
    await store.save(record({ tokenHash: 'h2' }));
    await store.save(record({ tokenHash: 'h3', sessionId: 's2' }));
    await store.save(record({ tokenHash: 'h4', sessionId: 's3', subject: 'u2' }));

    await store.markUsed('h1', new Date(Date.now() - 60_000));
    await store.deleteUsed('s1', new Date());
    await expect(store.find('h1')).resolves.toBeNull();
    await expect(store.find('h2')).resolves.not.toBeNull();

    await store.deleteSession('s1');
    await expect(store.find('h2')).resolves.toBeNull();
    await expect(store.isActive?.('s1')).resolves.toBe(false);
    await expect(store.isActive?.('s2')).resolves.toBe(true);

    await store.deleteSubject('u1');
    await expect(store.find('h3')).resolves.toBeNull();
    await expect(store.isActive?.('s2')).resolves.toBe(false);
    await expect(store.isActive?.('s3')).resolves.toBe(true);
  });
});

describe('redis session store', () => {
  it('lets Redis expire the keys with the token', async () => {
    const redis = new RedisMock();
    await redisSessionStore(redis, { prefix: 'ttl:' }).save(
      record({ expiresAt: new Date(Date.now() + 5_000) }),
    );

    const ttls = await Promise.all((await redis.keys('ttl:*')).map((key) => redis.pttl(key)));
    expect(ttls.length).toBe(3);
    for (const ttl of ttls) expect(ttl).toBeGreaterThan(0);
  });
});
