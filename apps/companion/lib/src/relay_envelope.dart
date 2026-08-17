const relayReadOnlyCapabilities = <String>{'health', 'device.status'};

class RelayEnvelope {
  const RelayEnvelope({
    required this.requestId,
    required this.capabilityId,
    required this.expiresAt,
  });

  final String requestId;
  final String capabilityId;
  final DateTime expiresAt;

  factory RelayEnvelope.fromJson(Map<String, Object?> json) {
    final requestId = json['requestId'];
    final capabilityId = json['capabilityId'];
    final expiresAt = json['expiresAt'];
    if (requestId is! String || requestId.trim().isEmpty) {
      throw const FormatException('requestId is required');
    }
    if (capabilityId is! String ||
        !relayReadOnlyCapabilities.contains(capabilityId)) {
      throw const FormatException('unknown relay capability');
    }
    if (expiresAt is! String) {
      throw const FormatException('expiresAt is required');
    }
    final parsedExpiry = DateTime.tryParse(expiresAt)?.toUtc();
    if (parsedExpiry == null) {
      throw const FormatException('expiresAt must be ISO-8601');
    }
    return RelayEnvelope(
      requestId: requestId,
      capabilityId: capabilityId,
      expiresAt: parsedExpiry,
    );
  }

  bool isExpired(DateTime now) => !expiresAt.isAfter(now.toUtc());
}

class RelayRequestGuard {
  final Set<String> _seenRequestIds = <String>{};

  void accept(RelayEnvelope envelope, DateTime now) {
    if (envelope.isExpired(now)) {
      throw const FormatException('relay request expired');
    }
    if (!_seenRequestIds.add(envelope.requestId)) {
      throw const FormatException('duplicate relay request');
    }
  }
}
