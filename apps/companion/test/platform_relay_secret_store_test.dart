import 'package:companion/src/platform_relay_secret_store.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('test/relay_secrets');
  final values = <String, String>{};

  setUp(() async {
    values.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      final args = Map<String, dynamic>.from(call.arguments as Map);
      final key = args['key'] as String;
      switch (call.method) {
        case 'read':
          return values[key];
        case 'write':
          values[key] = args['value'] as String;
          return null;
        case 'delete':
          values.remove(key);
          return null;
        default:
          throw PlatformException(code: 'unsupported');
      }
    });
  });

  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('save/read/delete operations stay behind the platform channel', () async {
    final store = PlatformRelaySecretStore(channel: channel);
    expect(await store.read('relay.token'), isNull);

    await store.write('relay.token', 'secret-value');
    expect(await store.read('relay.token'), 'secret-value');

    await store.delete('relay.token');
    expect(await store.read('relay.token'), isNull);
  });
}
