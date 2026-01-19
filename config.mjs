 // config.mjs
// Zentraler Helper-Config-Layer: Backend-Origin + robuste Normalisierung fuer Agent-WS-URL.

export function getBackendOrigin() {
  const v =
    process.env.CLIP_BOOST_BACKEND_ORIGIN ||
    process.env.BACKEND_ORIGIN ||
    process.env.CB_BACKEND_ORIGIN ||
    "https://api.clip-boost.online";

  return String(v).trim().replace(/\/+$/, "");
}

function toWsOrigin(origin) {
  const o = String(origin || "").trim().replace(/\/+$/, "");
  if (!o) return "wss://api.clip-boost.online";

  if (/^wss?:\/\//i.test(o)) return o;
  if (/^https:\/\//i.test(o)) return "wss://" + o.slice("https://".length);
  if (/^http:\/\//i.test(o)) return "ws://" + o.slice("http://".length);

  // Host ohne Scheme
  return "wss://" + o.replace(/^\/*/, "");
}

function convertHttpToWs(url) {
  return String(url)
    .trim()
    .replace(/^https:\/\//i, "wss://")
    .replace(/^http:\/\//i, "ws://");
}

/**
 * Akzeptiert:
 * - Voll-URL:  wss://api.../ws?kind=agent&token=...
 * - HTTP-Link: https://api.../ws?kind=agent&token=...   -> wird zu wss://...
 * - Host/Path ohne Scheme: api.clip-boost.online/ws?kind=agent&token=... -> wird zu wss://...
 * - Nur Token/Code: rUh4... -> wird zu wss://.../ws?kind=agent&token=rUh4...
 */
export function normalizeAgentWsUrl(input) {
  let v = String(input ?? "").trim();
  if (!v) return "";

  // Quotes entfernen
  v = v.replace(/^['"]+|['"]+$/g, "").trim();

  // Falls jemand "wss://..." irgendwo im String hat (z.B. doppelt reinkopiert), extrahieren
  const embeddedWs = v.match(/wss?:\/\/[^\s"']+/i);
  if (embeddedWs?.[0]) return embeddedWs[0];

  // ws/wss direkt ok
  if (/^wss?:\/\//i.test(v)) return v;

  // http/https -> ws/wss
  if (/^https?:\/\//i.test(v)) return convertHttpToWs(v);

  // Sieht aus wie host/path oder path/query?
  const looksLikePathOrHost =
    v.includes("/ws") || v.includes("kind=agent") || v.includes("token=") || v.includes("clip-boost");

  if (looksLikePathOrHost) {
    // Wenn es wie "api.domain/..." aussieht -> prefix wss://
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(v)) {
      return "wss://" + v.replace(/^\/*/, "");
    }

    // Wenn es wie "/ws?..." oder "ws?..." aussieht -> an Backend-Origin haengen
    const base = toWsOrigin(getBackendOrigin());
    if (v.startsWith("/")) return base + v;
    return base + "/" + v.replace(/^\/*/, "");
  }

  // Default: Token/Code
  const token = encodeURIComponent(v);
  const base = toWsOrigin(getBackendOrigin());
  return `${base}/ws?kind=agent&token=${token}`;
}
