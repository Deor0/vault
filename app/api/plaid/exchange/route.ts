import { z } from "zod";
import { getDeps } from "@/lib/server/context";
import { exchangePublicToken } from "@/lib/server/exchange";
import { handle, parseJsonBody } from "@/lib/server/http";

const bodySchema = z.object({
  publicToken: z.string().min(1, "publicToken is required").max(512),
  institution: z
    .object({
      id: z.string().max(128).nullish(),
      name: z.string().max(256).nullish(),
    })
    .nullish(),
});

/** Exchange the public_token from Plaid Link for an access_token, stored encrypted server-side. */
export async function POST(request: Request) {
  return handle(async () => {
    const { publicToken, institution } = await parseJsonBody(request, bodySchema);
    return exchangePublicToken(getDeps(), publicToken, institution ?? {});
  });
}
