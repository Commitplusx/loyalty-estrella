import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:estrella_admin/services/driver_presence.dart';

const profile = '00000000-0000-4000-8000-000000000001';
const actor = '00000000-0000-4000-8000-000000000002';
const device = '00000000-0000-4000-8000-000000000003';
const session = '00000000-0000-4000-8000-000000000004';
const online = DriverPresenceContext(
    profileId: profile,
    actorId: actor,
    deviceId: device,
    accessToken: 'synthetic-token',
    online: true);
final start = DateTime.utc(2026, 10, 25, 15);

class FakePresencePort implements DriverPresencePort {
  DriverPresenceContext? current = online;
  int contextCalls = 0;
  int beginCalls = 0;
  bool beginResult = true;
  bool throwReport = false;
  int? batteryValue = 80;
  Future<DriverGpsSample?> Function()? readLocation;
  PresenceReceipt receipt = const PresenceReceipt(true);
  final reports = <DriverPresenceReport>[];
  @override
  Future<DriverPresenceContext?> context() async {
    contextCalls++;
    return current;
  }

  @override
  Future<bool> begin(DriverPresenceContext context, String sessionId) async {
    beginCalls++;
    return beginResult;
  }

  @override
  Future<DriverGpsSample?> location() async {
    final read = readLocation;
    if (read != null) return read();
    return DriverGpsSample(
        lat: 16, lng: -92, measuredAt: start, accuracyMeters: 10);
  }

  @override
  Future<int?> battery() async => batteryValue;
  @override
  Future<PresenceReceipt> report(
      DriverPresenceContext context, DriverPresenceReport report) async {
    reports.add(report);
    if (throwReport) throw StateError('Synthetic transport failure');
    return receipt;
  }
}

void main() {
  test(
      'periodic reports work while stationary and preserve the measured timestamp',
      () async {
    var now = start;
    final port = FakePresencePort();
    final coordinator = DriverPresenceCoordinator(port,
        clock: () => now, sessionId: () => session);
    await coordinator.tick();
    now = now.add(const Duration(seconds: 15));
    await coordinator.tick();
    expect(port.beginCalls, 1);
    expect(port.reports.map((r) => r.sequence), [1, 2]);
    expect(port.reports.last.gps?.measuredAt, start);
    expect(port.reports.last.sentAt, now);
  });
  test('an offline or unauthenticated context makes no session or report',
      () async {
    final port = FakePresencePort()..current = null;
    await DriverPresenceCoordinator(port).tick();
    expect(port.beginCalls, 0);
    expect(port.reports, isEmpty);
  });
  test('a rejected device session cannot send coordinates', () async {
    final port = FakePresencePort()..beginResult = false;
    await DriverPresenceCoordinator(port).tick();
    expect(port.reports, isEmpty);
  });
  test('overlapping timer ticks do not overlap GPS or network work', () async {
    final sample = Completer<DriverGpsSample?>();
    final port = FakePresencePort()..readLocation = () => sample.future;
    final coordinator = DriverPresenceCoordinator(port, clock: () => start);
    final first = coordinator.tick();
    await Future<void>.delayed(Duration.zero);
    await coordinator.tick();
    expect(port.beginCalls, 1);
    expect(port.reports, isEmpty);
    sample.complete(null);
    await first;
    expect(port.reports.length, 1);
  });
  test('Offline or a different identity during GPS prevents the pending report',
      () async {
    final port = FakePresencePort();
    port.readLocation = () async {
      port.current = null;
      return null;
    };
    await DriverPresenceCoordinator(port, clock: () => start).tick();
    expect(port.reports, isEmpty);
  });
  test('stale, future, inaccurate and mocked GPS does not get a new timestamp',
      () async {
    for (final sample in [
      DriverGpsSample(
          lat: 16,
          lng: -92,
          measuredAt: start.subtract(const Duration(seconds: 121)),
          accuracyMeters: 5),
      DriverGpsSample(
          lat: 16,
          lng: -92,
          measuredAt: start.add(const Duration(seconds: 16)),
          accuracyMeters: 5),
      DriverGpsSample(
          lat: 16, lng: -92, measuredAt: start, accuracyMeters: 101),
      DriverGpsSample(
          lat: 16,
          lng: -92,
          measuredAt: start,
          accuracyMeters: 5,
          mocked: true),
    ]) {
      final port = FakePresencePort()..readLocation = () async => sample;
      await DriverPresenceCoordinator(port, clock: () => start).tick();
      expect(port.reports.single.gps, isNull);
      expect(port.reports.single.arguments(profile)['p_gps_at'], isNull);
    }
  });
  test(
      'GPS failure still reports authenticated presence without fabricating GPS',
      () async {
    final port = FakePresencePort()
      ..readLocation = () async => throw StateError('GPS unavailable');
    await DriverPresenceCoordinator(port, clock: () => start).tick();
    expect(port.reports.single.gps, isNull);
    expect(port.reports.single.battery, 80);
  });
  test('transport failures back off and diagnostics contain only stable codes',
      () async {
    var now = start;
    final messages = <String>[];
    final port = FakePresencePort()..throwReport = true;
    final coordinator = DriverPresenceCoordinator(port,
        clock: () => now, diagnostic: messages.add);
    await coordinator.tick();
    now = start.add(const Duration(seconds: 15));
    await coordinator.tick();
    expect(port.reports.length, 1);
    now = start.add(const Duration(seconds: 30));
    await coordinator.tick();
    expect(port.reports.length, 2);
    expect(messages, ['presence_transport_failed']);
  });
  test('a lost server session creates a new session on the next bounded tick',
      () async {
    var now = start;
    final port = FakePresencePort()
      ..receipt = const PresenceReceipt(false, resetSession: true);
    final coordinator = DriverPresenceCoordinator(port, clock: () => now);
    await coordinator.tick();
    now = now.add(const Duration(seconds: 15));
    await coordinator.tick();
    expect(port.beginCalls, 2);
    expect(port.reports.first.sessionId, isNot(port.reports.last.sessionId));
    expect(port.reports.last.sequence, 1);
  });
  test('stopping while GPS is pending cannot send a late report', () async {
    final sample = Completer<DriverGpsSample?>();
    final port = FakePresencePort()..readLocation = () => sample.future;
    final coordinator = DriverPresenceCoordinator(port, clock: () => start);
    final tick = coordinator.tick();
    await Future<void>.delayed(Duration.zero);
    coordinator.stop();
    sample.complete(null);
    await tick;
    expect(port.reports, isEmpty);
  });
  test('invalid receipts fail visibly and do not claim successful presence',
      () {
    expect(() => PresenceReceipt.parse({'accepted': 'yes'}),
        throwsFormatException);
    expect(() => PresenceReceipt.parse(null), throwsFormatException);
    expect(
        PresenceReceipt.parse({'accepted': false, 'reason': 'session'})
            .resetSession,
        true);
  });
}
