enum SalesChannel { sms, email, notificationReply, phone, other }

enum SalesIntent {
  triageInbound,
  draftReply,
  openConversation,
  sendMessage,
  logOutcome,
}

enum SalesDecision { allow, requireApproval, deny }

class SalesTask {
  const SalesTask({
    required this.id,
    required this.leadId,
    required this.contactKey,
    required this.channel,
    required this.intent,
    required this.createdAt,
    required this.expiresAt,
    required this.reason,
    this.message,
  });

  final String id;
  final String leadId;
  final String contactKey;
  final SalesChannel channel;
  final SalesIntent intent;
  final DateTime createdAt;
  final DateTime expiresAt;
  final String reason;
  final String? message;

  bool isExpiredAt(DateTime now) =>
      now.toUtc().isAfter(expiresAt.toUtc());

  Map<String, Object?> toJson() => {
        'version': 1,
        'id': id,
        'leadId': leadId,
        'contactKey': contactKey,
        'channel': channel.name,
        'intent': intent.name,
        'createdAt': createdAt.toUtc().toIso8601String(),
        'expiresAt': expiresAt.toUtc().toIso8601String(),
        'reason': reason,
        if (message != null) 'message': message,
      };
}

class SalesHistoryEntry {
  const SalesHistoryEntry({
    required this.contactKey,
    required this.sentAt,
    required this.sent,
  });

  final String contactKey;
  final DateTime sentAt;
  final bool sent;
}

class SalesPolicy {
  const SalesPolicy({
    this.suppressedContacts = const {},
    this.maxOutboundPerContactPerDay = 1,
  });

  final Set<String> suppressedContacts;
  final int maxOutboundPerContactPerDay;
}

class SalesEvaluation {
  const SalesEvaluation(this.decision, this.reason);

  final SalesDecision decision;
  final String reason;
}

class SalesGuard {
  const SalesGuard(this.policy);

  final SalesPolicy policy;

  SalesEvaluation evaluate(
    SalesTask task, {
    required DateTime now,
    Iterable<SalesHistoryEntry> history = const [],
  }) {
    final contactKey = task.contactKey.trim();

    if (task.isExpiredAt(now)) {
      return const SalesEvaluation(
        SalesDecision.deny,
        'Sales task expired.',
      );
    }

    if (task.leadId.trim().isEmpty || contactKey.isEmpty) {
      return const SalesEvaluation(
        SalesDecision.deny,
        'Sales tasks require a lead and contact key.',
      );
    }

    if (policy.suppressedContacts.contains(contactKey)) {
      return const SalesEvaluation(
        SalesDecision.deny,
        'Contact is suppressed from outreach.',
      );
    }

    if (task.intent != SalesIntent.sendMessage) {
      return const SalesEvaluation(
        SalesDecision.allow,
        'Non-sending sales action is allowed.',
      );
    }

    if (task.message == null || task.message!.trim().isEmpty) {
      return const SalesEvaluation(
        SalesDecision.deny,
        'Outbound sends require a non-empty message.',
      );
    }

    final startOfDayUtc = DateTime.utc(
      now.toUtc().year,
      now.toUtc().month,
      now.toUtc().day,
    );
    final sentToday = history.where((entry) {
      return entry.sent &&
          entry.contactKey == contactKey &&
          !entry.sentAt.toUtc().isBefore(startOfDayUtc);
    }).length;

    if (sentToday >= policy.maxOutboundPerContactPerDay) {
      return const SalesEvaluation(
        SalesDecision.deny,
        'Daily outreach limit reached for this contact.',
      );
    }

    return const SalesEvaluation(
      SalesDecision.requireApproval,
      'Outbound sales sends require explicit approval in v0.1.',
    );
  }
}
