import 'package:companion/src/sales_mode.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final now = DateTime.utc(2026, 8, 15, 20);

  SalesTask task({
    SalesIntent intent = SalesIntent.sendMessage,
    String contactKey = 'lead@example.com',
    String? message = 'Hi! Want help getting your project online?',
    DateTime? expiresAt,
  }) {
    return SalesTask(
      id: 'task-1',
      leadId: 'lead-1',
      contactKey: contactKey,
      channel: SalesChannel.email,
      intent: intent,
      createdAt: now.subtract(const Duration(minutes: 1)),
      expiresAt: expiresAt ?? now.add(const Duration(minutes: 10)),
      reason: 'Reply to an interested lead.',
      message: message,
    );
  }

  test('non-sending sales actions can run without send approval', () {
    const guard = SalesGuard(SalesPolicy());
    final result = guard.evaluate(
      task(intent: SalesIntent.draftReply),
      now: now,
    );

    expect(result.decision, SalesDecision.allow);
  });

  test('outbound sends require explicit approval in v0.1', () {
    const guard = SalesGuard(SalesPolicy());
    final result = guard.evaluate(task(), now: now);

    expect(result.decision, SalesDecision.requireApproval);
  });

  test('suppressed contacts are denied', () {
    const guard = SalesGuard(
      SalesPolicy(suppressedContacts: {'lead@example.com'}),
    );
    final result = guard.evaluate(task(), now: now);

    expect(result.decision, SalesDecision.deny);
  });

  test('expired tasks are denied', () {
    const guard = SalesGuard(SalesPolicy());
    final result = guard.evaluate(
      task(expiresAt: now.subtract(const Duration(seconds: 1))),
      now: now,
    );

    expect(result.decision, SalesDecision.deny);
  });

  test('daily contact limit blocks repeated outreach', () {
    const guard = SalesGuard(SalesPolicy(maxOutboundPerContactPerDay: 1));
    final result = guard.evaluate(
      task(),
      now: now,
      history: [
        SalesHistoryEntry(
          contactKey: 'lead@example.com',
          sentAt: now.subtract(const Duration(hours: 1)),
          sent: true,
        ),
      ],
    );

    expect(result.decision, SalesDecision.deny);
  });

  test('empty outbound messages are denied', () {
    const guard = SalesGuard(SalesPolicy());
    final result = guard.evaluate(task(message: '   '), now: now);

    expect(result.decision, SalesDecision.deny);
  });
}
