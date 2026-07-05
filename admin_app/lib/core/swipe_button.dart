import 'package:flutter/material.dart';

class SwipeButton extends StatefulWidget {
  final String text;
  final VoidCallback onSwipe;
  final Color activeColor;
  final Color baseColor;
  final IconData icon;

  const SwipeButton({
    super.key,
    required this.text,
    required this.onSwipe,
    this.activeColor = Colors.green,
    this.baseColor = Colors.black12,
    this.icon = Icons.chevron_right_rounded,
  });

  @override
  State<SwipeButton> createState() => _SwipeButtonState();
}

class _SwipeButtonState extends State<SwipeButton> with SingleTickerProviderStateMixin {
  double _dragPosition = 0.0;
  bool _confirmed = false;
  final double _buttonWidth = 64.0;
  double _containerWidth = 0.0;

  bool _isDragging = false;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        _containerWidth = constraints.maxWidth;
        final maxDrag = _containerWidth - _buttonWidth;

        return Container(
          height: 64,
          decoration: BoxDecoration(
            color: widget.baseColor,
            borderRadius: BorderRadius.circular(32),
            border: Border.all(color: widget.activeColor.withOpacity(0.3), width: 1),
          ),
          child: Stack(
            children: [
              // Texto de fondo
              Center(
                child: Text(
                  _confirmed ? "¡Confirmado!" : widget.text,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: _confirmed ? widget.activeColor : Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              // Track de progreso verde
              if (_dragPosition > 0)
                AnimatedPositioned(
                  duration: _isDragging ? Duration.zero : const Duration(milliseconds: 300),
                  curve: Curves.easeOut,
                  left: 0,
                  top: 0,
                  bottom: 0,
                  child: Container(
                    width: _dragPosition + _buttonWidth / 2,
                    decoration: BoxDecoration(
                      color: widget.activeColor.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(32),
                    ),
                  ),
                ),
              // Botón deslizable
              AnimatedPositioned(
                duration: _isDragging ? Duration.zero : const Duration(milliseconds: 300),
                curve: Curves.easeOutBack,
                left: _dragPosition,
                top: 2,
                bottom: 2,
                child: GestureDetector(
                  onHorizontalDragStart: (details) {
                    if (_confirmed) return;
                    setState(() => _isDragging = true);
                  },
                  onHorizontalDragUpdate: (details) {
                    if (_confirmed) return;
                    setState(() {
                      _dragPosition += details.delta.dx;
                      if (_dragPosition < 0) _dragPosition = 0;
                      if (_dragPosition > maxDrag) _dragPosition = maxDrag;
                    });
                  },
                  onHorizontalDragCancel: () {
                    if (_confirmed) return;
                    setState(() {
                      _isDragging = false;
                      _dragPosition = 0;
                    });
                  },
                  onHorizontalDragEnd: (details) {
                    if (_confirmed) return;
                    setState(() => _isDragging = false);
                    if (_dragPosition > maxDrag * 0.85) {
                      setState(() {
                        _dragPosition = maxDrag;
                        _confirmed = true;
                      });
                      widget.onSwipe();
                    } else {
                      setState(() {
                        _dragPosition = 0;
                      });
                    }
                  },
                  child: Container(
                    width: _buttonWidth,
                    decoration: BoxDecoration(
                      color: widget.activeColor,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: widget.activeColor.withOpacity(0.4),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Center(
                      child: Icon(
                        _confirmed ? Icons.check_rounded : widget.icon,
                        color: Colors.white,
                        size: 32,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
