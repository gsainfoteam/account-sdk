/// 이 파일은 `pnpm contract:dart`가 `packages/contract`에서 생성한다. 손으로 고치지 않는다.
enum AccountPrompt {
  none('none'),
  login('login'),
  consent('consent');

  const AccountPrompt(this.wire);

  /// authorize 요청의 `prompt`에 넣는 값이다.
  final String wire;
}
