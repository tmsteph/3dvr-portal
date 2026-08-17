import 'package:flutter_test/flutter_test.dart';
import 'package:three_dvr_companion/src/relay_envelope.dart';

void main() {
  final now = DateTime.utc(2026, 8, 17, 3);

  RelayEnvelope envelope({
    String requestId = 'req-1',
    String capabilityId = 'health',
    String expiresAt = '2026-08-17T03:01:00Z',
  }) => RelayEnvelope.fromJson({
    'requestId': requestId,
    'capabilityId': capabilityId,
    'expiresAt': expiresAt,
  });

  test('accepts only the initial read-only capabilities', () {
    expect(envelope().capabilityId, 'health');
    expect(envelope(capabilityId: 'device.status').capabilityId, 'device.status');
    expect(
      () => envelope(capabilityId: 'url.open'),
      throwsFormatException,
    );
  });

  test('rejects expired requests', () {
    final guard = RelayRequestGuard();
    expect(
      () => guard.accept(envelope(expiresAt: '2026-08-17T02:59:59Z'), now),
      throwsFormatException,
    );
  });

  test('rejects duplicate request ids', () {
    final guard = RelayRequestGuard();
    final request = envelope();
    guard.accept(request, now);
    expect(() => guard.accept(request, now), throwsFormatException);
  });

  test('rejects malformed envelopes', () {
    expect(
      () => RelayEnvelope.fromJson({
        'requestId': '',
        'capabilityId': 'health',
        'expiresAt': '2026-08-17T03:01:00Z',
      }),
      throwsFormatException,
    );
  });
}
