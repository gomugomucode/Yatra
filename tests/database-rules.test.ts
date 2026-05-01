import { describe, expect, it } from 'vitest';
import rules from '@/database.rules.json';

describe('database rules privacy boundaries', () => {
  const rootRules = (rules as any).rules;

  it('locks root reads for sensitive paths', () => {
    expect(rootRules.bookings['.read']).toContain("role').val() === 'admin'");
    expect(rootRules.trips['.read']).toContain("role').val() === 'admin'");
  });

  it('restricts trip location writes to participants', () => {
    expect(rootRules.tripLocations.$tripId.driver['.write']).toContain("child('driverId').val() === auth.uid");
    expect(rootRules.tripLocations.$tripId.passenger['.write']).toContain("child('passengerId').val() === auth.uid");
  });

  it('restricts alerts to driver/admin write and admin read', () => {
    expect(rootRules.alerts['.read']).toContain("role').val() === 'admin'");
    expect(rootRules.alerts['.write']).toBe(false);
    expect(rootRules.alerts.$alertId['.write']).toContain("role').val() === 'driver'");
  });

  it('enforces schema validation on critical paths', () => {
    expect(rootRules.bookings.$bookingId['.validate']).toContain("newData.hasChildren(['id','passengerId'");
    expect(rootRules.trips.$tripId['.validate']).toContain("newData.hasChildren(['id','tripId'");
    expect(rootRules.tripRequests.$requestId['.validate']).toContain("newData.child('status').val() === 'requested'");
    expect(rootRules.alerts.$alertId['.validate']).toContain("newData.hasChildren(['id','busId'");
  });

  it('prevents direct client mutation of booking data', () => {
    expect(rootRules.bookings.$bookingId['.write']).toBe('false');
  });

  it('locks trip escrow fields from participant writes', () => {
    const tripWriteRule = rootRules.trips.$tripId['.write'] as string;
    expect(tripWriteRule).toContain("newData.child('escrowStatus').val() === data.child('escrowStatus').val()");
    expect(tripWriteRule).toContain("newData.child('amountLamports').val() === data.child('amountLamports').val()");
  });
});

