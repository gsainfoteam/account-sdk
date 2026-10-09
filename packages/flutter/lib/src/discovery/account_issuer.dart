// IdP 는 `api.<host>` 에 API 를, `<host>` 에 로그인 화면을 둔다.
class AccountIssuer {
  const AccountIssuer._(this.apiOrigin);

  factory AccountIssuer.custom(Uri apiOrigin) => AccountIssuer._(apiOrigin.toString());

  static const production = AccountIssuer._('https://api.account.gistory.me');
  static const staging = AccountIssuer._('https://api.stg.account.gistory.me');

  final String apiOrigin;

  Uri get discoveryUrl => Uri.parse(apiOrigin).replace(path: '/.well-known/openid-configuration');
}
