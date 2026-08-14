import { NextResponse } from "next/server";

/** Error carrying the HTTP status to report to the client. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/** Wraps a route handler so a thrown error becomes a JSON error response
 *  instead of an opaque framework 500 with no message. */
export function withErrorHandling<A extends unknown[], R extends Response>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | NextResponse> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      // Thrown by req.json() for a malformed request body
      if (err instanceof SyntaxError) {
        return NextResponse.json({ error: `Invalid JSON request body: ${err.message}` }, { status: 400 });
      }
      console.error("[api] Unhandled error:", err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
