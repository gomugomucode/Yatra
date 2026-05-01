import { describe, expect, it } from 'vitest';
import { getBookingReceiptPath, isValidMintTicketInput } from '@/app/api/solana/mint-ticket/utils';

describe('mint-ticket utils', () => {
  it('validates required mint input fields', () => {
    expect(
      isValidMintTicketInput({
        bookingId: 'b1',
        passengerId: 'p1',
        fare: 0,
        route: 'Butwal Local',
        driverName: 'Driver A',
      })
    ).toBe(true);

    expect(
      isValidMintTicketInput({
        bookingId: 'b1',
        passengerId: 'p1',
        route: 'Butwal Local',
        driverName: 'Driver A',
      })
    ).toBe(false);
  });

  it('uses flat booking path for receipt persistence', () => {
    expect(getBookingReceiptPath('booking-123')).toBe('bookings/booking-123');
  });
});

