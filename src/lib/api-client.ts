/** Client-side fetch helpers that turn failed requests into thrown errors
 *  carrying the API's message, so callers cannot mistake them for success. */

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Body was not JSON; fall back to the status line below.
  }
  return `Request failed (${res.status} ${res.statusText})`;
}

/** GET a JSON resource. Throws on network failure or a non-OK response. */
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await errorMessage(res));
  return await res.json() as T;
}

/** Send a JSON body with the given method. Throws on network failure or a non-OK response. */
export async function apiSend<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Message for a caught unknown error, for use in toasts. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
