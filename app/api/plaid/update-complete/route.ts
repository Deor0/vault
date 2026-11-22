import { z } from "zod";
import { getDeps } from "@/lib/server/context";
import { handle, parseJsonBody } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/session";
import { completeUpdateMode } from "@/lib/server/link";

const bodySchema = z.object({ itemId: z.uuid("itemId must be a UUID") });

/** Update-mode Link finished for an existing Item: clear its error state and re-sync. */
export async function POST(request: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const { itemId } = await parseJsonBody(request, bodySchema);
    return completeUpdateMode(getDeps(), userId, itemId);
  });
}
