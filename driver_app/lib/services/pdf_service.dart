import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:intl/intl.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';
import '../core/supabase_config.dart';

final pdfServiceProvider = Provider((ref) => PdfService());

class PdfService {
  Future<void> generateAndPrintCorteCaja() async {
    try {
      final now = DateTime.now();
      final startIso = DateTime(now.year, now.month, now.day).toIso8601String();
      final startDate = startIso.split('T')[0];
      
      // 1. Obtener Ingresos Reales (Suma de montos cobrados en servicios)
      final envios = await supabase
          .from('servicios_repartidor')
          .select('monto')
          .eq('turno_fecha', startDate)
          .neq('estado', 'cancelado');
          
      // 2. Obtener Gastos Aprobados de Hoy
      final gastos = await supabase
          .from('gastos_motos')
          .select('monto, concepto')
          .gte('fecha', startIso)
          .eq('estado', 'aprobado');

      double totalIngresos = 0;
      for (var row in envios) {
        totalIngresos += (row['monto'] as num?)?.toDouble() ?? 0.0;
      }
      
      double totalGastos = 0;
      for (var row in gastos) {
        totalGastos += (row['monto'] as num?)?.toDouble() ?? 0.0;
      }
      
      double utilidad = totalIngresos - totalGastos;

      // 3. Construir PDF
      final pdf = pw.Document();
      
      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.roll80,
          build: (pw.Context context) {
            return pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                pw.Text('ESTRELLA DELIVERY', style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
                pw.SizedBox(height: 5),
                pw.Text('Corte de Caja Diario'),
                pw.Text(DateFormat('dd/MM/yyyy HH:mm').format(now)),
                pw.Divider(borderStyle: pw.BorderStyle.dashed),
                
                // Resumen
                pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
                  pw.Text('Servicios Cobrados:'),
                  pw.Text('${envios.length}'),
                ]),
                pw.SizedBox(height: 5),
                pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
                  pw.Text('INGRESOS BRUTOS:', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                  pw.Text('\$${totalIngresos.toStringAsFixed(2)}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                ]),
                
                pw.Divider(borderStyle: pw.BorderStyle.dashed),
                pw.Text('GASTOS', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                pw.SizedBox(height: 5),
                ...gastos.map((g) => pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  children: [
                    pw.Text('- ${g['concepto']}', style: const pw.TextStyle(fontSize: 10)),
                    pw.Text('-\$${(g['monto'] as num).toStringAsFixed(2)}', style: const pw.TextStyle(fontSize: 10)),
                  ]
                )),
                
                pw.Divider(borderStyle: pw.BorderStyle.dashed),
                pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
                  pw.Text('TOTAL GASTOS:', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                  pw.Text('-\$${totalGastos.toStringAsFixed(2)}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                ]),
                
                pw.Divider(borderStyle: pw.BorderStyle.solid),
                pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
                  pw.Text('UTILIDAD NETA:', style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold)),
                  pw.Text('\$${utilidad.toStringAsFixed(2)}', style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold)),
                ]),
                
                pw.SizedBox(height: 20),
                pw.Text('*** FIN DEL REPORTE ***', style: const pw.TextStyle(fontSize: 10)),
              ],
            );
          },
        ),
      );

      // 4. Mostrar o Imprimir Preview
      await Printing.layoutPdf(
        onLayout: (PdfPageFormat format) async => pdf.save(),
        name: 'corte_${DateFormat('yyyyMMdd').format(now)}.pdf'
      );

    } catch (e) {
      debugPrint('Error en PDF: $e');
      rethrow;
    }
  }
}
