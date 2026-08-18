import 'package:flutter/services.dart';

class CompanionPlatformBridge {
  const CompanionPlatformBridge();

  static const MethodChannel _channel = MethodChannel('tech.3dvr.companion/platform');

  Future<Map<String, Object?>> getDeviceStatus() async {
    final result = await _channel.invokeMapMethod<String, Object?>('deviceStatus');
    return result ?? const {};
  }

  Future<String?> getBridgeToken() async {
    return _channel.invokeMethod<String>('bridgeToken');
  }

  Future<bool> openUrl(String url) async {
    final result = await _channel.invokeMethod<bool>('openUrl', {'url': url});
    return result ?? false;
  }

  Future<bool> openKnownApp(String alias) async {
    final result = await _channel.invokeMethod<bool>('openKnownApp', {'alias': alias});
    return result ?? false;
  }

  Future<List<Map<String, Object?>>> getNotificationMetadata() async {
    final result = await _channel.invokeListMethod<Map>('notificationMetadata');
    if (result == null) return const [];
    return result
        .map((item) => item.map((key, value) => MapEntry(key.toString(), value)))
        .cast<Map<String, Object?>>()
        .toList(growable: false);
  }

  Future<List<Map<String, Object?>>> getMessageNotifications() async {
    final result = await _channel.invokeListMethod<Map>('messageNotifications');
    if (result == null) return const [];
    return result
        .map((item) => item.map((key, value) => MapEntry(key.toString(), value)))
        .cast<Map<String, Object?>>()
        .toList(growable: false);
  }

  Future<bool> replyMessageNotification({
    required String key,
    required String text,
  }) async {
    final result = await _channel.invokeMethod<bool>(
      'replyMessageNotification',
      {'key': key, 'text': text},
    );
    return result ?? false;
  }

  Future<Map<String, Object?>> getCapabilityStatus() async {
    final result = await _channel.invokeMapMethod<String, Object?>('capabilityStatus');
    return result ?? const {};
  }

  Future<Map<String, Object?>> getAssistantStatus() async {
    final result = await _channel.invokeMapMethod<String, Object?>('assistantStatus');
    return result ?? const {};
  }

  Future<Map<String, Object?>> beginVoiceAuthorization() async {
    final result = await _channel.invokeMapMethod<String, Object?>('beginVoiceAuthorization');
    return result ?? const {};
  }

  Future<bool> requestAssistantRole() async {
    final result = await _channel.invokeMethod<bool>('requestAssistantRole');
    return result ?? false;
  }

  Future<bool> openVoiceInputSettings() async {
    final result = await _channel.invokeMethod<bool>('openVoiceInputSettings');
    return result ?? false;
  }

  Future<bool> openAccessibilitySettings() async {
    final result = await _channel.invokeMethod<bool>('openAccessibilitySettings');
    return result ?? false;
  }

  Future<bool> openNotificationAccessSettings() async {
    final result = await _channel.invokeMethod<bool>('openNotificationAccessSettings');
    return result ?? false;
  }
}
