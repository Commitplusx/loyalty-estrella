const fs = require('fs');
const file = 'C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/driver_dashboard_view.dart';
let content = fs.readFileSync(file, 'utf8');

// Fix mangled line
content = content.replace('  bool _showSuccessAnimation = fal  Future<void> _updateOrderStatus(String pedidoId, String newStatus) async {riverIcon;', '');

// Insert missing methods
const missing = fs.readFileSync('missing_methods.dart', 'utf8');
const target = '  @override\n  Widget build(BuildContext context) {';
const target2 = '  @override\r\n  Widget build(BuildContext context) {';

if (content.includes(target)) {
    content = content.replace(target, missing + '\n\n' + target);
} else if (content.includes(target2)) {
    content = content.replace(target2, missing + '\r\n\r\n' + target2);
} else {
    console.error("Could not find the target build method.");
    process.exit(1);
}

fs.writeFileSync(file, content, 'utf8');
console.log("Success");
