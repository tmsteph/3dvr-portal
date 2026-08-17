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
    HttpClient? httpClient,
    DateTime Function()? clock,
  })  : _httpClient = httpClient ?? HttpClient(),
        _clock = clock ?? DateTime.now;

  final Uri baseUri;
  final RelayCredentialProvider credentials;
  final HttpClient _httpClient;
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

    final startedAt = _clock().toUtc();
    final request = await _httpClient.postUrl(baseUri.resolve('/v1/relay/invoke'));
    request.headers.set(HttpHeaders.authorizationHeader, authorization);
    request.headers.contentType = ContentType.json;
    request.write(jsonEncode(<String, Object?>{
      'requestId': envelope.requestId,
      'capabilityId': envelope.capabilityId,
      'expiresAt': envelope.expiresAt.toUtc().toIso8601String(),
    }));

    final response = await request.close();
    final body = await utf8.decoder.bind(response).join();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw RelayClientException('relay returned HTTP ${response.statusCode}');
    }

    final decoded = jsonDecode(body);
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
