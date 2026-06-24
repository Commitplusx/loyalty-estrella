import 'dart:io';

void main() {
  var file = File('c:\\Users\\asus_\\Desktop\\loyalty-estrella\\admin_app\\lib\\screens\\client_detail_screen.dart');
  var content = file.readAsStringSync();
  
  content = content.replaceAll('Colors.black8754', 'Colors.black54');
  content = content.replaceAll('Colors.black8730', 'Colors.black38');
  content = content.replaceAll('Colors.black8712', 'Colors.black12');
  content = content.replaceAll('Colors.black8710', 'Colors.black12');
  
  file.writeAsStringSync(content);
}
