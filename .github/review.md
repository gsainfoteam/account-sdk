# 리뷰 지침

claude-review-plugin이 PR을 검토할 때 읽는 파일입니다. 이 저장소의 규칙 가운데 lint, 타입 검사, 테스트, CI가 잡지 못하는 것만 적었습니다.

## 볼 것

### 패키지 경계

- 의존 방향을 거스르는 import. `contract` ← `core` ← `web` ← `react`, `core` ← `server` ← `nest` 순서이고, `testing`은 `contract`만 씁니다
- `@infoteam/account-contract`에 있는 값(scope, 거절 사유, scope별 사용자 필드, OAuth 오류 코드, prompt)을 다른 패키지에서 문자열로 다시 정의한 경우
- IdP 주소, discovery와 등록 조회 경로, 세션 endpoint 경로, callback 경로, 저장소 키 namespace를 `packages/core/src/constants/idp.json` 밖에 적은 경우
- discovery 문서의 값을 그대로 쓰지 않고 보정하거나 기본값으로 대신한 경우

### 웹과 Flutter의 짝

- 로그인 흐름, 세션 프로토콜, discovery 검증(`normalizeDiscovery`), 거절 처리를 한쪽 패키지에서만 바꾼 경우. `packages/web`과 `packages/flutter`는 같은 프로토콜을 따릅니다
- 세션 endpoint(`/auth/login`, `/auth/refresh`, `/auth/logout`)의 요청이나 응답 모양을 바꾸면서 `web`, `flutter`, `core/src/session/protocol.ts`, `nest` DTO, `examples/nest`, 루트 README의 세션 프로토콜 절을 함께 바꾸지 않은 경우

### 보안

- 웹에서 access token을 메모리 밖에, refresh token을 httpOnly 쿠키 밖에 두는 경우. 앱은 둘 다 보안 저장소에 둡니다
- 토큰, client secret, code, ticket이 로그, 오류 메시지, URL query에 남는 경우
- `state`, `nonce`, `code_verifier`, id_token `aud` 확인을 건너뛰거나 실패를 삼키는 경우
- refresh 쿠키의 `HttpOnly`, `Secure`, `SameSite=Strict`가 빠지거나, 쿠키를 쓰는 endpoint의 `Origin` 확인이 빠지는 경우

### 릴리스

- 패키지 코드를 바꾸면서 `.changeset/*.md`와 `pnpm version:packages` 결과(각 `package.json`, `CHANGELOG.md`, `packages/flutter/pubspec.yaml`)가 없는 경우. 문서만 바꾼 PR은 버전을 올리지 않습니다
- 공개 API를 깨면서 changeset이 major가 아니거나 commit 제목에 `!`가 없는 경우
- 바뀐 API를 루트 `README.md`나 패키지 README가 따라가지 않는 경우

### 코드

- `es-toolkit`에 있는 helper를 직접 구현한 경우
- 테스트가 바뀐 동작을 확인하지 않는 경우
- 쓸모없는 추상화: 구현이 하나뿐인 인터페이스, 바뀌지 않는 값의 설정, 전달만 하는 래퍼
- 코드나 이름을 되풀이하는 주석은 제안(비차단)으로 짚습니다. 주석은 왜 이렇게 해야 하는지와 다르게 짜면 무엇이 깨지는지만 적습니다

## 보지 않을 것

- ESLint, Prettier, TypeScript, `flutter analyze`가 잡는 것
- 생성 파일: `packages/flutter/lib/**/*.generated.dart`(CI가 `pnpm contract:dart --check`로 확인합니다), `CHANGELOG.md`
- `pnpm-lock.yaml`
- 문장 다듬기 같은 취향의 문제. 문서는 틀린 내용만 지적합니다
