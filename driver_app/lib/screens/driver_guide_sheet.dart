import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:animate_do/animate_do.dart';
import '../core/ui_helpers.dart';

class DriverGuideSheet extends StatefulWidget {
  const DriverGuideSheet({super.key});

  static Future<void> show(BuildContext context) {
    HapticFeedback.lightImpact();
    return PremiumBottomSheet.showCustom(
      context,
      title: 'Guía Rápida',
      child: const DriverGuideSheet(),
    );
  }

  @override
  State<DriverGuideSheet> createState() => _DriverGuideSheetState();
}

class _DriverGuideSheetState extends State<DriverGuideSheet> {
  int _expandedIndex = -1;

  final List<Map<String, dynamic>> _faqs = [
    {
      'q': '¿Qué hago si no me caen pedidos?',
      'a': 'Asegúrate de que el switch "Online" en la esquina superior derecha esté activado. También revisa que tengas buena conexión a internet y el GPS encendido.',
      'icon': Icons.radar_rounded,
      'color': Colors.green,
    },
    {
      'q': '¿Cómo marco un pedido completado?',
      'a': 'En el mapa o en el Itinerario, toca la parada del cliente y desliza el botón inferior de "Deslizar para Entregar".',
      'icon': Icons.check_circle_outline_rounded,
      'color': Colors.blue,
    },
    {
      'q': '¿Qué significa el rayito (⚡)?',
      'a': 'Significa que es un pedido urgente. El cliente lleva más de 25 minutos esperando. ¡Prioriza esa entrega!',
      'icon': Icons.bolt_rounded,
      'color': Colors.amber.shade700,
    },
    {
      'q': 'Se me fue el internet en medio viaje',
      'a': 'No te preocupes. La app guarda tu ruta actual en caché. Sigue hacia tu destino y la app se sincronizará sola cuando vuelva el internet.',
      'icon': Icons.wifi_off_rounded,
      'color': Colors.redAccent,
    },
    {
      'q': 'El restaurante dice que aún no está listo',
      'a': 'Si llegas al restaurante y el pedido no está listo, espera pacientemente. El cliente sabrá que ya estás ahí esperando su comida.',
      'icon': Icons.storefront_rounded,
      'color': Colors.purple,
    },
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subtitleColor = isDark ? Colors.white60 : Colors.black54;
    final cardBg = isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9);

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _faqs.length,
      itemBuilder: (context, index) {
        final faq = _faqs[index];
        final isExpanded = _expandedIndex == index;

        return FadeInUp(
          delay: Duration(milliseconds: index * 50),
          duration: const Duration(milliseconds: 300),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: isExpanded ? faq['color'].withOpacity(0.1) : cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isExpanded ? faq['color'].withOpacity(0.5) : Colors.transparent,
                width: 1,
              ),
            ),
            child: Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                onExpansionChanged: (expanded) {
                  HapticFeedback.selectionClick();
                  setState(() => _expandedIndex = expanded ? index : -1);
                },
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: faq['color'].withOpacity(0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(faq['icon'], color: faq['color']),
                ),
                title: Text(
                  faq['q'],
                  style: TextStyle(
                    fontWeight: isExpanded ? FontWeight.w800 : FontWeight.w600,
                    color: textColor,
                    fontSize: 15,
                  ),
                ),
                children: [
                  Padding(
                    padding: const EdgeInsets.only(left: 64, right: 16, bottom: 16),
                    child: Text(
                      faq['a'],
                      style: TextStyle(color: subtitleColor, height: 1.5),
                    ),
                  )
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
