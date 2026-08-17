/// Authentication boundary for Companion's direct relay.
///
/// Credentials must come from Android-local secure configuration. Implementations
/// must not persist or emit token values through Git, analytics, crash reports,
/// logs, or command/result envelopes.
abstract interface class RelayCredentialProvider {
  Future<RelayCredential?> load();

  Future<void> clear();
}

class RelayCredential {
  const RelayCredential({
    required this.token,
    required this.expiresAt,
  });

  final String token;
  final DateTime expiresAt;

  bool isUsableAt(DateTime now) =>
      token.isNotEmpty && now.toUtc().isBefore(expiresAt.toUtc());

  @override
  String toString() => 'RelayCredential(<redacted>, expiresAt: $expiresAt)';
}

/// Returns only a bearer header value for a currently usable credential.
/// Callers should treat the returned string as sensitive and never log it.
Future<String?> relayAuthorizationHeader(
  RelayCredentialProvider provider, {
  DateTime Function()? clock,
}) async {
  final credential = await provider.load();
  if (credential == null) return null;
  final now = (clock ?? DateTime.now)().toUtc();
  if (!credential.isUsableAt(now)) return null;
  return 'Bearer ${credential.token}';
}
