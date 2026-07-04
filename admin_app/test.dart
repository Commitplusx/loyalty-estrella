import 'dart:convert';
import 'package:http/http.dart' as http;

void main() async {
  final url = 'https://jdrrkpvodnqoljycixbg.supabase.co/rest/v1/pedidos?select=*&limit=5';
  final key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ';

  final res = await http.get(Uri.parse(url), headers: {
    'apikey': key,
    'Authorization': 'Bearer $key',
  });

  print(res.body);
}
