# account-sdk

인포팀 계정(IdP, account.gistory.me)에 서비스를 붙이는 SDK.

지금까지 서비스들은 OAuth 2.1 과 OIDC 연동을 프론트와 백엔드에서 각자 구현했다. 이 SDK 는 그 연동을 한곳에
모은다. 서비스는 IdP 환경 이름과 client id 만 넘기고, 로그인 흐름, 토큰 갱신, 서비스 세션 관리는 SDK 에 맡긴다.

## 패키지

| 패키지                                               | 쓰는 곳                                                          | 배포            |
| ---------------------------------------------------- | ---------------------------------------------------------------- | --------------- |
| [`@gsainfoteam/account-react`](packages/react)       | React 앱. web 을 포함한다                                        | GitHub Packages |
| [`@gsainfoteam/account-web`](packages/web)           | React 를 쓰지 않는 웹 앱                                         | GitHub Packages |
| [`@gsainfoteam/account-nest`](packages/nest)         | NestJS 백엔드. server 를 포함한다                                | GitHub Packages |
| [`@gsainfoteam/account-server`](packages/server)     | NestJS 를 쓰지 않는 Node, Bun 백엔드                             | GitHub Packages |
| [`@gsainfoteam/account-core`](packages/core)         | 위 패키지들의 공용 코어. 직접 설치할 일은 드물다                 | GitHub Packages |
| [`@gsainfoteam/account-contract`](packages/contract) | IdP 와 SDK 가 함께 쓰는 값(scope, 거절 사유). account-be 도 쓴다 | GitHub Packages |
| [`gsainfoteam_account`](packages/flutter)            | Flutter 앱                                                       | pub.dev         |

npm 패키지는 GitHub Packages 에서 받으므로 설치하려면 인증이 필요하다. 설정 방법은 각 패키지 README 에 있다.

## 로그인 방식 고르기

IdP 가 발급한 authorization code 를 누가 교환하느냐에 따라 두 가지로 나뉜다.

|                  | A. 브라우저나 앱이 교환            | B. 백엔드가 교환                                     |
| ---------------- | ---------------------------------- | ---------------------------------------------------- |
| 웹 설정          | `exchange: 'browser'`              | `exchange: 'backend'`                                |
| IdP client 종류  | public (secret 없음)               | confidential (secret 있음)                           |
| 백엔드가 받는 것 | IdP access token                   | code 와 PKCE verifier                                |
| 백엔드가 할 일   | `getUserInfo(token)`               | `loginWithCode({ code, codeVerifier, redirectUri })` |
| 지금 쓰는 서비스 | ziggle, house-moving-out, pot-g 앱 | chatbot, pot-g 매니저 웹                             |

새 서비스라면 A 를 권한다. 백엔드에 IdP secret 을 둘 필요가 없다.

어느 방식이든 IdP 토큰은 로그인할 때 한 번만 쓴다. 그 뒤로는 서비스 백엔드가 자기 세션(access token 과 refresh token)을
발급하고, SDK 는 그 세션의 갱신과 만료를 맡는다. 그래서 기본값에서는 `offline_access` 를 요청하지 않는다. 이 scope 를
요청하면 account-fe 가 로그인할 때마다 동의 화면을 띄우기 때문이다.

## 이름 규칙

- `login`, `logout`: 사용자 관점의 전체 흐름이다. IdP 로 보내고, callback 을 처리하고, 서비스 세션을 만드는 데까지를 말한다.
- `login`, `refresh`, `logout`: 서비스 백엔드의 세션 endpoint 를 한 번 호출하는 것이다. `SessionAdapter` 의 메서드이며
  `/auth/login` 같은 경로와 이름이 같다.

`login()` 한 번 안에서 `session.start()` 이 불린다.

## IdP 와 맞춘 것

