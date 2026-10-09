/// `openid` 를 뺀, IdP 가 받는 scope.
///
/// 이 패키지는 id_token 을 검증하지 않으므로 요청하지도 않는다.
///
/// `pnpm contract:dart` 가 `packages/contract` 에서 생성한다. 손으로 고치지 않는다.
enum AccountScope {
  profile('profile'),
  name('name'),
  picture('picture'),
  email('email'),
  phoneNumber('phone_number'),
  studentId('student_id'),
  offlineAccess('offline_access');

  const AccountScope(this.value);

  /// IdP 에 보내는 scope 문자열.
  final String value;
}
