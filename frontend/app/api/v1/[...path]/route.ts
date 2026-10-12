const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
function failure(statusCode: number, error: string, message: string) {
  return Response.json({ statusCode, error, message, details: [] }, {
    status: statusCode, headers: { "cache-control": "no-store" },
  });
}
async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment)))
    return failure(400, "BAD_REQUEST", "Bad Request");
  const target = `${backend}/api/v1/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;
  // Forward only application headers. Origin is preserved, never synthesized from Host.
  const headers = new Headers();
  for (const name of [
    "content-type",
    "accept",
    "cookie",
    "origin",
    "sec-fetch-site",
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  try {
    const limit = 100 * 1024;
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (Number(request.headers.get("content-length")) > limit)
      return failure(413, "PAYLOAD_TOO_LARGE", "Payload too large");
    if (!["GET", "HEAD"].includes(request.method) && request.body) {
      const reader = request.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) {
            await reader.cancel();
            return failure(413, "PAYLOAD_TOO_LARGE", "Payload too large");
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body!.set(chunk, offset); offset += chunk.byteLength; }
    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const outgoing = new Headers();
    for (const name of [
      "content-type",
      "cache-control",
      "pragma",
      "www-authenticate",
      "retry-after",
    ]) {
      const value = response.headers.get(name);
      if (value !== null) outgoing.set(name, value);
    }
    // Set-Cookie cannot be comma-joined: Expires itself contains a comma.
    for (const cookie of response.headers.getSetCookie())
      outgoing.append("set-cookie", cookie);
    outgoing.set("cache-control", "no-store");
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return failure(503, "SERVICE_UNAVAILABLE", "Service Unavailable");
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
