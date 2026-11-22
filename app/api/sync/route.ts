import { z } from "zod";
import { getDeps } from "@/lib/server/context";
import { handle, parseJsonBody } from "@/lib/server/http";
import { requireUserId } from "@/lib/server/session";
import { syncAllItems, syncItem } from "@/lib/server/sync";

const bodySchema = z.object({ itemId: z.uuid("itemId must be a UUID").optional() });

/** Manual refresh: re-sync balances and transactions for one Item or all of them. */
export async function POST(request: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const { itemId } = await parseJsonBody(request, bodySchema);
    const deps = getDeps();
    return { results: itemId ? [await syncItem(deps, userId, itemId)] : await syncAllItems(deps, userId) };
  });
}
