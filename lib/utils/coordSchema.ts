import { z } from 'zod';

export const coordSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

export const coordWithOptionalAddressSchema = coordSchema.extend({
  address: z.string().trim().optional(),
});

