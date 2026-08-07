// Edge Functions run on their own subdomain, separate from the web app's
// origin, so every response needs CORS headers for the browser/extension
// clients to read it. Tighten `Access-Control-Allow-Origin` to the app's real
// origin(s) before shipping past Phase 1 dev.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
