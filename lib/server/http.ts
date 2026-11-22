import "server-only";
import { z } from "zod";
import { EncryptionKeyError } from "./crypto";
import { ConfigError } from "./env";
import { AppError } from "./errors";
import { plaidErrorInfo } from "./plaid/client";

/**
 * Helpers for the JSON API routes. Besides the session check, every mutating
 * route requires a JSON body and a same-origin request: a cross-site page
 * cannot send `application/json` without a CORS preflight, and the Origin
 * check rejects other sites outright, so the session cookie cannot be used
 * from another site (CSRF).
 */

export function assertSameOriginJson(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new AppError(415, "unsupported_media_type", "Expected a JSON request body");
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError(403, "forbidden", "Cross-origin request rejected");
    }
    if (!host || originHost !== host) {
      throw new AppError(403, "forbidden", "Cross-origin request rejected");
    }
  }
}

export async function parseJsonBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  assertSameOriginJson(request);
  let body: unknown;
  try {
    const text = await request.text();
    body = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    throw new AppError(400, "invalid_json", "Request body is not valid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, "invalid_request", parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  return parsed.data;
}

/** Map any thrown error to a JSON response without leaking secrets or internals. */
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ConfigError || error instanceof EncryptionKeyError) {
    // These messages name missing/invalid settings only, never their values.
    return Response.json({ error: { code: "not_configured", message: error.message } }, { status: 500 });
  }
  const plaid = plaidErrorInfo(error);
  if (plaid) {
    console.error(`Plaid API error ${plaid.errorType}/${plaid.errorCode} (request ${plaid.requestId ?? "n/a"})`);
    return Response.json(
      {
        error: {
          code: plaid.errorCode,
          message: plaid.displayMessage ?? `Plaid request failed (${plaid.errorCode})`,
        },
      },
      { status: 502 },
    );
  }
  console.error(`Unexpected server error: ${error instanceof Error ? error.message : "unknown"}`);
  return Response.json({ error: { code: "internal_error", message: "Something went wrong" } }, { status: 500 });
}

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (error) {
    return errorResponse(error);
  }
}
