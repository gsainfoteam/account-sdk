// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createAccountClient } from '../src';

describe('a client created on the server', () => {
  const create = (fetch = vi.fn<typeof globalThis.fetch>()) =>
    createAccountClient({ issuer: 'production', clientId: 'ziggle', api: '/api', fetch });

  it('can be created at module scope while rendering, and stays loading like the first render', async () => {
    const client = create();

    await client.ready();

    expect(client.store.getState()).toMatchObject({
      status: 'loading',
      accessToken: null,
      redirecting: false,
    });
    expect(client.isHandlingRedirect()).toBe(false);
    expect(client.callbackReturnTo).toBeNull();
  });

  it('sends requests without a token and refuses to log in', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 401 }));
    const client = create(fetch);

    expect((await client.fetch('https://api.ziggle.gistory.me/notices')).status).toBe(401);
    expect(fetch).toHaveBeenCalledOnce();
    await expect(client.login()).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(client.requireAuth()).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
