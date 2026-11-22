import { z } from "zod";
import { getDeps } from "@/lib/server/context";
import { handle, parseJsonBody } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/session";
import { createLinkToken } from "@/lib/server/link";

const bodySchema = z.object({
  // Present when re-authenticating an existing Item (update mode).
  itemId: z.uuid("itemId must be a UUID").optional(),
});

/** Create a Plaid Link token: a new Item, or update mode for an existing one. */
export async function POST(request: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const { itemId } = await parseJsonBody(request, bodySchema);
    return createLinkToken(getDeps(), userId, { itemId });
  });
}
