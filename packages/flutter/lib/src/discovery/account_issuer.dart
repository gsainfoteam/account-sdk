import '../constants.dart';

// IdP 는 `api.<host>` 에 API 를, `<host>` 에 로그인 화면을 둔다.
class AccountIssuer {
  const AccountIssuer._(this.apiOrigin);

  factory AccountIssuer.custom(Uri apiOrigin) => AccountIssuer._(apiOrigin.toString());

  static final production = AccountIssuer._(AccountConstants.environments['production']!);
  static final staging = AccountIssuer._(AccountConstants.environments['staging']!);

  final String apiOrigin;

  Uri get discoveryUrl => Uri.parse(apiOrigin).replace(path: AccountConstants.discoveryPath);
}
