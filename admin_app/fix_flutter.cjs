const fs = require('fs');

// --- 1. Fix driver_dashboard_view.dart ---
let dashPath = 'C:\\Users\\Kaleb\\Desktop\\loyalty-estrella\\admin_app\\lib\\screens\\driver_dashboard_view.dart';
let dashContent = fs.readFileSync(dashPath, 'utf-8');

const oldAlign = `        // Panel Inferior
        Align(
          alignment: Alignment.bottomCenter,
          child: nextStop != null 
             ? _buildActiveOrderCard(nextStop) 
             : _buildSearchingOrdersSheet(isDark),
        )`;

const newAlign = `        // Panel Inferior
        Align(
          alignment: Alignment.bottomCenter,
          child: allStops.isNotEmpty 
             ? SizedBox(
                 height: 195,
                 child: PageView.builder(
                   controller: PageController(viewportFraction: 0.95),
                   itemCount: allStops.length,
                   itemBuilder: (context, index) {
                     return _buildActiveOrderCard(allStops[index], index + 1, allStops.length);
                   },
                 ),
               )
             : _buildSearchingOrdersSheet(isDark),
        )`;

dashContent = dashContent.replace(oldAlign, newAlign);
fs.writeFileSync(dashPath, dashContent, 'utf-8');

// --- 2. Fix incoming_order_overlay.dart ---
let overlayPath = 'C:\\Users\\Kaleb\\Desktop\\loyalty-estrella\\admin_app\\lib\\widgets\\incoming_order_overlay.dart';
let overlayContent = fs.readFileSync(overlayPath, 'utf-8');

// The getter error means `_isStacked` is not defined inside the State class.
// Let's ensure it's defined at the class level.
if (!overlayContent.includes('bool _isStacked = false;')) {
    const oldClassStart = `class _IncomingOrderOverlayState extends ConsumerState<IncomingOrderOverlay> {
  GoogleMapController? _mapController;`;
    const newClassStart = `class _IncomingOrderOverlayState extends ConsumerState<IncomingOrderOverlay> {
  bool _isStacked = false;
  GoogleMapController? _mapController;`;
    overlayContent = overlayContent.replace(oldClassStart, newClassStart);
    fs.writeFileSync(overlayPath, overlayContent, 'utf-8');
}

console.log("Fixed Flutter code.");
