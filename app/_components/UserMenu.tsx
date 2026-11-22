import { connection } from "next/server";
import { auth } from "@/auth";
import { signOutAction } from "../_lib/auth-actions";

/** Who is signed in, and the Sign out control. */
export async function UserMenu() {
  await connection();
  const session = await auth();
  if (!session?.user) return null;
  const label = session.user.name || session.user.email;
  return (
    <div className="user-menu">
      {label ? (
        <span className="user-label" title={session.user.email ?? undefined}>
          {label}
        </span>
      ) : null}
      <form action={signOutAction}>
        <button type="submit" className="button subtle">
          Sign out
        </button>
      </form>
    </div>
  );
}
