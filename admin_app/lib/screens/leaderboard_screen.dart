import 'package:animate_do/animate_do.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'repartidores_screen.dart';

class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leaderAsync = ref.watch(leaderboardProvider);
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ranking de Estrellas'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(leaderboardProvider),
          ),
        ],
      ),
      body: leaderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (players) {
          if (players.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.emoji_events_outlined, size: 64, color: onSurface.withValues(alpha: 0.3)),
                  const SizedBox(height: 16),
                  Text('Aún no hay datos para el ranking', style: TextStyle(color: onSurface.withValues(alpha: 0.5))),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: players.length,
            itemBuilder: (ctx, i) {
              final p = players[i];
              final isTop3 = i < 3;
              final Color medalColor = i == 0 
                  ? Colors.amber 
                  : i == 1 
                      ? const Color(0xFFC0C0C0) 
                      : i == 2 
                          ? const Color(0xFFCD7F32) 
                          : Colors.transparent;

              return FadeInUp(
                delay: Duration(milliseconds: i * 100),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Theme.of(context).cardColor,
                    borderRadius: BorderRadius.circular(20),
                    border: isTop3 
                        ? Border.all(color: medalColor.withValues(alpha: 0.5), width: 2)
                        : Border.all(color: onSurface.withValues(alpha: 0.05)),
                    boxShadow: isTop3 
                        ? [BoxShadow(color: medalColor.withValues(alpha: 0.1), blurRadius: 10, spreadRadius: 2)]
                        : null,
                  ),
                  child: Row(
                    children: [
                      // Posición
                      SizedBox(
                        width: 40,
                        child: Text(
                          '${i + 1}',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: isTop3 ? medalColor : onSurface.withValues(alpha: 0.3),
                          ),
                        ),
                      ),
                      // Avatar
                      CircleAvatar(
                        backgroundColor: (isTop3 ? medalColor : Colors.grey).withValues(alpha: 0.1),
                        radius: 25,
                        child: Text(
                          (p['alias'] ?? p['nombre'] ?? '?').substring(0, 1).toUpperCase(),
                          style: TextStyle(color: isTop3 ? medalColor : Colors.grey, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 16),
                      // Info
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p['alias'] ?? p['nombre'] ?? '',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            Row(
                              children: [
                                const Icon(Icons.star_rounded, color: Colors.amber, size: 14),
                                const SizedBox(width: 4),
                                Text(
                                  (p['rating_estrellas'] as num).toStringAsFixed(1),
                                  style: TextStyle(fontSize: 12, color: onSurface.withValues(alpha: 0.6), fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  '${p['completados']} envíos',
                                  style: TextStyle(fontSize: 12, color: onSurface.withValues(alpha: 0.4)),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      // Total
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('\$${(p['total_generado'] as num).toStringAsFixed(0)}',
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: Color(0xFFFF6B35))),
                          Text('${(p['efectividad'] as num).toStringAsFixed(0)}% efect.',
                              style: TextStyle(fontSize: 10, color: Colors.green.shade700, fontWeight: FontWeight.bold)),
                        ],
                      ),

                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
