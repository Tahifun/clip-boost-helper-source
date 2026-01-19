// env.mjs
export function readEnv(key, fallback = "") {
  try {
    const v = String(process.env?.[key] ?? "").trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

// Optional für Power-User/Dev, Endnutzer sollen es NICHT brauchen:
export const BACKEND_ORIGIN =
  readEnv("CLIP_BOOST_BACKEND_ORIGIN") ||
  readEnv("BACKEND_ORIGIN") ||
  "";
