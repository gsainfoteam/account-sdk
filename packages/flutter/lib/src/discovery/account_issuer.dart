import '../constants.dart';

/// A deployment of the IdP, identified by the origin of its API.
class AccountIssuer {
  const AccountIssuer._(this.apiOrigin);

  factory AccountIssuer.custom(Uri apiOrigin) => AccountIssuer._(apiOrigin.toString());

  /// The issuer of a known [AccountEnvironment].
  AccountIssuer.of(AccountEnvironment environment) : apiOrigin = environment.apiOrigin;

  static final production = AccountIssuer.of(AccountEnvironment.production);
  static final staging = AccountIssuer.of(AccountEnvironment.staging);

  final String apiOrigin;

  /// The OpenID discovery document, which is always served from the API host.
  Uri get discoveryUrl => Uri.parse(apiOrigin).replace(path: AccountConstants.discoveryPath);
}
