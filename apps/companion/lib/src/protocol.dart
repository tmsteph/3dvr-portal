enum CompanionRisk { green, yellow, red }

enum CompanionPlatform { android, ios, macos, windows, linux }

class CompanionCapability {
  const CompanionCapability({
    required this.name,
    required this.risk,
    required this.platforms,
    this.requiresForeground = false,
    this.requiresConfirmation = false,
    this.description = '',
  });

  final String name;
  final CompanionRisk risk;
  final Set<CompanionPlatform> platforms;
  final bool requiresForeground;
  final bool requiresConfirmation;
  final String description;

  Map<String, Object?> toJson() => {
        'name': name,
        'risk': risk.name,
        'platforms': platforms.map((value) => value.name).toList(),
        'requiresForeground': requiresForeground,
        'requiresConfirmation': requiresConfirmation,
        'description': description,
      };
}

class CompanionActionRequest {
  const CompanionActionRequest({
    required this.id,
    required this.capability,
    required this.createdAt,
    required this.expiresAt,
    required this.reason,
    this.arguments = const {},
    this.approvalToken,
  });

  final String id;
  final String capability;
  final DateTime createdAt;
  final DateTime expiresAt;
  final String reason;
  final Map<String, Object?> arguments;
  final String? approvalToken;

  bool get isExpired => DateTime.now().toUtc().isAfter(expiresAt.toUtc());

  Map<String, Object?> toJson() => {
        'version': 1,
        'id': id,
        'capability': capability,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'expiresAt': expiresAt.toUtc().toIso8601String(),
        'reason': reason,
        'arguments': arguments,
        if (approvalToken != null) 'approvalToken': approvalToken,
      };
}

class CompanionActionResult {
  const CompanionActionResult({
    required this.id,
    required this.ok,
    required this.finishedAt,
    this.output = const {},
    this.error,
  });

  final String id;
  final bool ok;
  final DateTime finishedAt;
  final Map<String, Object?> output;
  final String? error;

  Map<String, Object?> toJson() => {
        'version': 1,
        'id': id,
        'ok': ok,
        'finishedAt': finishedAt.toUtc().toIso8601String(),
        'output': output,
        if (error != null) 'error': error,
      };
}

const companionCapabilities = <CompanionCapability>[
  CompanionCapability(
    name: 'device.status',
    risk: CompanionRisk.green,
    platforms: {
      CompanionPlatform.android,
      CompanionPlatform.ios,
      CompanionPlatform.macos,
      CompanionPlatform.windows,
      CompanionPlatform.linux,
    },
    description: 'Report basic device and Companion health.',
  ),
  CompanionCapability(
    name: 'url.open',
    risk: CompanionRisk.green,
    platforms: {
      CompanionPlatform.android,
      CompanionPlatform.ios,
      CompanionPlatform.macos,
      CompanionPlatform.windows,
      CompanionPlatform.linux,
    },
    description: 'Open an http/https URL using the operating system.',
  ),
  CompanionCapability(
    name: 'app.open_known',
    risk: CompanionRisk.green,
    platforms: {CompanionPlatform.android},
    description: 'Open one locally allowlisted Android app by friendly alias.',
  ),
  CompanionCapability(
    name: 'notification.metadata.read',
    risk: CompanionRisk.yellow,
    platforms: {CompanionPlatform.android},
    requiresConfirmation: true,
    description: 'Read normalized Android notification metadata after local permission is granted.',
  ),
  CompanionCapability(
    name: 'ui.snapshot',
    risk: CompanionRisk.yellow,
    platforms: {CompanionPlatform.android},
    requiresForeground: true,
    requiresConfirmation: true,
    description: 'Return a bounded description of the active Android accessibility tree.',
  ),
  CompanionCapability(
    name: 'ui.perform_known_action',
    risk: CompanionRisk.yellow,
    platforms: {CompanionPlatform.android},
    requiresForeground: true,
    requiresConfirmation: true,
    description: 'Perform a locally defined Android accessibility action. Remote arbitrary selectors are not allowed.',
  ),
  CompanionCapability(
    name: 'shortcut.run',
    risk: CompanionRisk.yellow,
    platforms: {CompanionPlatform.ios},
    requiresConfirmation: true,
    description: 'Invoke an app-owned iOS action exposed through App Intents/Shortcuts.',
  ),
];
