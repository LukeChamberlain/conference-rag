const ALLOWED_ORIGINS = new Set([
  // GitHub Pages project site for LukeChamberlain/conference-rag.
  "https://lukechamberlain.github.io",
  // Local development servers used by the project guide.
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export function isAllowedOrigin(origin: string | null): boolean {
  // Requests without Origin (for example, CLI calls) are not browser CORS requests.
  return origin === null || ALLOWED_ORIGINS.has(origin);
}

export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  });

  if (origin !== null && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}
