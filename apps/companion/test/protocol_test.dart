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

  test('message reads are bounded and sends are red', () {
    final notificationRead = companionCapabilities.singleWhere(
      (value) => value.name == 'messages.notification.read',
    );
    final notificationReply = companionCapabilities.singleWhere(
      (value) => value.name == 'messages.notification.reply',
    );
    final smsRead = companionCapabilities.singleWhere(
      (value) => value.name == 'messages.sms.read',
    );
    final smsSend = companionCapabilities.singleWhere(
      (value) => value.name == 'messages.sms.send',
    );

    expect(notificationRead.risk, CompanionRisk.yellow);
    expect(notificationRead.requiresConfirmation, isTrue);
    expect(notificationReply.risk, CompanionRisk.red);
    expect(notificationReply.requiresConfirmation, isTrue);
    expect(smsRead.risk, CompanionRisk.yellow);
    expect(smsRead.requiresConfirmation, isTrue);
    expect(smsSend.risk, CompanionRisk.red);
    expect(smsSend.requiresConfirmation, isTrue);
  });

  test('Shizuku status is green but privilege use stays confirmed', () {
    final status = companionCapabilities.singleWhere(
      (value) => value.name == 'shizuku.status',
    );
    final permission = companionCapabilities.singleWhere(
      (value) => value.name == 'shizuku.permission',
    );
    final probe = companionCapabilities.singleWhere(
      (value) => value.name == 'shizuku.probe',
    );

    expect(status.risk, CompanionRisk.green);
    expect(status.requiresConfirmation, isFalse);
    expect(permission.risk, CompanionRisk.yellow);
    expect(permission.requiresConfirmation, isTrue);
    expect(probe.risk, CompanionRisk.yellow);
    expect(probe.requiresConfirmation, isTrue);
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
