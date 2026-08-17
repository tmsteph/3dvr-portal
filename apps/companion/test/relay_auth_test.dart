import 'package:flutter_test/flutter_test.dart';
import 'package:companion/src/relay_auth.dart';

class MemoryCredentials implements RelayCredentialProvider {
  MemoryCredentials(this.value);

  RelayCredential? value;

  @override
  Future<RelayCredential?> load() async => value;

  @override
  Future<void> clear() async => value = null;
}

void main() {
  final now = DateTime.utc(2026, 8, 17, 5);

  test('missing credential does not produce authorization', () async {
    final provider = MemoryCredentials(null);
    expect(await relayAuthorizationHeader(provider, clock: () => now), isNull);
  });

  test('expired credential does not produce authorization', () async {
    final provider = MemoryCredentials(
      RelayCredential(token: 'secret', expiresAt: now.subtract(const Duration(seconds: 1))),
    );
    expect(await relayAuthorizationHeader(provider, clock: () => now), isNull);
  });

  test('usable credential produces bearer authorization', () async {
    final provider = MemoryCredentials(
      RelayCredential(token: 'secret', expiresAt: now.add(const Duration(minutes: 5))),
    );
    expect(
      await relayAuthorizationHeader(provider, clock: () => now),
      'Bearer secret',
    );
  });

  test('credential string representation never reveals token', () {
    final credential = RelayCredential(
      token: 'do-not-log-me',
      expiresAt: now.add(const Duration(minutes: 5)),
    );
    expect(credential.toString(), isNot(contains('do-not-log-me')));
    expect(credential.toString(), contains('<redacted>'));
  });
}
