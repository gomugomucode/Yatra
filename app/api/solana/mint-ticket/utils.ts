export interface MintTicketInput {
  bookingId?: string;
  passengerId?: string;
  fare?: number;
  route?: string;
  driverName?: string;
}

export function isValidMintTicketInput(input: MintTicketInput): boolean {
  return Boolean(
    input.bookingId &&
    input.passengerId &&
    input.fare != null &&
    input.route &&
    input.driverName
  );
}

export function getBookingReceiptPath(bookingId: string): string {
  return `bookings/${bookingId}`;
}

