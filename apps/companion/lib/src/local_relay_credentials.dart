import 'relay_auth.dart';

/// Minimal Android-local credential storage boundary for the direct relay.
///
/// The backing store is intentionally abstract: production Android code should
/// bind this to encrypted device-local storage (for example Keystore-backed
/// storage), while tests can use an in-memory implementation. Token values must
/// never be written to Git, logs, analytics, crash reports, or relay envelopes.
abstract interface class RelaySecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class LocalRelayCredentialProvider implements RelayCredentialProvider {
  LocalRelayCredentialProvider(this.store);

  final RelaySecretStore store;

  static const _tokenKey = 'relay.token';
  static const _expiresAtKey = 'relay.expires_at';

  @override
  Future<RelayCredential?> load() async {
    final token = await store.read(_tokenKey);
    final expiresRaw = await store.read(_expiresAtKey);
    if (token == null || token.isEmpty || expiresRaw == null) return null;

    final expiresAt = DateTime.tryParse(expiresRaw)?.toUtc();
    if (expiresAt == null) return null;
    return RelayCredential(token: token, expiresAt: expiresAt);
  }

  Future<void> save(RelayCredential credential) async {
    await store.write(_tokenKey, credential.token);
    await store.write(_expiresAtKey, credential.expiresAt.toUtc().toIso8601String());
  }

  @override
  Future<void> clear() async {
    await store.delete(_tokenKey);
    await store.delete(_expiresAtKey);
  }
}
