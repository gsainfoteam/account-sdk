import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { format, resolveConfig } from 'prettier';

const IDP = JSON.parse(readFileSync('packages/core/src/constants/idp.json', 'utf8'));
const TS_OUTPUT = 'packages/core/src/identity/client-scopes.generated.ts';
const DART_OUTPUT = 'packages/flutter/lib/src/client/scopes.generated.dart';

const OPENID = 'openid';
const OFFLINE_ACCESS = 'offline_access';
const DART_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

const environment = process.argv[2] ?? 'production';
const origin = IDP.environments[environment];

if (!origin) throw new Error(`알 수 없는 환경이다: ${environment}`);

const response = await fetch(origin + IDP.discoveryPath);

if (!response.ok) throw new Error(`${environment} discovery 요청이 ${response.status} 로 실패했다`);

const discovery = await response.json();
const advertised = discovery.scopes_supported ?? discovery.scope_supported;

if (!Array.isArray(advertised) || !advertised.every((scope) => typeof scope === 'string')) {
  throw new Error(`${environment} discovery 에 scopes_supported 가 없다`);
}

const missing = [OPENID, OFFLINE_ACCESS].filter((scope) => !advertised.includes(scope));
const invalid = advertised.filter((scope) => !DART_IDENTIFIER.test(scope));

if (missing.length) {
  throw new Error(`SDK 가 쓰는 OIDC scope 가 빠졌다: ${missing.join(', ')}`);
}

if (invalid.length) {
  throw new Error(`Dart enum 이름으로 바꿀 수 없는 scope 다: ${invalid.join(', ')}`);
}

const clientScopes = advertised.filter((scope) => scope !== OPENID && scope !== OFFLINE_ACCESS);
const dartScopes = [...clientScopes, OFFLINE_ACCESS];

const camelCase = (scope) => scope.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());

const ts = `import * as z from 'zod/mini';

/**
 * Scopes that grant access to user information.
 *
 * @remarks
 * Generated from the ${environment} IdP's \`scopes_supported\` by \`pnpm sync:scopes\`. Do not edit by hand:
 * when account-be adds or removes a scope, run the script again and release the SDK.
 */
export const ClientScopeSchema = z.enum([${clientScopes.map((scope) => `'${scope}'`).join(', ')}]);
`;

const dart = `/// Scopes the IdP accepts, except \`openid\`.
///
/// This package does not verify id_tokens, so it does not ask for one.
///
/// Generated from the ${environment} IdP's \`scopes_supported\` by \`pnpm sync:scopes\`. Do not edit by
/// hand: when account-be adds or removes a scope, run the script again and release the package.
enum AccountScope {
${dartScopes.map((scope) => `  ${camelCase(scope)}('${scope}')`).join(',\n')};

  const AccountScope(this.value);

  /// The scope as sent to the IdP.
  final String value;
}
`;

writeFileSync(
  TS_OUTPUT,
  await format(ts, { ...(await resolveConfig(TS_OUTPUT)), filepath: TS_OUTPUT }),
);
writeFileSync(DART_OUTPUT, dart);
execFileSync('dart', ['format', DART_OUTPUT], { stdio: 'ignore' });

console.log(`${environment} scopes -> ${advertised.join(' ')}`);
