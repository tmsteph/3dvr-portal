import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'platform_bridge.dart';

class LocalCompanionServer {
  LocalCompanionServer({required this.bridge});

  static const int defaultPort = 38473;
  final CompanionPlatformBridge bridge;

  HttpServer? _server;
  final String token = _newToken();

  bool get isRunning => _server != null;
  Uri? get endpoint => _server == null
      ? null
      : Uri.parse('http://127.0.0.1:${_server!.port}');

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
          'capabilities': ['device.status', 'url.open'],
        });
        return;
      }

      if (request.method == 'GET' && request.uri.path == '/v1/device-status') {
        final status = await bridge.getDeviceStatus();
        _json(request, {'ok': true, 'status': status});
        return;
      }

      if (request.method == 'POST' && request.uri.path == '/v1/open-url') {
        final body = await utf8.decoder.bind(request).join();
        final decoded = jsonDecode(body);
        if (decoded is! Map || decoded['url'] is! String) {
          request.response.statusCode = HttpStatus.badRequest;
          _json(request, {'ok': false, 'error': 'url is required'});
          return;
        }
        final opened = await bridge.openUrl(decoded['url'] as String);
        _json(request, {'ok': opened});
        return;
      }

      request.response.statusCode = HttpStatus.notFound;
      _json(request, {'ok': false, 'error': 'not found'});
    } catch (_) {
      request.response.statusCode = HttpStatus.internalServerError;
      _json(request, {'ok': false, 'error': 'request failed'});
    }
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
