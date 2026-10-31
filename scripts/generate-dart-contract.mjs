import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { DENIAL_REASONS } from '../packages/contract/src/denial-reasons.ts';
import {
  CODE_CHALLENGE_METHOD,
  OAUTH_ERROR_CODES,
  PROMPTS,
} from '../packages/contract/src/oauth.ts';
import {
  CLIENT_SCOPES,
  OFFLINE_ACCESS_SCOPE,
  OPENID_SCOPE,
} from '../packages/contract/src/scopes.ts';

const SCOPES_OUTPUT = 'packages/flutter/lib/src/client/scopes.generated.dart';
const DENIAL_REASONS_OUTPUT = 'packages/flutter/lib/src/errors/denial_reasons.generated.dart';
const OAUTH_ERROR_CODES_OUTPUT = 'packages/flutter/lib/src/errors/oauth_error_codes.generated.dart';
const PROMPTS_OUTPUT = 'packages/flutter/lib/src/client/prompts.generated.dart';
const OAUTH_OUTPUT = 'packages/flutter/lib/src/client/oauth.generated.dart';

const DART_IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const GENERATED =
  '이 파일은 `pnpm contract:dart`가 `packages/contract`에서 생성한다. 손으로 고치지 않는다.';

const check = process.argv.includes('--check');

const camelCase = (wire) => wire.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());

const values = (wires) => {
  const invalid = wires.filter((wire) => !DART_IDENTIFIER.test(wire));

  if (invalid.length) {
    throw new Error(`Dart enum 이름으로 바꿀 수 없는 값이다: ${invalid.join(', ')}`);
  }

  return wires.map((wire) => `  ${camelCase(wire)}('${wire}')`);
};

const scopes = `/// \`openid\`를 뺀, IdP가 받는 scope다.
///
/// \`openid\`는 [AccountClient]가 항상 함께 요청한다. 서비스 백엔드가 id_token으로 사용자를 확인하기 때문이다.
///
/// ${GENERATED}
enum AccountScope {
${values([...CLIENT_SCOPES, OFFLINE_ACCESS_SCOPE]).join(',\n')};

  const AccountScope(this.value);

  /// IdP에 보내는 scope 문자열이다.
  final String value;
}
`;

const denialReasons = `/// account-fe가 사용자를 돌려보낸 사유다. \`access_denied\` 응답의 \`error_description\`에서 읽는다.
///
/// ${GENERATED}
enum AccountDenialReason {
${[...values(DENIAL_REASONS), "  other('')"].join(',\n')};

  const AccountDenialReason(this.wire);

  /// account-fe가 \`error_description\`에 담아 보내는 값이다.
  final String wire;

  static AccountDenialReason parse(String? wire) =>
      values.firstWhere((reason) => reason.wire == wire, orElse: () => other);
}
`;

const oauthErrorCodes = `/// ${GENERATED}
enum OAuthErrorCode {
${[...values(OAUTH_ERROR_CODES), "  unknown('')"].join(',\n')};

  const OAuthErrorCode(this.wire);

  final String wire;

  static OAuthErrorCode parse(String wire) =>
      values.firstWhere((code) => code.wire == wire, orElse: () => unknown);
}
`;

const prompts = `/// ${GENERATED}
enum AccountPrompt {
${values(PROMPTS).join(',\n')};

  const AccountPrompt(this.wire);

  final String wire;
}
`;

const oauth = `// ${GENERATED}

const openidScope = '${OPENID_SCOPE}';
const codeChallengeMethod = '${CODE_CHALLENGE_METHOD}';
`;

const outputs = [
  [SCOPES_OUTPUT, scopes],
  [DENIAL_REASONS_OUTPUT, denialReasons],
  [OAUTH_ERROR_CODES_OUTPUT, oauthErrorCodes],
  [PROMPTS_OUTPUT, prompts],
  [OAUTH_OUTPUT, oauth],
];

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined);
const stale = outputs.filter(([path, content]) => read(path) !== content);

if (check) {
  if (stale.length) {
    console.error(`contract 와 어긋난 Dart 파일: ${stale.map(([path]) => path).join(', ')}`);
    console.error('pnpm contract:dart 로 다시 생성한다.');
    process.exit(1);
  }
} else {
  for (const [path, content] of stale) writeFileSync(path, content);
}

console.log(`Dart contract: ${stale.length ? `${stale.length} 개 파일 갱신` : '최신'}`);
