import 'package:flutter/services.dart';

import 'local_relay_credentials.dart';

/// Device-local secret store backed by the native Companion platform bridge.
///
/// Native Android owns encryption/key material. Dart only sends the storage key
/// and secret value across the in-process MethodChannel; values must never be
/// logged, surfaced in analytics, or included in relay envelopes.
class PlatformRelaySecretStore implements RelaySecretStore {
  PlatformRelaySecretStore({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('tech.threedvr.companion/relay_secrets');

  final MethodChannel _channel;

  @override
  Future<String?> read(String key) async {
    return _channel.invokeMethod<String>('read', {'key': key});
  }

  @override
  Future<void> write(String key, String value) async {
    await _channel.invokeMethod<void>('write', {'key': key, 'value': value});
  }

  @override
  Future<void> delete(String key) async {
    await _channel.invokeMethod<void>('delete', {'key': key});
  }
}
