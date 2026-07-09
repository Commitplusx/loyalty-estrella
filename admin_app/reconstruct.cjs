const fs = require('fs');

const file = 'C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/driver_dashboard_view.dart';
let content = fs.readFileSync(file, 'utf8');

// Remove BOM if present
content = content.replace(/^\uFEFF/, '');

// 1. Remove duplicate methods (initState to _updateDriverMarkerSilently)
// They start with "@override\n  void initState()" and end with "_polylines = updatedPolylines;\n    }\n  }"
const dupPattern = /  @override\r?\n  void initState\(\) \{[\s\S]*?_polylines = updatedPolylines;\r?\n    \}\r?\n  \}/g;
const matches = [...content.matchAll(dupPattern)];
if (matches.length > 1) {
    // Keep the first one, replace the second one
    content = content.substring(0, matches[1].index) + content.substring(matches[1].index + matches[1][0].length);
    console.log("Removed duplicate block.");
}

// 2. Remove the faulty block I inserted earlier.
// The faulty block starts with "Future<void> _loadStatusSilently() async {" and goes up to just before "@override\n  Widget build(BuildContext context) {"
const faultyBlockStart = "Future<void> _loadStatusSilently() async {";
const buildMethodIndex = content.lastIndexOf("  @override\r\n  Widget build(BuildContext context) {");
const buildMethodIndexLF = content.lastIndexOf("  @override\n  Widget build(BuildContext context) {");
const actualBuildIndex = Math.max(buildMethodIndex, buildMethodIndexLF);

const faultyIndex = content.indexOf(faultyBlockStart);
if (faultyIndex !== -1 && faultyIndex < actualBuildIndex) {
    content = content.substring(0, faultyIndex) + content.substring(actualBuildIndex);
    console.log("Removed faulty injected block.");
}

// 3. Extract the clean methods from true_missing_methods.dart
const trueMissing = fs.readFileSync('true_missing_methods.dart', 'utf8');
const loadStatusIndex = trueMissing.indexOf("Future<void> _loadStatusSilently() async {");
const cleanMethods = trueMissing.substring(loadStatusIndex);

// Fix the syntax error in the string interpolation just in case
let fixedCleanMethods = cleanMethods.replace(/\\\$\\{detalle\.fold/g, '\\$${detalle.fold');

// 4. Insert the clean methods right before the final build method
const newBuildIndex = content.lastIndexOf("  @override");
content = content.substring(0, newBuildIndex) + fixedCleanMethods + "\n\n" + content.substring(newBuildIndex);

// 5. Append _TopToastWidget class at the very end of the file if it doesn't exist
if (!content.includes('class _TopToastWidget')) {
    const toastClass = `

class _TopToastWidget extends StatefulWidget {
  final String message;
  final Color color;
  final IconData icon;
  final VoidCallback onDismiss;

  const _TopToastWidget({
    Key? key,
    required this.message,
    required this.color,
    required this.icon,
    required this.onDismiss,
  }) : super(key: key);

  @override
  State<_TopToastWidget> createState() => _TopToastWidgetState();
}

class _TopToastWidgetState extends State<_TopToastWidget> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 300));
    _slideAnimation = Tween<Offset>(begin: const Offset(0, -1.5), end: Offset.zero).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack)
    );
    _controller.forward();

    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) {
        _controller.reverse().then((_) => widget.onDismiss());
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 50,
      left: 16,
      right: 16,
      child: Material(
        color: Colors.transparent,
        child: SlideTransition(
          position: _slideAnimation,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: widget.color,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(color: widget.color.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))
              ],
            ),
            child: Row(
              children: [
                Icon(widget.icon, color: Colors.white),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    widget.message,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
`;
    content += toastClass;
    console.log("Added _TopToastWidget.");
}

fs.writeFileSync(file, content, 'utf8');
console.log("File reconstructed successfully.");
