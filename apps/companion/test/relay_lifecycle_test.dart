import 'dart:math';

import 'package:companion/src/command_transport.dart';
import 'package:companion/src/relay_backoff.dart';
import 'package:companion/src/relay_lifecycle.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('connects after bounded retry and emits deterministic lifecycle', () async {
    var connects = 0;
    final delays = <Duration>[];
    final controller = RelayLifecycleController(
      connect: () async {
        connects += 1;
        if (connects == 1) throw StateError('offline');
      },
      disconnect: () async {},
      backoff: RelayBackoff(
        base: const Duration(milliseconds: 10),
        cap: const Duration(milliseconds: 10),
        random: Random(1),
      ),
      delay: (duration) async => delays.add(duration),
    );
    final statuses = <TransportStatus>[];
    final subscription = controller.states.listen((state) => statuses.add(state.status));

    await controller.start();
    await Future<void>.delayed(Duration.zero);

    expect(connects, 2);
    expect(delays, hasLength(1));
    expect(statuses, [
      TransportStatus.connecting,
      TransportStatus.backingOff,
      TransportStatus.connecting,
      TransportStatus.connected,
    ]);

    await controller.stop();
    await subscription.cancel();
    await controller.dispose();
  });

  test('start is idempotent while connected', () async {
    var connects = 0;
    final controller = RelayLifecycleController(
      connect: () async => connects += 1,
      disconnect: () async {},
    );

    await controller.start();
    await controller.start();

    expect(connects, 1);
    await controller.dispose();
  });

  test('connection loss reconnects without enabling command capabilities', () async {
    var connects = 0;
    var disconnects = 0;
    final controller = RelayLifecycleController(
      connect: () async => connects += 1,
      disconnect: () async => disconnects += 1,
    );

    await controller.start();
    await controller.connectionLost();

    expect(connects, 2);
    expect(disconnects, 1);
    await controller.dispose();
  });
}
