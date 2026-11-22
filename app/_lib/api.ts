/** Browser-side helper for Vault's JSON API routes. */
export async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Request failed (${response.status})`);
  }
  return data as T;
}
