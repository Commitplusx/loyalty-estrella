import 'package:flutter/material.dart';
import 'package:animate_do/animate_do.dart';

class TopToast {
  static OverlayEntry? _currentEntry;

  static void show(
    BuildContext context,
    String message, {
    Color backgroundColor = Colors.black87,
    IconData? icon,
    Duration duration = const Duration(seconds: 3),
  }) {
    // Remove current toast if exists
    _currentEntry?.remove();
    _currentEntry = null;

    final overlayState = Overlay.of(context);
    final entry = OverlayEntry(
      builder: (context) {
        return Positioned(
          top: MediaQuery.of(context).padding.top + 16,
          left: 16,
          right: 16,
          child: Material(
            color: Colors.transparent,
            child: FadeInDown(
              duration: const Duration(milliseconds: 300),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: backgroundColor,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: const [
                    BoxShadow(
                      color: Colors.black26,
                      blurRadius: 10,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    if (icon != null) ...[
                      Icon(icon, color: Colors.white, size: 24),
                      const SizedBox(width: 12),
                    ],
                    Expanded(
                      child: Text(
                        message,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );

    _currentEntry = entry;
    overlayState.insert(entry);

    Future.delayed(duration, () {
      if (_currentEntry == entry) {
        _currentEntry?.remove();
        _currentEntry = null;
      }
    });
  }
}
