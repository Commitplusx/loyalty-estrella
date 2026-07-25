import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:animate_do/animate_do.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';

class DriverOnboardingScreen extends StatefulWidget {
  const DriverOnboardingScreen({super.key});

  @override
  State<DriverOnboardingScreen> createState() => _DriverOnboardingScreenState();
}

class _DriverOnboardingScreenState extends State<DriverOnboardingScreen> {
  final PageController _pageCtrl = PageController();
  int _currentPage = 0;

  final List<Map<String, dynamic>> _pages = [
    {
      'title': 'El Radar Inteligente',
      'desc': 'Conéctate y la app buscará automáticamente los pedidos más cercanos a ti. Mantente en línea para recibir más viajes.',
      'icon': Icons.radar_rounded,
      'color': const Color(0xFF10B981), // Verde
    },
    {
      'title': 'Tu Itinerario de Ruta',
      'desc': 'No te compliques. El itinerario te dice exactamente a dónde ir y qué hacer. Solo sigue la línea verde.',
      'icon': Icons.map_rounded,
      'color': const Color(0xFF3B82F6), // Azul
    },
    {
      'title': 'Modo Offline',
      'desc': '¿Se te fue el internet? No hay problema. La app guarda tu ruta en caché para que sigas trabajando.',
      'icon': Icons.wifi_off_rounded,
      'color': const Color(0xFFFF6B35), // Naranja Estrella
    },
    {
      'title': 'Asistencia Contextual',
      'desc': 'La app te guiará paso a paso. Si nota que necesitas ayuda, te mostrará sutiles consejos 💡.',
      'icon': Icons.lightbulb_rounded,
      'color': const Color(0xFF8B5CF6), // Morado
    },
  ];

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  Future<void> _finishOnboarding() async {
    HapticFeedback.heavyImpact();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('has_seen_onboarding', true);
    if (mounted) context.go('/dashboard');
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC);
    final textCol = isDark ? Colors.white : Colors.black87;

    return Scaffold(
      backgroundColor: bg,
      body: Stack(
        children: [
          // Background abstract shapes
          Positioned(
            top: -100, right: -100,
            child: FadeInDown(
              duration: const Duration(seconds: 1),
              child: Container(
                width: 300, height: 300,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _pages[_currentPage]['color'].withOpacity(0.1),
                ),
              ),
            ),
          ),
          
          SafeArea(
            child: Column(
              children: [
                Align(
                  alignment: Alignment.topRight,
                  child: TextButton(
                    onPressed: _finishOnboarding,
                    child: Text('Saltar', style: TextStyle(color: isDark ? Colors.white54 : Colors.black54)),
                  ),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: _pageCtrl,
                    onPageChanged: (idx) {
                      setState(() => _currentPage = idx);
                      HapticFeedback.selectionClick();
                    },
                    itemCount: _pages.length,
                    itemBuilder: (context, index) {
                      final page = _pages[index];
                      return Padding(
                        padding: const EdgeInsets.all(40),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            ZoomIn(
                              key: ValueKey(index),
                              duration: const Duration(milliseconds: 600),
                              child: Container(
                                padding: const EdgeInsets.all(32),
                                decoration: BoxDecoration(
                                  color: page['color'].withOpacity(0.15),
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                  page['icon'],
                                  size: 100,
                                  color: page['color'],
                                ),
                              ),
                            ),
                            const SizedBox(height: 60),
                            FadeInUp(
                              key: ValueKey('title_$index'),
                              delay: const Duration(milliseconds: 200),
                              child: Text(
                                page['title'],
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w900,
                                  color: textCol,
                                  height: 1.1,
                                ),
                              ),
                            ),
                            const SizedBox(height: 20),
                            FadeInUp(
                              key: ValueKey('desc_$index'),
                              delay: const Duration(milliseconds: 300),
                              child: Text(
                                page['desc'],
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 16,
                                  color: isDark ? Colors.white60 : Colors.black54,
                                  height: 1.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
                
                // Bottom section (Indicators + Next Button)
                Padding(
                  padding: const EdgeInsets.all(40),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Dots
                      Row(
                        children: List.generate(_pages.length, (index) {
                          return AnimatedContainer(
                            duration: const Duration(milliseconds: 300),
                            margin: const EdgeInsets.only(right: 8),
                            height: 8,
                            width: _currentPage == index ? 24 : 8,
                            decoration: BoxDecoration(
                              color: _currentPage == index ? _pages[_currentPage]['color'] : Colors.grey.withOpacity(0.3),
                              borderRadius: BorderRadius.circular(4),
                            ),
                          );
                        }),
                      ),
                      
                      // Next / Start Button
                      InkWell(
                        onTap: () {
                          if (_currentPage < _pages.length - 1) {
                            _pageCtrl.nextPage(duration: const Duration(milliseconds: 500), curve: Curves.easeOutCubic);
                          } else {
                            _finishOnboarding();
                          }
                        },
                        borderRadius: BorderRadius.circular(30),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 300),
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                          decoration: BoxDecoration(
                            color: _pages[_currentPage]['color'],
                            borderRadius: BorderRadius.circular(30),
                            boxShadow: [
                              BoxShadow(
                                color: _pages[_currentPage]['color'].withOpacity(0.4),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              )
                            ]
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _currentPage == _pages.length - 1 ? '¡Vamos!' : 'Siguiente',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                              ),
                              const SizedBox(width: 8),
                              const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 20),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
