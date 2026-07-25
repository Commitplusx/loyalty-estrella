import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter/foundation.dart';

class LocalDatabase {
  static final LocalDatabase instance = LocalDatabase._init();
  static Database? _database;

  LocalDatabase._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('sync_queue.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path,
      version: 2, // Subimos versión si hubiera cambios, pero sqflite onUpgrade manejaría
      onCreate: _createDB,
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          // Aseguramos que la tabla exista
          await _createDB(db, newVersion);
        }
      }
    );
  }

  Future _createDB(Database db, int version) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sync_queue(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    ''');
  }

  /// Encola una mutación genérica
  Future<void> encolarMutacion({
    required String tabla,
    required String id,
    required Map<String, dynamic> payload,
  }) async {
    final db = await instance.database;
    await db.insert('sync_queue', {
      'table_name': tabla,
      'record_id': id,
      'payload': jsonEncode(payload),
      'created_at': DateTime.now().toIso8601String(),
    });
    debugPrint('[LocalDatabase] Mutación encolada para offline sync (Tabla: $tabla, ID: $id)');
  }

  /// Encola un cambio en el pedido (ej. estado y repartidor_id) asegurando que solo haya uno pendiente por pedido
  Future<void> enqueueOrderMutation(String pedidoId, Map<String, dynamic> updateData) async {
    final db = await instance.database;
    // 1. Borramos mutaciones previas de este pedido para que no se pisen
    await db.delete(
      'sync_queue', 
      where: 'table_name = ? AND record_id = ?', 
      whereArgs: ['pedidos', pedidoId]
    );
    
    // 2. Insertamos la mutación más reciente
    await encolarMutacion(
      tabla: 'pedidos',
      id: pedidoId,
      payload: updateData,
    );
  }

  /// Lee todas las mutaciones de pedidos pendientes (para inicializar el OptimisticUIProvider)
  Future<Map<String, String>> getPendingOrderStates() async {
    final db = await instance.database;
    final records = await db.query(
      'sync_queue',
      where: 'table_name = ?',
      whereArgs: ['pedidos'],
    );
    
    Map<String, String> pendingStates = {};
    for (final record in records) {
      final recordId = record['record_id'] as String;
      final payload = jsonDecode(record['payload'] as String) as Map<String, dynamic>;
      if (payload.containsKey('estado')) {
        pendingStates[recordId] = payload['estado'] as String;
      }
    }
    return pendingStates;
  }

  /// Drena la cola específica de pedidos e intenta enviar a Supabase
  Future<void> flushOrderMutations() async {
    final db = await instance.database;
    final records = await db.query(
      'sync_queue', 
      where: 'table_name = ?',
      whereArgs: ['pedidos'],
      orderBy: 'created_at ASC'
    );

    if (records.isEmpty) return;

    debugPrint('🚀 [LocalDatabase] Iniciando flush de ${records.length} pedidos (Worker Offline)...');

    for (final record in records) {
      try {
        final recordId = record['record_id'] as String;
        final payloadStr = record['payload'] as String;
        final payload = jsonDecode(payloadStr) as Map<String, dynamic>;

        // Intento de envío a Supabase
        await Supabase.instance.client
            .from('pedidos')
            .update(payload)
            .eq('id', recordId);

        // Si tuvo éxito, lo eliminamos de la cola
        await db.delete('sync_queue', where: 'id = ?', whereArgs: [record['id']]);
        debugPrint('✅ [LocalDatabase] Sync exitoso para pedido $recordId');
      } catch (e) {
        debugPrint('❌ [LocalDatabase] Sync falló para pedido ${record['record_id']}. Se reintentará luego. Error: $e');
        // Si hay error de red, rompemos para no gastar batería, se reintentará en el próximo reconnect
        break; 
      }
    }
  }

  /// (Legacy) Drena la cola genérica (útil si hay otras mutaciones)
  Future<void> syncPendingMutations() async {
    final db = await instance.database;
    final records = await db.query('sync_queue', orderBy: 'created_at ASC');

    if (records.isEmpty) return;
    for (final record in records) {
      if (record['table_name'] == 'pedidos') continue; // Los pedidos se manejan en flushOrderMutations
      
      try {
        final table = record['table_name'] as String;
        final recordId = record['record_id'] as String;
        final payload = jsonDecode(record['payload'] as String) as Map<String, dynamic>;

        await Supabase.instance.client.from(table).update(payload).eq('id', recordId);
        await db.delete('sync_queue', where: 'id = ?', whereArgs: [record['id']]);
      } catch (e) {
        break; 
      }
    }
  }
}
