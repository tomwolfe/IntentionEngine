import { z } from "zod";

export const RestaurantResultSchema = z.object({
  name: z.string(),
  address: z.string(),
  coordinates: z.object({
    lat: z.number(),
    lon: z.number(),
  }),
});

export type RestaurantResult = z.infer<typeof RestaurantResultSchema>;
