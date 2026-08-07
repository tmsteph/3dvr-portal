import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'src/local_bridge_server.dart';
import 'src/platform_bridge.dart';
import 'src/protocol.dart';

void main() => runApp(const CompanionApp());

class CompanionApp extends StatelessWidget {
  const CompanionApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '3DVR Companion',
      theme: ThemeData(useMaterial3: true),
      home: const CompanionHome(),
    );
  }
}

class CompanionHome extends StatefulWidget {
  const CompanionHome({super.key});

  @override
  State<CompanionHome> createState() => _CompanionHomeState();
}

class _CompanionHomeState extends State<CompanionHome> {
  final CompanionPlatformBridge bridge = const CompanionPlatformBridge();
  late final LocalCompanionServer localServer = LocalCompanionServer(bridge: bridge);
  Map<String, Object?> status = const {};
  Map<String, Object?> permissionState = const {};
  bool loading = true;
  String? bridgeError;

  CompanionPlatform get currentPlatform {
    if (Platform.isAndroid) return CompanionPlatform.android;
    if (Platform.isIOS) return CompanionPlatform.ios;
    if (Platform.isMacOS) return CompanionPlatform.macos;
    if (Platform.isWindows) return CompanionPlatform.windows;
    return CompanionPlatform.linux;
  }

  @override
  void initState() {
    super.initState();
    refresh();
    _startLocalBridge();
  }

  @override
  void dispose() {
    localServer.stop();
    super.dispose();
  }

  Future<void> _startLocalBridge() async {
    try {
      await localServer.start();
      if (mounted) setState(() => bridgeError = null);
    } catch (error) {
      if (mounted) setState(() => bridgeError = error.toString());
    }
  }

  Future<void> refresh() async {
    setState(() => loading = true);
    try {
      final values = await Future.wait([
        bridge.getDeviceStatus(),
        bridge.getCapabilityStatus(),
      ]);
      if (!mounted) return;
      setState(() {
        status = values[0];
        permissionState = values[1];
        loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        status = {'error': error.toString()};
        loading = false;
      });
    }
  }

  Future<void> _copyPairingCommand() async {
    final endpoint = localServer.endpoint;
    if (endpoint == null) return;
    final command = "pair-companion '${localServer.token}' '${endpoint.toString()}'";
    await Clipboard.setData(ClipboardData(text: command));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Termux pairing command copied')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final capabilities = companionCapabilities
        .where((capability) => capability.platforms.contains(currentPlatform))
        .toList(growable: false);
    final endpoint = localServer.endpoint;

    return Scaffold(
      appBar: AppBar(
        title: const Text('3DVR Companion'),
        actions: [
          IconButton(onPressed: refresh, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Permissioned device assistant',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          const Text(
            'Companion exposes explicit capabilities to Life Ops. Dangerous actions stay disabled until you approve them locally.',
          ),
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Device', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        Text('Platform: ${currentPlatform.name}'),
                        ...status.entries.map((entry) => Text('${entry.key}: ${entry.value}')),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Local bridge', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  if (bridgeError != null)
                    Text('Unavailable: $bridgeError')
                  else if (endpoint == null)
                    const Text('Starting…')
                  else ...[
                    Text('Endpoint: $endpoint'),
                    const Text('Session: paired green actions only'),
                    const SizedBox(height: 8),
                    FilledButton.tonalIcon(
                      onPressed: _copyPairingCommand,
                      icon: const Icon(Icons.copy),
                      label: const Text('Copy Termux pairing command'),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text('Capabilities', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          for (final capability in capabilities)
            Card(
              child: ListTile(
                leading: Icon(_riskIcon(capability.risk)),
                title: Text(capability.name),
                subtitle: Text(capability.description),
                trailing: Text(capability.risk.name.toUpperCase()),
              ),
            ),
          if (Platform.isAndroid) ...[
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: bridge.openAccessibilitySettings,
              child: const Text('Accessibility settings'),
            ),
            const SizedBox(height: 8),
            FilledButton.tonal(
              onPressed: bridge.openNotificationAccessSettings,
              child: const Text('Notification access settings'),
            ),
          ],
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Local permission state'),
                  const SizedBox(height: 8),
                  if (permissionState.isEmpty)
                    const Text('No native permission adapter connected yet.')
                  else
                    ...permissionState.entries
                        .map((entry) => Text('${entry.key}: ${entry.value}')),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

IconData _riskIcon(CompanionRisk risk) => switch (risk) {
      CompanionRisk.green => Icons.check_circle_outline,
      CompanionRisk.yellow => Icons.shield_outlined,
      CompanionRisk.red => Icons.lock_outline,
    };
