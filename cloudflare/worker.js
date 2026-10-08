// Temporary, read-only test relay for MAX -> Cloudflare Workers -> Railway.
// No MAX initData, user IDs, access tokens, or other user data are sent.
// Route intentionally limited to GET / and GET /health.
const RAILWAY_HEALTH = "https://telegram-ai-secretary-production.up.railway.app/health?source=cf-worker-test";
const ALLOWED_ORIGIN = "https://sergejzerebor656-hash.github.io";

function respond(payload, status=200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": ALLOWED_ORIGIN,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
      "vary": "Origin",
      "x-content-type-options": "nosniff"
    }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname === "/health") {
      return new Response(null, {status:204,headers:{
        "access-control-allow-origin": ALLOWED_ORIGIN,
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
        "vary": "Origin"
      }});
    }
    if (request.method !== "GET") return respond({error:"Method Not Allowed"},405);
    if (url.pathname === "/") {
      return respond({
        worker:"online",
        purpose:"Read-only connectivity test for Railway. Call GET /health to check upstream.",
        forwardUserData:false
      });
    }
    if (url.pathname !== "/health") return respond({error:"Not Found"},404);

    const start = Date.now();
    try {
      const upstream = await fetch(RAILWAY_HEALTH, {
        method:"GET",
        redirect:"manual",
        cache:"no-store",
        signal:AbortSignal.timeout(9000)
      });
      return respond({
        worker:"online",
        railwayReachable:true,
        railwayHttpStatus:upstream.status,
        railwayHealthy:upstream.ok,
        durationMs:Date.now()-start
      });
    } catch (_) {
      return respond({
        worker:"online",
        railwayReachable:false,
        error:"Railway request failed or exceeded 9 seconds",
        durationMs:Date.now()-start
      },502);
    }
  }
};