- IdP 주소와 경로는 discovery(`/.well-known/openid-configuration`)에서 가져온다. 앱은 `'production'` 이나 `'staging'` 만 넘긴다.
- 지금 account-be 의 discovery 문서에는 결함이 있다. 스테이징 endpoint 가 깨져 있고, issuer 가 두 가지이며,
  `scopes_supported` 가 `scope_supported` 로 잘못 나간다. SDK 는 `normalizeDiscovery` 한곳에서만 이를 보정한다.
  운영과 스테이징의 실제 응답을 fixture 로 두고 테스트한다.
- 언어를 넘어 공유하는 값(IdP 주소, 경로, 저장소 키 namespace)은
  [`packages/core/src/constants/idp.json`](packages/core/src/constants/idp.json) 하나에 둔다. Flutter 패키지는 테스트로
  이 파일과 값이 같은지 확인한다.
- IdP 가 받는 scope 와 account-fe 의 거절 사유는 [`@gsainfoteam/account-contract`](packages/contract) 하나에 둔다.
  account-be 와 SDK 가 모두 이 패키지를 import 하고, Dart enum 은 `pnpm contract:dart` 가 여기서 생성한다.
  배포가 엇갈려 운영 IdP 와 어긋나면 live 테스트가 실패하고, 실행 중에는 `login()` 이 브라우저를 열기 전에 discovery 와
  대조해 `invalid_scope` 로 실패한다.
- scope 마다 어떤 사용자 필드가 오는지도 contract 의 `SCOPE_CLAIMS` 한 곳에 둔다. 서버 SDK 는 이 표로 `requiredScopes` 의 필드를
  필수 타입으로 만들고, 응답에 빠져 있으면 `missing_claims` 로 실패한다.

## 개발

[mise](https://mise.jdx.dev) 로 Node, pnpm, Flutter 버전을 맞춘다.

```bash
mise install
pnpm install
```

```bash
pnpm build          # 모든 npm 패키지 빌드 (turbo)
pnpm typecheck
pnpm lint
pnpm test           # 단위 테스트. IdP 에 요청하지 않는다
pnpm format         # prettier 검사
pnpm examples:build # examples 빌드

mise run check      # 위 검사를 CI 와 같은 순서로 실행
mise run test:live  # 운영과 스테이징 IdP 에 실제로 요청하는 테스트
pnpm contract:dart  # packages/contract 에서 Dart enum 다시 생성
```

Flutter 패키지는 `packages/flutter` 에서 `flutter analyze` 와 `flutter test` 로 검사한다.

### 스테이징 IdP 로 직접 로그인해 보기

[`examples/web`](examples/web) 은 Vite, React, TanStack Router 로 만든 프론트다.
[`examples/nest`](examples/nest) 는 ziggle-be 처럼 CommonJS 로 빌드한 Nest 백엔드다. 둘을 함께 띄우면 A 방식 전체를 확인할 수 있다.

1. 스테이징 IdP 에 client 를 등록하고 redirect URI 로 `http://localhost:5173/auth/callback` 을 넣는다. `name` 은 필수 scope 로 등록한다.
   `examples/nest` 가 `requiredScopes: ['name']` 으로 선언되어 있다.
2. `.env.example` 을 `.env` 로 복사하고 `ACCOUNT_TEST_CLIENT_ID` 에 client id 를 넣는다. mise 가 `.env` 를 읽어 각 task 에 넣어 준다.
3. `mise run example:api` 와 `mise run example:web` 을 각각 띄우고 http://localhost:5173 을 연다.

### 배포

[changesets](https://github.com/changesets/changesets) 로 버전을 올린다. 모든 패키지가 같은 버전을 쓴다.

```bash
pnpm changeset           # 변경 기록
pnpm version:packages    # 버전 반영. Flutter pubspec 도 같은 버전으로 맞춘다
```

`v*` 태그를 push 하면 GitHub Actions 가 npm 패키지를 GitHub Packages 에, Flutter 패키지를 pub.dev 에 배포한다.
