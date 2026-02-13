import { redis } from "@/lib/redis-client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/security";

// Schema for Ably message payloads from TableStack
const AblyStateSchema = z.object({
  name: z.string(), // e.g., "table_status_update"
  data: z.object({
    restaurantId: z.string(),
    tableId: z.string(),
    status: z.enum(["vacant", "occupied", "dirty"]),
    updatedAt: z.string(),
  }),
});

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");
    const timestamp = Number(req.headers.get("x-timestamp"));

    // 1. Validate Webhook Security (HMAC)
    if (signature && timestamp) {
       const isValid = await verifySignature(rawBody, signature, timestamp);
       if (!isValid) {
         return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
       }
    }

    const body = JSON.parse(rawBody);
    
    // 2. Validate Ably Webhook Schema
    const event = AblyStateSchema.parse(body);

    // 3. Mirror UI state to AI memory (Redis)
    // We use a separate prefix for state to avoid collisions if needed, 
    // but the redis client already adds 'ie:'
    const key = `state:${event.data.restaurantId}:tables`;
    
    await redis.hset(key, {
      [event.data.tableId]: JSON.stringify({
        status: event.data.status,
        updatedAt: event.data.updatedAt
      })
    });

    // 4. Set TTL to ensure memory stays "fresh" (e.g., 2 hours)
    await redis.expire(key, 7200);

    return NextResponse.json({ synced: true });
  } catch (error) {
    console.error("[State Bridge] Sync failed:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 400 });
  }
}
