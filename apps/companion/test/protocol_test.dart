import 'package:companion/src/protocol.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('all capabilities have at least one platform', () {
    expect(
      companionCapabilities.every((capability) => capability.platforms.isNotEmpty),
      isTrue,
    );
  });

  test('remote Android UI actions require confirmation', () {
    final capability = companionCapabilities.singleWhere(
      (value) => value.name == 'ui.perform_known_action',
    );

    expect(capability.risk, CompanionRisk.yellow);
    expect(capability.requiresConfirmation, isTrue);
    expect(capability.platforms, contains(CompanionPlatform.android));
    expect(capability.platforms, isNot(contains(CompanionPlatform.ios)));
  });

  test('expired action requests reject themselves locally', () {
    final now = DateTime.now().toUtc();
    final request = CompanionActionRequest(
      id: 'test-expired',
      capability: 'device.status',
      createdAt: now.subtract(const Duration(minutes: 2)),
      expiresAt: now.subtract(const Duration(minutes: 1)),
      reason: 'test',
    );

    expect(request.isExpired, isTrue);
  });
}
