import 'dart:math';

import 'package:companion/src/relay_backoff.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('relay backoff stays bounded and deterministic with a seeded random', () {
    final backoff = RelayBackoff(
      base: const Duration(seconds: 1),
      cap: const Duration(seconds: 8),
      random: Random(7),
    );

    final delays = List.generate(8, backoff.delayForAttempt);

    expect(delays[0], lessThanOrEqualTo(const Duration(seconds: 1)));
    expect(delays[1], lessThanOrEqualTo(const Duration(seconds: 2)));
    expect(delays[2], lessThanOrEqualTo(const Duration(seconds: 4)));
    for (final delay in delays.skip(3)) {
      expect(delay, lessThanOrEqualTo(const Duration(seconds: 8)));
      expect(delay, greaterThanOrEqualTo(Duration.zero));
    }
  });

  test('relay backoff rejects negative attempts', () {
    final backoff = RelayBackoff(random: Random(1));
    expect(() => backoff.delayForAttempt(-1), throwsArgumentError);
  });
}
