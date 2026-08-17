import 'package:companion/src/relay_auth.dart';
import 'package:companion/src/relay_client.dart';
import 'package:companion/src/relay_envelope.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('RelayClient endpoint security', () {
    test('rejects cleartext remote relay endpoints', () {
      expect(
        () => RelayClient(
          baseUri: Uri.parse('http://relay.3dvr.tech'),
          credentials: _StaticCredentials(_validCredential()),
          sender: _FakeSender(),
        ),
        throwsArgumentError,
      );
    });

    test('allows HTTPS and loopback HTTP', () {
      final https = RelayClient(
        baseUri: Uri.parse('https://relay.3dvr.tech'),
        credentials: _StaticCredentials(_validCredential()),
        sender: _FakeSender(),
      );
      final loopback = RelayClient(
        baseUri: Uri.parse('http://127.0.0.1:38473'),
        credentials: _StaticCredentials(_validCredential()),
        sender: _FakeSender(),
      );
      https.close();
      loopback.close();
    });
  });

  group('RelayClient request boundary', () {
    test('rejects an expired request before network I/O', () async {
      final sender = _FakeSender();
      final now = DateTime.utc(2026, 8, 17, 18);
      final client = RelayClient(
        baseUri: Uri.parse('https://relay.3dvr.tech'),
        credentials: _StaticCredentials(_validCredential()),
        sender: sender,
        clock: () => now,
      );

      await expectLater(
        client.invoke(RelayEnvelope(
          requestId: 'request-expired',
          capabilityId: 'health',
          expiresAt: now,
        )),
        throwsA(isA<RelayClientException>()),
      );
      expect(sender.calls, 0);
    });

    test('rechecks expiry after asynchronous credential loading', () async {
      var now = DateTime.utc(2026, 8, 17, 18);
      final sender = _FakeSender();
      final credentials = _AdvancingCredentials(
        credential: RelayCredential(
          token: 'relay-secret-token',
          expiresAt: now.add(const Duration(hours: 1)),
        ),
        onLoad: () => now = now.add(const Duration(seconds: 3)),
      );
      final client = RelayClient(
        baseUri: Uri.parse('https://relay.3dvr.tech'),
        credentials: credentials,
        sender: sender,
        clock: () => now,
      );

      await expectLater(
        client.invoke(RelayEnvelope(
          requestId: 'request-near-expiry',
          capabilityId: 'device.status',
          expiresAt: now.add(const Duration(seconds: 2)),
        )),
        throwsA(
          isA<RelayClientException>().having(
            (error) => error.message,
            'message',
            'request expired',
          ),
        ),
      );
      expect(sender.calls, 0);
    });

    test('places credential only in the Authorization header', () async {
      final now = DateTime.utc(2026, 8, 17, 18);
      final sender = _FakeSender(
        response: const RelayHttpResponse(statusCode: 200, body: '{"ok":true}'),
      );
      final client = RelayClient(
        baseUri: Uri.parse('https://relay.3dvr.tech'),
        credentials: _StaticCredentials(RelayCredential(
          token: 'relay-secret-token',
          expiresAt: now.add(const Duration(hours: 1)),
        )),
        sender: sender,
        clock: () => now,
      );

      final result = await client.invoke(RelayEnvelope(
        requestId: 'request-header-test',
        capabilityId: 'health',
        expiresAt: now.add(const Duration(minutes: 1)),
      ));

      expect(result.payload['ok'], true);
      expect(sender.authorization, 'Bearer relay-secret-token');
      expect(sender.body.toString(), isNot(contains('relay-secret-token')));
      expect(sender.uri.toString(), 'https://relay.3dvr.tech/v1/relay/invoke');
    });

    test('normalizes malformed successful JSON into RelayClientException', () async {
      final now = DateTime.utc(2026, 8, 17, 18);
      final client = RelayClient(
        baseUri: Uri.parse('https://relay.3dvr.tech'),
        credentials: _StaticCredentials(RelayCredential(
          token: 'relay-secret-token',
          expiresAt: now.add(const Duration(hours: 1)),
        )),
        sender: _FakeSender(
          response: const RelayHttpResponse(statusCode: 200, body: '<html>bad gateway</html>'),
        ),
        clock: () => now,
      );

      await expectLater(
        client.invoke(RelayEnvelope(
          requestId: 'request-bad-json',
          capabilityId: 'health',
          expiresAt: now.add(const Duration(minutes: 1)),
        )),
        throwsA(
          isA<RelayClientException>().having(
            (error) => error.message,
            'message',
            'relay returned malformed JSON',
          ),
        ),
      );
    });

    test('normalizes non-success HTTP responses without echoing response data', () async {
      final now = DateTime.utc(2026, 8, 17, 18);
      final client = RelayClient(
        baseUri: Uri.parse('https://relay.3dvr.tech'),
        credentials: _StaticCredentials(RelayCredential(
          token: 'relay-secret-token',
          expiresAt: now.add(const Duration(hours: 1)),
        )),
        sender: _FakeSender(
          response: const RelayHttpResponse(
            statusCode: 503,
            body: 'upstream accidentally echoed relay-secret-token',
          ),
        ),
        clock: () => now,
      );

      await expectLater(
        client.invoke(RelayEnvelope(
          requestId: 'request-http-failure',
          capabilityId: 'health',
          expiresAt: now.add(const Duration(minutes: 1)),
        )),
        throwsA(
          isA<RelayClientException>()
              .having((error) => error.message, 'message', 'relay returned HTTP 503')
              .having((error) => error.toString(), 'redaction', isNot(contains('relay-secret-token'))),
        ),
      );
    });
  });
}

RelayCredential _validCredential() => RelayCredential(
      token: 'relay-secret-token',
      expiresAt: DateTime.utc(2099),
    );

class _StaticCredentials implements RelayCredentialProvider {
  _StaticCredentials(this.credential);

  final RelayCredential? credential;

  @override
  Future<RelayCredential?> load() async => credential;

  @override
  Future<void> clear() async {}
}

class _AdvancingCredentials extends _StaticCredentials {
  _AdvancingCredentials({
    required RelayCredential credential,
    required this.onLoad,
  }) : super(credential);

  final void Function() onLoad;

  @override
  Future<RelayCredential?> load() async {
    onLoad();
    return credential;
  }
}

class _FakeSender implements RelayRequestSender {
  _FakeSender({
    this.response = const RelayHttpResponse(statusCode: 200, body: '{"ok":true}'),
  });

  final RelayHttpResponse response;
  int calls = 0;
  Uri? uri;
  String? authorization;
  Map<String, Object?> body = const {};

  @override
  Future<RelayHttpResponse> postJson(
    Uri uri, {
    required String authorization,
    required Map<String, Object?> body,
  }) async {
    calls += 1;
    this.uri = uri;
    this.authorization = authorization;
    this.body = Map<String, Object?>.from(body);
    return response;
  }

  @override
  void close() {}
}
