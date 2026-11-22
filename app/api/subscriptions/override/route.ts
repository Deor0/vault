import { z } from "zod";
import { getDb } from "@/lib/server/context";
import { handle, parseJsonBody } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/session";
import { saveOverride } from "@/lib/server/subscriptions";

const isoDate = z.iso.date("cancelledAt must be a date (YYYY-MM-DD)");

const bodySchema = z
  .object({
    streamKey: z
      .string("streamKey is required")
      .trim()
      .min(1, "streamKey is required")
      .max(300, "streamKey is too long"),
    status: z.enum(["confirmed", "ignored", "cancelled"]).optional(),
    kind: z.enum(["subscription", "bill"]).nullable().optional(),
    displayName: z.string().max(80, "Name is too long (80 characters at most)").nullable().optional(),
    cancelledAt: isoDate.nullable().optional(),
  })
  .refine((body) => body.cancelledAt === undefined || body.cancelledAt === null || body.status === "cancelled", {
    message: "cancelledAt is only allowed with status \"cancelled\"",
  });

/**
 * Record the signed-in user's decision about a detected recurring charge:
 * confirm or ignore it, mark it cancelled (from that date, any new charge is
 * flagged), rename it, or file it as a bill or a subscription.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const body = await parseJsonBody(request, bodySchema);
    return { override: await saveOverride(getDb(), userId, body) };
  });
}
