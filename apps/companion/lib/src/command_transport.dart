import 'dart:async';

/// Transport boundary for delivering already-authorized Companion commands.
///
/// Execution capability and risk policy intentionally live outside this layer.
/// A transport may move an envelope, reconnect, and report health; it must not
/// invent commands, broaden capabilities, or bypass device-side approval.
abstract interface class CommandTransport {
  String get id;

  Stream<TransportState> get states;

  Future<void> start();

  Future<void> stop();

  Future<void> sendResult(CommandResultEnvelope result);
}

enum TransportStatus { stopped, connecting, connected, backingOff }

class TransportState {
  const TransportState({
    required this.status,
    this.detail,
    this.retryAfter,
  });

  final TransportStatus status;
  final String? detail;
  final Duration? retryAfter;
}

/// Minimal wire envelope shared by direct relay and fallback transports.
///
/// `capability` must be a named capability understood by Companion (for
/// example `health`, `device.status`, `url.open`, or `app.open_known`). Raw
/// shell commands and arbitrary accessibility selectors are not valid here.
class CommandEnvelope {
  const CommandEnvelope({
    required this.id,
    required this.capability,
    required this.issuedAt,
    required this.expiresAt,
    this.arguments = const <String, Object?>{},
  });

  final String id;
  final String capability;
  final DateTime issuedAt;
  final DateTime expiresAt;
  final Map<String, Object?> arguments;

  bool get isExpired => !DateTime.now().toUtc().isBefore(expiresAt.toUtc());
}

class CommandResultEnvelope {
  const CommandResultEnvelope({
    required this.commandId,
    required this.ok,
    required this.completedAt,
    this.code,
    this.data = const <String, Object?>{},
  });

  final String commandId;
  final bool ok;
  final DateTime completedAt;
  final String? code;
  final Map<String, Object?> data;
}

/// Keeps the existing audited GitHub/Termux path explicit as a fallback while
/// the direct relay is introduced. The adapter implementation can remain
/// unchanged behind this boundary.
abstract interface class FallbackCommandTransport implements CommandTransport {}
