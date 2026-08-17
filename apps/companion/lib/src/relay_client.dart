import 'dart:convert';
import 'dart:io';

import 'relay_auth.dart';
import 'relay_envelope.dart';

/// Minimal authenticated HTTP client for the first read-only direct-relay slice.
///
/// The client deliberately accepts only capabilities already admitted by
/// [relayReadOnlyCapabilities]. Tokens are placed only in the Authorization
/// header and are never included in errors or returned results.
class RelayClient {
  RelayClient({
    required this.baseUri,
    required this.credentials,
    RelayRequestSender? sender,
    DateTime Function()? clock,
  })  : _sender = sender ?? DartRelayRequestSender(),
        _clock = clock ?? DateTime.now {
    _requireSecureRelayUri(baseUri);
  }

  final Uri baseUri;
  final RelayCredentialProvider credentials;
  final RelayRequestSender _sender;
  final DateTime Function() _clock;

  Future<RelayRoundTrip> invoke(RelayEnvelope envelope) async {
    if (!relayReadOnlyCapabilities.contains(envelope.capabilityId)) {
      throw const RelayClientException('capability is not enabled');
    }
    if (envelope.isExpired(_clock())) {
      throw const RelayClientException('request expired');
    }

    final authorization = await relayAuthorizationHeader(
      credentials,
      clock: _clock,
    );
    if (authorization == null) {
      throw const RelayClientException('relay credential unavailable');
    }

    // Secure-store access is asynchronous. Do not let a request cross the
    // network boundary if it expired while credentials were being loaded.
    if (envelope.isExpired(_clock())) {
      throw const RelayClientException('request expired');
    }

    final startedAt = _clock().toUtc();
    final response = await _sender.postJson(
      baseUri.resolve('/v1/relay/invoke'),
      authorization: authorization,
      body: <String, Object?>{
        'requestId': envelope.requestId,
        'capabilityId': envelope.capabilityId,
        'expiresAt': envelope.expiresAt.toUtc().toIso8601String(),
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw RelayClientException('relay returned HTTP ${response.statusCode}');
    }

    final Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw const RelayClientException('relay returned malformed JSON');
    }
    if (decoded is! Map<String, dynamic>) {
      throw const RelayClientException('relay returned malformed JSON');
    }

    final finishedAt = _clock().toUtc();
    return RelayRoundTrip(
      requestId: envelope.requestId,
      capabilityId: envelope.capabilityId,
      payload: Map<String, Object?>.from(decoded),
      latency: finishedAt.difference(startedAt),
    );
  }

  void close() => _sender.close();
}

void _requireSecureRelayUri(Uri uri) {
  final host = uri.host.toLowerCase();
  final isLoopback = host == '127.0.0.1' || host == 'localhost' || host == '::1';
  if (uri.scheme == 'https') return;
  if (uri.scheme == 'http' && isLoopback) return;
  throw ArgumentError.value(
    uri,
    'baseUri',
    'relay endpoints must use HTTPS except for loopback development',
  );
}

abstract interface class RelayRequestSender {
  Future<RelayHttpResponse> postJson(
    Uri uri, {
    required String authorization,
    required Map<String, Object?> body,
  });

  void close();
}

class RelayHttpResponse {
  const RelayHttpResponse({required this.statusCode, required this.body});

  final int statusCode;
  final String body;
}

class DartRelayRequestSender implements RelayRequestSender {
  DartRelayRequestSender({HttpClient? httpClient})
      : _httpClient = httpClient ?? HttpClient();

  final HttpClient _httpClient;

  @override
  Future<RelayHttpResponse> postJson(
    Uri uri, {
    required String authorization,
    required Map<String, Object?> body,
  }) async {
    final request = await _httpClient.postUrl(uri);
    request.headers.set(HttpHeaders.authorizationHeader, authorization);
    request.headers.contentType = ContentType.json;
    request.write(jsonEncode(body));

    final response = await request.close();
    return RelayHttpResponse(
      statusCode: response.statusCode,
      body: await utf8.decoder.bind(response).join(),
    );
  }

  @override
  void close() => _httpClient.close(force: true);
}

class RelayRoundTrip {
  const RelayRoundTrip({
    required this.requestId,
    required this.capabilityId,
    required this.payload,
    required this.latency,
  });

  final String requestId;
  final String capabilityId;
  final Map<String, Object?> payload;
  final Duration latency;
}

class RelayClientException implements Exception {
  const RelayClientException(this.message);
  final String message;

  @override
  String toString() => 'RelayClientException: $message';
}
