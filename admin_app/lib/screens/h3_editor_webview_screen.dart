import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
// If this isn't found, make sure you ran flutter pub get
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

class H3EditorWebViewScreen extends StatefulWidget {
  final String url;

  const H3EditorWebViewScreen({
    super.key,
    this.url = 'https://app-estrella.shop/h3-editor?mobile=true',
  });

  @override
  State<H3EditorWebViewScreen> createState() => _H3EditorWebViewScreenState();
}

class _H3EditorWebViewScreenState extends State<H3EditorWebViewScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();

    late final PlatformWebViewControllerCreationParams params;
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      params = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      );
    } else {
      params = const PlatformWebViewControllerCreationParams();
    }

    final WebViewController controller =
        WebViewController.fromPlatformCreationParams(params);

    controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (int progress) {
            if (progress == 100) {
              setState(() {
                _isLoading = false;
              });
            }
          },
          onPageStarted: (String url) {},
          onPageFinished: (String url) {
            setState(() {
              _isLoading = false;
            });
            // Inyectamos CSS para ocultar barras de scroll si las hubiera
            controller.runJavaScript('''
              document.body.style.overflow = "hidden";
              // Tratar de inyectar variables de ambiente si está usando el parámetro
              document.documentElement.style.setProperty('--webview-safe-top', 'env(safe-area-inset-top)');
            ''');
          },
          onWebResourceError: (WebResourceError error) {},
        ),
      )
      ..loadRequest(Uri.parse(widget.url));

    // Deshabilitar bounce / overscroll en Android si es posible
    if (controller.platform is AndroidWebViewController) {
      AndroidWebViewController.enableDebugging(false);
      (controller.platform as AndroidWebViewController)
          .setMediaPlaybackRequiresUserGesture(false);
    }

    _controller = controller;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Editor H3 (Web)'),
        elevation: 0,
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(),
            ),
        ],
      ),
    );
  }
}
