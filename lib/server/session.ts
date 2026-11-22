import "server-only";
import { auth } from "@/auth";
import { AppError } from "./errors";

export class UnauthorizedError extends AppError {
  constructor() {
    super(401, "unauthorized", "Sign in to continue");
  }
}

/** The signed-in user's id, or null without a valid session. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** The signed-in user's id; throws a 401 AppError without a valid session. */
export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}
