import 'dart:async';

import 'command_transport.dart';
import 'relay_backoff.dart';

/// Owns the direct-relay connection lifecycle without broadening Companion's
/// execution capabilities. Android foreground-service wiring can drive this
/// controller while the existing Termux transport remains an independent
/// fallback.
class RelayLifecycleController {
  RelayLifecycleController({
    required Future<void> Function() connect,
    required Future<void> Function() disconnect,
    RelayBackoff? backoff,
    Future<void> Function(Duration)? delay,
  })  : _connect = connect,
        _disconnect = disconnect,
        _backoff = backoff ?? RelayBackoff(),
        _delay = delay ?? Future<void>.delayed;

  final Future<void> Function() _connect;
  final Future<void> Function() _disconnect;
  final RelayBackoff _backoff;
  final Future<void> Function(Duration) _delay;
  final _states = StreamController<TransportState>.broadcast();

  bool _running = false;
  int _attempt = 0;

  Stream<TransportState> get states => _states.stream;
  bool get isRunning => _running;

  Future<void> start() async {
    if (_running) return;
    _running = true;
    _attempt = 0;
    await _connectUntilStopped();
  }

  Future<void> stop() async {
    if (!_running) return;
    _running = false;
    await _disconnect();
    _emit(const TransportState(status: TransportStatus.stopped));
  }

  Future<void> _connectUntilStopped() async {
    while (_running) {
      _emit(const TransportState(status: TransportStatus.connecting));
      try {
        await _connect();
        if (!_running) return;
        _attempt = 0;
        _emit(const TransportState(status: TransportStatus.connected));
        return;
      } catch (_) {
        if (!_running) return;
        final retryAfter = _backoff.delayForAttempt(_attempt++);
        _emit(TransportState(
          status: TransportStatus.backingOff,
          detail: 'relay connection failed',
          retryAfter: retryAfter,
        ));
        await _delay(retryAfter);
      }
    }
  }

  /// Called by the foreground service when an established relay connection is
  /// lost. Reconnect remains bounded by [RelayBackoff].
  Future<void> connectionLost() async {
    if (!_running) return;
    await _disconnect();
    await _connectUntilStopped();
  }

  void _emit(TransportState state) {
    if (!_states.isClosed) _states.add(state);
  }

  Future<void> dispose() async {
    if (_running) await stop();
    await _states.close();
  }
}
