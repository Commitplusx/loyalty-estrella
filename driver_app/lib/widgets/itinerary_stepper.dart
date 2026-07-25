import 'package:flutter/material.dart';

class ItineraryStepper extends StatelessWidget {
  final List<Map<String, dynamic>> paradas;
  final int currentIndex;
  final bool isDark;

  const ItineraryStepper({
    Key? key,
    required this.paradas,
    required this.currentIndex,
    required this.isDark,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (paradas.isEmpty) return const SizedBox.shrink();

    final etaTotal = paradas
        .where((s) => s['completado'] != true)
        .fold<int>(0, (sum, s) => sum + ((s['etaMin'] as num?)?.toInt() ?? 0));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header ETA
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.schedule_rounded, size: 16, color: isDark ? Colors.white70 : Colors.black87),
                  const SizedBox(width: 6),
                  Text(
                    '$etaTotal min',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : Colors.black,
                      letterSpacing: -0.3,
                    ),
                  ),
                ],
              ),
            ),
            const Spacer(),
            Text(
              '${paradas.length} parada${paradas.length != 1 ? 's' : ''}',
              style: TextStyle(
                fontSize: 13,
                color: isDark ? Colors.white54 : Colors.black54,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        
        // Timeline
        Column(
          children: List.generate(paradas.length, (i) {
            return _buildTimelineRow(context, paradas[i], i, i == paradas.length - 1);
          }),
        ),
      ],
    );
  }

  Widget _buildTimelineRow(BuildContext context, Map<String, dynamic> stop, int index, bool isLast) {
    final bool isCompleted = stop['completado'] == true || index < currentIndex;
    final bool isCurrent = index == currentIndex && !isCompleted;
    final bool isPickup = stop['isPickup'] as bool? ?? true;
    final bool isUrgente = stop['urgente'] as bool? ?? false;
    final int etaMin = (stop['etaMin'] as num?)?.toInt() ?? 0;
    
    final Color onSurface = isDark ? Colors.white : Colors.black;
    final Color onSurfaceMuted = isDark ? Colors.white54 : Colors.black54;

    // Colores
    final Color accentColor = isCompleted
        ? const Color(0xFF10B981) // Verde
        : isPickup
            ? (isDark ? Colors.white : Colors.black) // Origen: Negro/Blanco
            : const Color(0xFF3B82F6); // Destino: Azul Uber
            
    final String title = stop['title'] as String? ?? '';
    final String subtitle = stop['subtitle'] as String? ?? '';

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Columna de la línea y el punto ──
          SizedBox(
            width: 32,
            child: Stack(
              alignment: Alignment.topCenter,
              children: [
                // Línea conectora (se dibuja si no es el último)
                if (!isLast)
                  Positioned(
                    top: 14,
                    bottom: -14, // Sobresale hacia abajo para conectar con el siguiente
                    child: Container(
                      width: 2.5,
                      color: isCompleted 
                          ? const Color(0xFF10B981) 
                          : (isDark ? Colors.white12 : Colors.black12),
                    ),
                  ),
                // El punto / icono
                Positioned(
                  top: 0,
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: isCompleted 
                          ? const Color(0xFF10B981) 
                          : (isCurrent ? accentColor : (isDark ? const Color(0xFF334155) : const Color(0xFFE2E8F0))),
                      shape: isPickup ? BoxShape.circle : BoxShape.rectangle, // Cuadrado para entrega, círculo para recogida
                      borderRadius: isPickup ? null : BorderRadius.circular(6),
                      boxShadow: isCurrent ? [
                        BoxShadow(color: accentColor.withOpacity(0.3), blurRadius: 8, spreadRadius: 2)
                      ] : null,
                    ),
                    child: Center(
                      child: isCompleted
                          ? const Icon(Icons.check, size: 14, color: Colors.white)
                          : isPickup
                              ? Icon(Icons.storefront_rounded, size: 13, color: isCurrent ? (isDark ? Colors.black : Colors.white) : onSurfaceMuted)
                              : Icon(Icons.person_rounded, size: 13, color: isCurrent ? Colors.white : onSurfaceMuted),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // ── Contenido de texto ──
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: TextStyle(
                            fontSize: isCurrent ? 17 : 16,
                            fontWeight: isCurrent ? FontWeight.w900 : FontWeight.w600,
                            color: isCompleted ? onSurfaceMuted : onSurface,
                            letterSpacing: -0.3,
                            decoration: isCompleted ? TextDecoration.lineThrough : null,
                            decorationColor: onSurfaceMuted,
                          ),
                        ),
                      ),
                      if (!isCompleted && etaMin > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: isCurrent ? accentColor.withOpacity(0.1) : Colors.transparent,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '$etaMin min',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: isCurrent ? FontWeight.bold : FontWeight.w500,
                              color: isCurrent ? accentColor : onSurfaceMuted,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 14,
                      color: isCompleted ? onSurfaceMuted.withOpacity(0.5) : onSurfaceMuted,
                      fontWeight: FontWeight.w400,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (isUrgente && !isCompleted)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(
                        children: [
                          const Icon(Icons.bolt, size: 14, color: Color(0xFFEF4444)),
                          const SizedBox(width: 4),
                          Text(
                            'Prioritario',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: const Color(0xFFEF4444)),
                          )
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
