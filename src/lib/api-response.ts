import { NextResponse } from "next/server";

/** JSON error body with a status code. */
export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export function notFound(message = "Not found") {
  return errorResponse(message, 404);
}

export function badRequest(message: string) {
  return errorResponse(message, 400);
}

export function conflict(message: string) {
  return errorResponse(message, 409);
}

/** Validates a bulk-operation `{ ids: [...] }` body. */
export function parseIds(body: { ids?: unknown }): { ids: string[] } | { error: NextResponse } {
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: badRequest("ids array required") };
  }
  return { ids: ids as string[] };
}
