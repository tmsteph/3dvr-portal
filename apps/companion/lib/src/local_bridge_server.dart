import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'platform_bridge.dart';

class LocalCompanionServer {
  LocalCompanionServer({required this.bridge});

  static const int defaultPort = 38473;
  final CompanionPlatformBridge bridge;

  HttpServer? _server;
  String token = _newToken();

  bool get isRunning => _server != null;
  Uri? get endpoint => _server == null
      ? null
      : Uri.parse('http://127.0.0.1:${_server!.port}');

  void useToken(String value) {
    if (_server != null) {
      throw StateError('Cannot change Companion token while server is running');
    }
    final candidate = value.trim();
    if (candidate.length < 32 ||
        candidate.length > 128 ||
        !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(candidate)) {
      throw ArgumentError('Invalid Companion bridge token');
    }
    token = candidate;
  }

  Future<void> start({int port = defaultPort}) async {
    if (_server != null) return;
    final server = await HttpServer.bind(
      InternetAddress.loopbackIPv4,
      port,
      shared: false,
    );
    _server = server;
    server.listen(_handle, onDone: () => _server = null);
  }

  Future<void> stop() async {
    final server = _server;
    _server = null;
    await server?.close(force: true);
  }

  Future<void> _handle(HttpRequest request) async {
    request.response.headers.contentType = ContentType.json;
    request.response.headers.set('Cache-Control', 'no-store');

    if (request.headers.value(HttpHeaders.authorizationHeader) != 'Bearer $token') {
      request.response.statusCode = HttpStatus.unauthorized;
      _json(request, {'ok': false, 'error': 'unauthorized'});
      return;
    }

    try {
      if (request.method == 'GET' && request.uri.path == '/v1/health') {
        _json(request, {
          'ok': true,
          'transport': 'loopback',
          'capabilities': [
            'device.status',
            'url.open',
            'app.open_known',
            'notification.metadata.read',
          ],
        });
        return;
      }

      if (request.method == 'GET' && request.uri.path == '/v1/device-status') {
        final status = await bridge.getDeviceStatus();
        _json(request, {'ok': true, 'status': status});
        return;
      }

      if (request.method == 'GET' && request.uri.path == '/v1/notification-metadata') {
        final notifications = await bridge.getNotificationMetadata();
        _json(request, {'ok': true, 'notifications': notifications});
        return;
      }

      if (request.method == 'POST' && request.uri.path == '/v1/open-url') {
        final decoded = await _readObject(request);
        final url = decoded?['url'];
        if (url is! String) {
          request.response.statusCode = HttpStatus.badRequest;
          _json(request, {'ok': false, 'error': 'url is required'});
          return;
        }
        final opened = await bridge.openUrl(url);
        _json(request, {'ok': opened});
        return;
      }

      if (request.method == 'POST' && request.uri.path == '/v1/open-app') {
        final decoded = await _readObject(request);
        final alias = decoded?['alias'];
        if (alias is! String) {
          request.response.statusCode = HttpStatus.badRequest;
          _json(request, {'ok': false, 'error': 'alias is required'});
          return;
        }
        final opened = await bridge.openKnownApp(alias);
        _json(request, {'ok': opened, 'alias': alias});
        return;
      }

      request.response.statusCode = HttpStatus.notFound;
      _json(request, {'ok': false, 'error': 'not found'});
    } catch (_) {
      request.response.statusCode = HttpStatus.internalServerError;
      _json(request, {'ok': false, 'error': 'request failed'});
    }
  }

  Future<Map<String, Object?>?> _readObject(HttpRequest request) async {
    final body = await utf8.decoder.bind(request).join();
    final decoded = jsonDecode(body);
    if (decoded is! Map) return null;
    return decoded.map((key, value) => MapEntry(key.toString(), value));
  }

  void _json(HttpRequest request, Map<String, Object?> value) {
    request.response.write(jsonEncode(value));
    request.response.close();
  }

  static String _newToken() {
    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }
}
