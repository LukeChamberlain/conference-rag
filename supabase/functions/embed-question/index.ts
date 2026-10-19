import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cors: Headers,
): Response {
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);

  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, cors);
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!bearer) {
    return jsonResponse({ error: "Authentication required" }, 401, cors);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !openAiApiKey) {
    console.error("Missing required Edge Function environment configuration");
    return jsonResponse({ error: "Function is not configured" }, 500, cors);
  }

  // Verify the caller's access token with Supabase Auth. Never trust a decoded JWT alone.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(bearer[1]);
  if (authError || !user) {
    return jsonResponse({ error: "Invalid or expired access token" }, 401, cors);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400, cors);
  }

  const question = (body as { question?: unknown } | null)?.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    return jsonResponse({ error: 'Body must contain a non-empty "question" string' }, 400, cors);
  }
  if (question.length > 8_000) {
    return jsonResponse({ error: "Question is too long" }, 413, cors);
  }

  try {
    const openAiResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: question.trim(),
      }),
    });

    if (!openAiResponse.ok) {
      // Avoid returning provider response bodies or secrets to the browser.
      console.error("OpenAI embeddings request failed with status", openAiResponse.status);
      return jsonResponse({ error: "Embedding provider request failed" }, 502, cors);
    }

    const result = await openAiResponse.json();
    const embedding = result?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      console.error("OpenAI returned an invalid embedding response");
      return jsonResponse({ error: "Embedding provider returned an invalid response" }, 502, cors);
    }

    return jsonResponse({ embedding }, 200, cors);
  } catch (error) {
    console.error("Embedding request failed", error);
    return jsonResponse({ error: "Embedding generation failed" }, 502, cors);
  }
});
