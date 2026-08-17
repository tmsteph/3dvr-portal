import 'package:companion/src/local_relay_credentials.dart';
import 'package:companion/src/relay_auth.dart';
import 'package:flutter_test/flutter_test.dart';

class MemorySecretStore implements RelaySecretStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

void main() {
  test('credential provider persists and loads token plus expiry', () async {
    final store = MemorySecretStore();
    final provider = LocalRelayCredentialProvider(store);
    final credential = RelayCredential(
      token: 'secret-value',
      expiresAt: DateTime.utc(2026, 8, 17, 12),
    );

    await provider.save(credential);
    final loaded = await provider.load();

    expect(loaded?.token, 'secret-value');
    expect(loaded?.expiresAt, DateTime.utc(2026, 8, 17, 12));
    expect(loaded.toString(), contains('<redacted>'));
    expect(loaded.toString(), isNot(contains('secret-value')));
  });

  test('missing or malformed local state returns no credential', () async {
    final store = MemorySecretStore();
    final provider = LocalRelayCredentialProvider(store);

    expect(await provider.load(), isNull);
    store.values['relay.token'] = 'secret-value';
    store.values['relay.expires_at'] = 'not-a-date';
    expect(await provider.load(), isNull);
  });

  test('clear removes all relay credential material', () async {
    final store = MemorySecretStore();
    final provider = LocalRelayCredentialProvider(store);
    await provider.save(RelayCredential(
      token: 'secret-value',
      expiresAt: DateTime.utc(2026, 8, 17, 12),
    ));

    await provider.clear();

    expect(await provider.load(), isNull);
    expect(store.values, isEmpty);
  });
}
