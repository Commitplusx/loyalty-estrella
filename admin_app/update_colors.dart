import 'dart:io';

void main() {
  var file = File('c:\\Users\\asus_\\Desktop\\loyalty-estrella\\admin_app\\lib\\screens\\client_detail_screen.dart');
  var content = file.readAsStringSync();
  
  // 1. Background gradient
  content = content.replaceAll(
    'colors: [Color(0xFF0F172A), Color(0xFF1E1B4B), Color(0xFF000000)]',
    'colors: [Color(0xFFF8FAFC), Color(0xFFF1F5F9), Color(0xFFE2E8F0)]'
  );
  
  // AppBar background
  content = content.replaceAll(
    'child: Container(color: Colors.black.withOpacity(0.2))',
    'child: Container(color: Colors.white.withOpacity(0.5))'
  );

  // VIP Wallet
  content = content.replaceAll(
    'colors: [Color(0xFF1F2937), Color(0xFF000000)]',
    'colors: [Color(0xFFFFFFFF), Color(0xFFF1F5F9)]'
  );

  // 2. Text colors and icon colors
  content = content.replaceAll('Colors.white', 'Colors.black87');
  content = content.replaceAll('Colors.white54', 'Colors.black54');
  content = content.replaceAll('Colors.white30', 'Colors.black38');
  content = content.replaceAll('Colors.white12', 'Colors.black12');
  content = content.replaceAll('Colors.white10', 'Colors.black12');
  
  // 3. Glassmorphism adjustments
  content = content.replaceAll('Colors.black87.withOpacity(0.05)', 'Colors.white.withOpacity(0.7)');
  content = content.replaceAll('Colors.black87.withOpacity(0.1)', 'Colors.black.withOpacity(0.05)');
  content = content.replaceAll('Colors.black87.withOpacity(0.2)', 'Colors.black.withOpacity(0.08)');
  
  // Restore QR code background
  content = content.replaceAll(
    'backgroundColor: Colors.black87,',
    'backgroundColor: Colors.white,'
  );
  content = content.replaceAll(
    'color: Colors.black87,\n                      borderRadius: BorderRadius.circular(16),',
    'color: Colors.white,\n                      borderRadius: BorderRadius.circular(16),'
  );
  
  // Also we want to ensure the text on the delete button snackbar keeps appropriate colors, but it's probably fine.
  
  file.writeAsStringSync(content);
}
