import 'dart:math';

class DriverPresenceContext {
  const DriverPresenceContext(
      {required this.profileId,
      required this.actorId,
      required this.deviceId,
      required this.accessToken,
      required this.online});
  final String profileId;
  final String actorId;
  final String? deviceId;
  final String accessToken;
  final bool online;
  bool sameIdentity(DriverPresenceContext other) =>
      profileId == other.profileId &&
      actorId == other.actorId &&
      deviceId == other.deviceId;
}

class DriverGpsSample {
  const DriverGpsSample(
      {required this.lat,
      required this.lng,
      required this.measuredAt,
      required this.accuracyMeters,
      this.mocked = false});
  final double lat;
  final double lng;
  final DateTime measuredAt;
  final double accuracyMeters;
  final bool mocked;
  bool validAt(DateTime now) =>
      !mocked &&
      lat.isFinite &&
      lng.isFinite &&
      lat.abs() <= 90 &&
      lng.abs() <= 180 &&
      accuracyMeters.isFinite &&
      accuracyMeters >= 0 &&
      accuracyMeters <= 100 &&
      !measuredAt.isBefore(now.subtract(const Duration(seconds: 120))) &&
      !measuredAt.isAfter(now.add(const Duration(seconds: 15)));
}

class DriverPresenceReport {
  const DriverPresenceReport(
      {required this.sessionId,
      required this.sequence,
      required this.sentAt,
      this.gps,
      this.battery});
  final String sessionId;
  final int sequence;
  final DateTime sentAt;
  final DriverGpsSample? gps;
  final int? battery;
  Map<String, Object?> arguments(String profileId) => {
        'p_profile_id': profileId,
        'p_session_id': sessionId,
        'p_sequence': sequence,
        'p_sent_at': sentAt.toUtc().toIso8601String(),
        'p_lat': gps?.lat,
        'p_lng': gps?.lng,
        'p_gps_at': gps?.measuredAt.toUtc().toIso8601String(),
        'p_accuracy_m': gps?.accuracyMeters,
        'p_battery': battery,
      };
}

class PresenceReceipt {
  const PresenceReceipt(this.accepted, {this.resetSession = false});
  final bool accepted;
  final bool resetSession;
  static PresenceReceipt parse(Object? value) {
    if (value is! Map<String, Object?> || value['accepted'] is! bool) {
      throw const FormatException('Invalid presence receipt');
    }
    return PresenceReceipt(value['accepted'] == true,
        resetSession: value['reason'] == 'session');
  }
}

abstract interface class DriverPresencePort {
  Future<DriverPresenceContext?> context();
  Future<DriverGpsSample?> location();
  Future<int?> battery();
  Future<bool> begin(DriverPresenceContext context, String sessionId);
  Future<PresenceReceipt> report(
      DriverPresenceContext context, DriverPresenceReport report);
}

String newPresenceSessionId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final h = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

/// Serial, bounded reporting in the existing foreground service. A heartbeat
/// never fabricates a new GPS timestamp or changes the driver's Online intent.
class DriverPresenceCoordinator {
  DriverPresenceCoordinator(this.port,
      {DateTime Function()? clock,
      String Function()? sessionId,
      this.diagnostic})
      : clock = clock ?? DateTime.now,
        sessionId = sessionId ?? newPresenceSessionId;
  final DriverPresencePort port;
  final DateTime Function() clock;
  final String Function() sessionId;
  final void Function(String code)? diagnostic;
  DriverPresenceContext? _identity;
  String? _session;
  bool _begun = false;
  bool _busy = false;
  bool _stopped = false;
  int _sequence = 0;
  int _failures = 0;
  String? _lastDiagnostic;
  DateTime? _next;

  void stop() {
    _stopped = true;
  }

  void _note(String code) {
    if (_lastDiagnostic == code) return;
    _lastDiagnostic = code;
    diagnostic?.call(code);
  }

  Future<void> tick() async {
    final now = clock();
    if (_stopped || _busy || (_next != null && now.isBefore(_next!))) return;
    _busy = true;
    _next = now.add(const Duration(seconds: 15));
    try {
      final initial = await port.context();
      if (_stopped || initial == null || !initial.online) {
        _note('presence_offline');
        return;
      }
      if (_identity == null || !_identity!.sameIdentity(initial)) {
        _identity = initial;
        _session = sessionId();
        _sequence = 0;
        _begun = false;
      }
      if (!_begun) {
        _begun = await port.begin(initial, _session!);
        if (!_begun) {
          _note('presence_session_rejected');
          return;
        }
      }
      DriverGpsSample? sample;
      int? battery;
      try {
        sample = await port.location();
      } catch (_) {
        _note('presence_gps_unavailable');
      }
      try {
        battery = await port.battery();
      } catch (_) {
        _note('presence_battery_unavailable');
      }
      final current = await port.context();
      if (_stopped ||
          current == null ||
          !current.online ||
          !initial.sameIdentity(current)) {
        _note('presence_context_changed');
        return;
      }
      final sentAt = clock();
      if (sample != null && !sample.validAt(sentAt)) sample = null;
      if (battery != null && (battery < 0 || battery > 100)) battery = null;
      final receipt = await port.report(
          current,
          DriverPresenceReport(
              sessionId: _session!,
              sequence: ++_sequence,
              sentAt: sentAt,
              gps: sample,
              battery: battery));
      if (receipt.resetSession) {
        _session = sessionId();
        _sequence = 0;
        _begun = false;
      }
      if (receipt.accepted) {
        _failures = 0;
        _note(sample == null
            ? 'presence_without_fresh_gps'
            : 'presence_reported');
      } else {
        _note('presence_report_rejected');
      }
    } catch (_) {
      _failures = min(_failures + 1, 3);
      _next = clock().add(Duration(seconds: 15 * (1 << _failures)));
      _note('presence_transport_failed');
    } finally {
      _busy = false;
    }
  }
}
