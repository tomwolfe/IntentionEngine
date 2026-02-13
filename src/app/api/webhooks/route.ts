import { NextRequest, NextResponse } from "next/server";
import { inferIntent } from "@/lib/intent";
import { generatePlan } from "@/lib/planner";
import { createAuditLog } from "@/lib/audit";
import { z } from "zod";
import { handleTableStackRejection } from "@/lib/listeners/tablestack";

export const runtime = "edge";

const WebhookEventSchema = z.object({
  event: z.string(),
  // Fields for high_value_guest_reservation
  guest: z.object({
    name: z.string(),
    email: z.string(),
    visitCount: z.number(),
    defaultDeliveryAddress: z.string().optional().nullable(),
  }).optional(),
  reservation: z.object({
    id: z.string().optional(),
    restaurantName: z.string(),
    startTime: z.string(),
    partySize: z.number(),
  }).optional(),
  // Fields for reservation_rejected (can overlap)
  guestEmail: z.string().optional(),
  restaurantName: z.string().optional(),
  startTime: z.string().optional(),
  partySize: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    console.log("[IntentionEngine Webhook] Received:", JSON.stringify(rawBody, null, 2));

    const validatedBody = WebhookEventSchema.safeParse(rawBody);
    if (!validatedBody.success) {
      // Still return 200 to acknowledge receipt if it's an unknown event
      return NextResponse.json({ message: "Event received but schema mismatch" }, { status: 200 });
    }

    const { event, guest, reservation, guestEmail, restaurantName, startTime, partySize } = validatedBody.data;

    if (event === 'reservation_rejected') {
      const result = await handleTableStackRejection({
        guestEmail: guestEmail || "",
        restaurantName: restaurantName || "",
        startTime: startTime || "",
        partySize: partySize || 0,
      });

      return NextResponse.json({
        message: "Failover initiated",
        hypotheses: result.hypotheses,
        plan_id: result.plan?.intent_id
      });
    }

    if (event === 'high_value_guest_reservation' && guest && reservation) {
      // Strategic Synergy: High-value guest detected. 
      // Proactively suggest a delivery or transport workflow if they have a saved address.
      
      let proactiveText = `Guest ${guest.name} (High Value, ${guest.visitCount} visits) just booked at ${reservation.restaurantName}.`;
      
      if (guest.defaultDeliveryAddress) {
        proactiveText += ` Suggest a delivery quote from ${reservation.restaurantName} to ${guest.defaultDeliveryAddress} for after their reservation.`;
      } else {
        proactiveText += ` Prepare a welcome message or special offer for their arrival.`;
      }

      console.log("[IntentionEngine Webhook] Proactive Trigger:", proactiveText);

      // We could trigger internal intent processing here
      // For now, we log the proactive orchestration intent
      const { hypotheses } = await inferIntent(proactiveText, []);
      const intent = hypotheses.primary;
      const plan = await generatePlan(proactiveText);
      
      await createAuditLog(intent, plan, undefined, `webhook:${guest.email}`);

      return NextResponse.json({ 
        message: "High-value guest event processed",
        proactive_action: guest.defaultDeliveryAddress ? "delivery_quote_suggested" : "welcome_offer_prepared"
      });
    }

    return NextResponse.json({ message: "Event ignored" });
  } catch (error: any) {
    console.error("[IntentionEngine Webhook] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
