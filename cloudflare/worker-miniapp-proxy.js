// MAX mini-app reverse proxy: Cloudflare Workers -> existing Railway service.
// This keeps frontend, static assets and API on the same browser origin.
// The private application code, database, MAX bot token and webhook remain on Railway.
const UPSTREAM = "https://telegram-ai-secretary-production.up.railway.app";
const PUBLIC_PAGES = new Set(["/", "/webapp", "/webapp/", "/max-check", "/legal", "/health"]);
const FORWARD_REQUEST_HEADERS = ["accept", "accept-language", "content-type", "x-max-init-data", "range", "if-none-match"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "content-disposition", "location", "etag", "last-modified", "accept-ranges", "content-range"];

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const path = incoming.pathname;
    const api = path.startsWith("/webapp/api/");
    const staticFile = path.startsWith("/webapp-static/");
    const page = PUBLIC_PAGES.has(path);
    if (!api && !staticFile && !page) return new Response("Not found", {status:404});

    const method = request.method;
    const methods = api ? ["GET", "HEAD", "POST", "PUT", "DELETE"] : ["GET", "HEAD"];
    if (!methods.includes(method)) return new Response("Method not allowed", {status:405});

    // Fixed destination, never user-supplied: prevents an open proxy.
    const destination = new URL(path + incoming.search, UPSTREAM);
    const forwarded = new Headers();
    for (const name of FORWARD_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) forwarded.set(name, value);
    }

    try {
      const upstream = await fetch(destination.toString(), {
        method,
        headers: forwarded,
        body: method === "GET" || method === "HEAD" ? undefined : request.body,
        redirect: "manual"
      });
      const resultHeaders = new Headers();
      for (const name of FORWARD_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value !== null) resultHeaders.set(name, value);
      }
      const redirect = resultHeaders.get("location");
      if (redirect && redirect.startsWith(UPSTREAM)) {
        resultHeaders.set("location", new URL(redirect).pathname + new URL(redirect).search);
      }
      resultHeaders.set("cache-control", staticFile ? "public, max-age=300" : "no-store");
      resultHeaders.set("x-content-type-options", "nosniff");
      return new Response(method === "HEAD" ? null : upstream.body, {
        status: upstream.status,
        headers: resultHeaders
      });
    } catch (_) {
      return new Response("Railway temporarily unavailable", {
        status: 502,
        headers: {"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}
      });
    }
  }
};