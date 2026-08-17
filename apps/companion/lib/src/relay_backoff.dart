import 'dart:math';

class RelayBackoff {
  RelayBackoff({
    this.base = const Duration(seconds: 1),
    this.cap = const Duration(seconds: 30),
    Random? random,
  }) : _random = random ?? Random();

  final Duration base;
  final Duration cap;
  final Random _random;

  Duration delayForAttempt(int attempt) {
    if (attempt < 0) {
      throw ArgumentError.value(attempt, 'attempt', 'must be >= 0');
    }

    var milliseconds = base.inMilliseconds;
    for (var i = 0; i < attempt && milliseconds < cap.inMilliseconds; i++) {
      milliseconds = min(milliseconds * 2, cap.inMilliseconds);
    }

    return Duration(milliseconds: _random.nextInt(milliseconds + 1));
  }
}
