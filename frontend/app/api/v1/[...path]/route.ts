const backend = process.env.BACKEND_URL || "http://localhost:3001";
async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment)))
    return Response.json({ message: "Bad Request" }, { status: 400 });
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
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.arrayBuffer();
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
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
    return Response.json({ message: "Service Unavailable" }, { status: 503 });
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
