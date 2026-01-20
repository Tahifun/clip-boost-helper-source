// CLiP-BOOsT Helper (OBS Agent)
// Connects CLiP-BOOsT backend <-> OBS WebSocket (v5).
//
// Ziel: Endnutzer sollen KEINE Umgebungsvariablen setzen muessen.
// Der Helper fragt beim ersten Start die noetigen Werte ab und speichert sie.

import WebSocket from "ws";
import OBSWebSocket from "obs-websocket-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import child_process from "node:child_process";
import { normalizeAgentWsUrl, getBackendOrigin } from "./config.mjs";

/**
 * Config-Dateien:
 * - %APPDATA%\CLiP-BOOsT\Helper\obs-agent.config.json   (empfohlen)
 * - <exe-ordner>\obs-agent.config.json                  (portable)
 * - ./obs-agent.config.json                             (aktueller Ordner)
 * - C:\clip-boost-agent\obs-agent.config.json           (legacy)
 * - <scriptDir>/obs-agent.config.json                    (dev)
 */

/**
 * Robust Script/Working Dir (funktioniert in):
 * - Node ESM (import.meta.url vorhanden)
 * - esbuild bundle -> CJS (import.meta.url kann undefined sein)
 * - pkg snapshot (process.execPath vorhanden)
 */
const SCRIPT_DIR = (() => {
  try {
    const u = typeof import.meta?.url === "string" ? import.meta.url : null;
    if (u) return path.dirname(fileURLToPath(u));
  } catch {
    // ignore
  }

  const a1 = process.argv?.[1];
  if (typeof a1 === "string" && a1.length > 0) return path.dirname(a1);

  const ex = process.execPath;
  if (typeof ex === "string" && ex.length > 0) return path.dirname(ex);

  return process.cwd();
})();

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function mkRpcError(requestId, code, message) {
  return { type: "rpc_error", requestId, code, message, tsMs: Date.now() };
}

/**
 * Deep-Linking / URL-Protocol
 *
 * Erwartet Aufruf via Windows URL Protocol (z. B. durch Browser):
 *   clipboost://start?code=<token-oder-url>&backend=<https://api...>
 *
 * Ziel: 1-Klick aus dem Dashboard:
 * - Helper startet
 * - Token/Link wird uebernommen
 * - Config wird gespeichert
 */
function parseDeepLinkFromArgv(argv) {
  try {
    const args = (argv || []).slice(2).map((x) => String(x || "").trim()).filter(Boolean);
    const raw = args.find((a) => /^clipboost:\/\//i.test(a) || a.includes("clipboost://"));
    if (!raw) return null;

    const m = raw.match(/clipboost:\/\/[\S]+/i);
    const u = (m && m[0]) ? m[0] : raw;

    const url = new URL(u);
    if (url.protocol !== "clipboost:") return null;

    const action = (url.hostname || "").trim() || (String(url.pathname || "").replace(/^\/+/, "").trim());
    const p = url.searchParams;
    const code = p.get("code") || p.get("token") || p.get("ws") || p.get("url") || "";

    const backendOrigin = p.get("backend") || p.get("backendOrigin") || "";
    const obsWsUrl = p.get("obsWsUrl") || p.get("obs") || "";
    const obsPassword = p.get("obsPassword") || p.get("pass") || "";

    return {
      raw: u,
      action: action || "start",
      code: code || "",
      backendOrigin: backendOrigin || "",
      obsWsUrl: obsWsUrl || "",
      obsPassword: obsPassword || "",
    };
  } catch {
    return null;
  }
}

function trySelfRegisterUrlProtocol() {
  if (process.platform !== "win32") return;

  try {
    const exe = process.execPath;
    if (!exe) return;

    const base = "HKCU\\Software\\Classes\\clipboost";
    const cmd = `"${exe}" "%1"`;

    // HKCU => kein Admin notwendig
    child_process.spawnSync("reg", ["add", base, "/ve", "/d", "URL:CLiP-BOOsT Protocol", "/f"], { stdio: "ignore", windowsHide: true });
    child_process.spawnSync("reg", ["add", base, "/v", "URL Protocol", "/d", "", "/f"], { stdio: "ignore", windowsHide: true });
    child_process.spawnSync("reg", ["add", base + "\\DefaultIcon", "/ve", "/d", exe + ",0", "/f"], { stdio: "ignore", windowsHide: true });
    child_process.spawnSync(
      "reg",
      ["add", base + "\\shell\\open\\command", "/ve", "/d", cmd, "/f"],
      { stdio: "ignore", windowsHide: true },
    );
  } catch {
    // ignore
  }
}

function openUrl(url) {
  try {
    const u = String(url || "").trim();
    if (!u) return false;
    if (process.platform === "win32") {
      const cp = child_process.spawn("cmd", ["/c", "start", "", u], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      cp.unref();
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function tryOpenObsWin() {
  if (process.platform !== "win32") return false;
  try {
    const candidates = [];

    const pf = process.env.ProgramFiles || "C:\\Program Files";
    const pfx = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

    candidates.push(path.join(pf, "obs-studio", "bin", "64bit", "obs64.exe"));
    candidates.push(path.join(pfx, "obs-studio", "bin", "64bit", "obs64.exe"));
    candidates.push(path.join(local, "Programs", "obs-studio", "bin", "64bit", "obs64.exe"));

    for (const exe of candidates) {
      if (fs.existsSync(exe)) {
        const cp = child_process.spawn(exe, [], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        cp.unref();
        return true;
      }
    }
  } catch {
    // ignore
  }

  // fallback: open download page
  return openUrl("https://obsproject.com/download");
}

function getExeDir() {
  try {
    // When packaged, this is the path to the .exe
    return path.dirname(process.execPath);
  } catch {
    return process.cwd();
  }
}

function getAppDataDir() {
  const appData =
    process.env.APPDATA ||
    path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "CLiP-BOOsT", "Helper");
}

function getPrimaryConfigPath() {
  return path.join(getAppDataDir(), "obs-agent.config.json");
}

function loadLocalConfig() {
  const candidates = [
    getPrimaryConfigPath(),
    path.join(getExeDir(), "obs-agent.config.json"),
    path.join(process.cwd(), "obs-agent.config.json"),
    "C:\\clip-boost-agent\\obs-agent.config.json",
    path.join(SCRIPT_DIR, "obs-agent.config.json"),
  ];

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf-8");
      const j = JSON.parse(raw);
      if (j && typeof j === "object") {
        log("[cfg] loaded", p);
        return { cfg: j, path: p };
      }
    } catch (e) {
      log("[cfg] failed to load", p, e?.message || String(e));
    }
  }
  return { cfg: {}, path: null };
}

function writeConfigSafely(p, j) {
  try {
    const dir = path.dirname(p);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(j, null, 2), "utf-8");
    return true;
  } catch (e) {
    log("[cfg] failed to write", p, e?.message || String(e));
    return false;
  }
}

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || "");
    const nxt = argv[i + 1];

    const take = (key) => {
      if (typeof nxt === "string" && !String(nxt).startsWith("--")) {
        out[key] = String(nxt);
        i++;
      } else {
        out[key] = "true";
      }
    };

    if (a === "--agentWsUrl" || a === "--agent" || a === "--backend") take("agentWsUrl");
    else if (a === "--obsWsUrl" || a === "--obs") take("obsWsUrl");
    else if (a === "--obsPassword" || a === "--pass") take("obsPassword");
    else if (a === "--reset") out.reset = "true";
  }
  return out;
}

async function ensureInteractiveConfig(current) {
  // One-time setup wizard if values are missing
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    log("\nCLiP-BOOsT Helfer-App (Einrichtung)");
    log("- Du musst das nur einmal machen.");
    log("- Danach kannst du die Helfer-App einfach starten.");

    const next = { ...current };

    if (!next.agentWsUrl) {
      log("\nSchritt 1/2: Verbindung zu CLiP-BOOsT");
      log("-> In CLiP-BOOsT (Dashboard) auf 'Code erstellen' klicken und den Link/Code kopieren.");
      const v = (await rl.question("Bitte hier einfügen: ")).trim();
      // Accept full ws/wss url OR http/https link OR plain token/code
      next.agentWsUrl = normalizeAgentWsUrl(v);
    } else {
      // Falls bereits gesetzt, trotzdem robust normalisieren
      next.agentWsUrl = normalizeAgentWsUrl(next.agentWsUrl);
    }

    if (!next.obsWsUrl) {
      next.obsWsUrl = "ws://127.0.0.1:4455";
    }

    if (!next.obsPassword) {
      log("\nSchritt 2/2: OBS WebSocket Passwort");
      log("-> OBS öffnen: Tools -> WebSocket Server Settings -> 'Server Password'.");
      log("   Wenn du kein Passwort gesetzt hast, einfach leer lassen und Enter.");
      const pw = await rl.question("OBS Passwort (optional): ");
      next.obsPassword = (pw || "").trim();
    }

    return next;
  } finally {
    try {
      rl.close();
    } catch {
      // ignore
    }
  }
}

const args = parseArgs();

const loaded = loadLocalConfig();
let cfg = loaded.cfg || {};

if (args.reset === "true") {
  cfg = {};
}

// Merge CLI args (highest priority)
cfg = {
  ...cfg,
  ...(args.agentWsUrl ? { agentWsUrl: args.agentWsUrl } : {}),
  ...(args.obsWsUrl ? { obsWsUrl: args.obsWsUrl } : {}),
  ...(args.obsPassword ? { obsPassword: args.obsPassword } : {}),
};

// Read env overrides (still supported for power-users)
const OBS_WS_URL =
  process.env.OBS_WS_URL ||
  cfg.OBS_WS_URL ||
  cfg.obsWsUrl ||
  "ws://127.0.0.1:4455";

const OBS_PASSWORD =
  process.env.OBS_PASSWORD ||
  cfg.OBS_PASSWORD ||
  cfg.obsPassword ||
  "";

let AGENT_WS_URL =
  normalizeAgentWsUrl(
    process.env.AGENT_WS_URL ||
      cfg.AGENT_WS_URL ||
      cfg.agentWsUrl ||
      ""
  );

/** --- helpers: robust OBS call with fallback + better logging --- */
async function obsCallFirst(obs, names, data = {}) {
  let lastErr = null;

  for (const n of names) {
    try {
      return await obs.call(n, data);
    } catch (e) {
      lastErr = e;
      const msg = e?.message || String(e);
      const code = e?.code || e?.errorCode || e?.rpcCode || "";
      log(`[obs] call failed: ${n}`, { msg, code });
    }
  }

  throw lastErr || new Error("obs_call_failed");
}

function normRecordStatus(resp) {
  const outputActive = Boolean(resp?.outputActive ?? resp?.isRecording ?? resp?.recording ?? false);

  const outputPaused =
    typeof resp?.outputPaused === "boolean"
      ? resp.outputPaused
      : typeof resp?.isRecordingPaused === "boolean"
      ? resp.isRecordingPaused
      : undefined;

  const outputTimecode =
    typeof resp?.outputTimecode === "string"
      ? resp.outputTimecode
      : typeof resp?.recordTimecode === "string"
      ? resp.recordTimecode
      : undefined;

  return { outputActive, outputPaused, outputTimecode };
}

async function connectObs(obs, obsWsUrl, obsPassword) {
  if (!obsPassword) {
    log("[obs] OBS Passwort ist leer. Wenn OBS-Auth aktiv ist, trage ein Passwort ein (wird beim ersten Start abgefragt).");
  }

  for (;;) {
    try {
      log("[obs] connecting", obsWsUrl);
      await obs.connect(obsWsUrl, obsPassword, { rpcVersion: 1 });
      log("[obs] connected");
      return;
    } catch (e) {
      const msg = e?.message || String(e);
      log("[obs] connect failed", msg);

      if (!obsPassword && /authentication|auth|Identify/i.test(msg)) {
        log("[obs] AUTH REQUIRED: OBS Passwort fehlt. Bitte OBS -> Tools -> WebSocket Server Settings -> Server Password setzen.");
      }

      await sleep(1500);
    }
  }
}

async function main() {
  // Best-effort: portable self-registration (HKCU, no admin). Installer should do this anyway.
  trySelfRegisterUrlProtocol();

  // Deep link support (Dashboard -> Helper): clipboost://start?code=<token|url>&backend=<https://api...>
  const dl = parseDeepLinkFromArgv(process.argv);
  if (dl && dl.action && /obs/i.test(dl.action)) {
    // clipboost://obs? -> open OBS best-effort and exit
    const ok = tryOpenObsWin();
    log(ok ? "[deeplink] OBS gestartet" : "[deeplink] OBS konnte nicht gestartet werden");
    return;
  }

  // Use these variables so we can override them after first-run setup.
  let obsWsUrl = OBS_WS_URL;
  let obsPassword = OBS_PASSWORD;

  let deeplinkApplied = false;
  if (dl && dl.code) {
    try {
      if (dl.backendOrigin) process.env.CLIP_BOOST_BACKEND_ORIGIN = String(dl.backendOrigin).trim();

      // Apply to runtime
      AGENT_WS_URL = normalizeAgentWsUrl(dl.code);
      if (dl.obsWsUrl) obsWsUrl = String(dl.obsWsUrl).trim();
      if (dl.obsPassword) obsPassword = String(dl.obsPassword).trim();

      // Persist to primary path (AppData). If that fails, fallback to exe dir.
      const primaryPath = getPrimaryConfigPath();
      const fallbackPath = path.join(getExeDir(), "obs-agent.config.json");
      const toWrite = {
        agentWsUrl: AGENT_WS_URL,
        obsWsUrl,
        obsPassword,
        backendOrigin: getBackendOrigin(),
      };

      if (writeConfigSafely(primaryPath, toWrite)) {
        log("[deeplink] saved", primaryPath);
      } else if (writeConfigSafely(fallbackPath, toWrite)) {
        log("[deeplink] saved", fallbackPath);
      }

      deeplinkApplied = true;
    } catch (e) {
      log("[deeplink] apply failed", e?.message || String(e));
    }
  }

  // Auto-migration: Falls env/Config nur einen Token oder eine kaputte URL enthaelt,
  // speichern wir eine normalisierte WS-URL zurueck (reduziert Support-Faelle).
  try {
    const rawCandidate = process.env.AGENT_WS_URL || cfg.AGENT_WS_URL || cfg.agentWsUrl || "";
    const normalized = normalizeAgentWsUrl(rawCandidate);
    if (normalized && rawCandidate && normalized !== rawCandidate) {
      AGENT_WS_URL = normalized;
      const savePath = loaded.path || getPrimaryConfigPath();
      const toWrite = {
        agentWsUrl: AGENT_WS_URL,
        obsWsUrl: cfg.obsWsUrl || OBS_WS_URL,
        obsPassword: cfg.obsPassword || OBS_PASSWORD,
        backendOrigin: getBackendOrigin(),
      };
      if (writeConfigSafely(savePath, toWrite)) {
        log("[cfg] migrated agentWsUrl -> ws-url", savePath);
      }
    }
  } catch {
    // ignore migration failures
  }

  // If backend url missing: do interactive setup and store it.
  if (!AGENT_WS_URL && !deeplinkApplied) {
    const next = await ensureInteractiveConfig({
      agentWsUrl: cfg.agentWsUrl || "",
      obsWsUrl: cfg.obsWsUrl || OBS_WS_URL,
      obsPassword: cfg.obsPassword || OBS_PASSWORD,
    });

    // Persist to primary path (AppData). If that fails, fallback to exe dir.
    const primaryPath = getPrimaryConfigPath();
    const fallbackPath = path.join(getExeDir(), "obs-agent.config.json");

    const toWrite = {
      agentWsUrl: normalizeAgentWsUrl(next.agentWsUrl),
      obsWsUrl: next.obsWsUrl,
      obsPassword: next.obsPassword,
      backendOrigin: getBackendOrigin(),
    };

    if (writeConfigSafely(primaryPath, toWrite)) {
      log("[cfg] saved", primaryPath);
    } else if (writeConfigSafely(fallbackPath, toWrite)) {
      log("[cfg] saved", fallbackPath);
    } else {
      log("[cfg] WARN: Konnte config nicht speichern. Du musst beim Start evtl. erneut eingeben.");
    }

    // Apply
    AGENT_WS_URL = toWrite.agentWsUrl;
    obsWsUrl = next.obsWsUrl;
    obsPassword = next.obsPassword;
  }

  // Still validate
  if (!AGENT_WS_URL || !/^wss?:\/\//i.test(AGENT_WS_URL)) {
    throw new Error("AGENT_WS_URL missing/invalid (expected ws:// or wss://)");
  }

  const obs = new OBSWebSocket();

  // 1) OBS connect (retry loop)
  await connectObs(obs, obsWsUrl, obsPassword);

  // 2) Backend WS connect (retry loop)
  let ws = null;

  async function connectBackendForever() {
    for (;;) {
      try {
        log("[backend] connecting", AGENT_WS_URL);
        ws = new WebSocket(AGENT_WS_URL);

        await new Promise((resolve, reject) => {
          ws.on("open", resolve);
          ws.on("error", reject);
        });

        log("[backend] connected");

        // hello
        try {
          ws.send(
            JSON.stringify({
              type: "agent_hello",
              label: "obs-agent",
              version: "1.0.1",
              capabilities: {
                scenes: true,
                recording: true,
                recordMarker: true,
              },
              tsMs: Date.now(),
            })
          );
        } catch {}

        ws.on("message", async (buf) => {
          const raw = typeof buf === "string" ? buf : buf.toString("utf-8");
          const msg = safeJsonParse(raw);
          if (!msg || typeof msg !== "object") return;

          const type = String(msg.type || "");
          const requestId = msg.requestId ? String(msg.requestId) : "";

          // ping
          if (type === "agent_ping") {
            try {
              ws.send(JSON.stringify({ type: "agent_pong", requestId, tsMs: Date.now() }));
            } catch {}
            return;
          }

          // helper: reply
          const reply = (payload) => {
            try {
              ws.send(JSON.stringify(payload));
            } catch {}
          };

          try {
            // -------- Scenes --------
            if (type === "obs_get_scenes") {
              const list = await obsCallFirst(obs, ["GetSceneList"]);
              const cur = await obsCallFirst(obs, ["GetCurrentProgramScene"]).catch(() => ({}));

              reply({
                type: "obs_scenes",
                requestId,
                currentProgramSceneName: cur?.currentProgramSceneName || list?.currentProgramSceneName,
                scenes: Array.isArray(list?.scenes) ? list.scenes : [],
                tsMs: Date.now(),
              });
              return;
            }

            if (type === "obs_set_scene") {
              const sceneName = String(msg.sceneName || "").trim();
              if (!sceneName) {
                reply(mkRpcError(requestId, "bad_request", "sceneName missing"));
                return;
              }

              await obsCallFirst(obs, ["SetCurrentProgramScene"], { sceneName });
              reply({ type: "obs_set_scene_ok", requestId, sceneName, tsMs: Date.now() });
              return;
            }

            // -------- Recording (robust + idempotent) --------
            if (type === "obs_get_record_status") {
              try {
                const rawSt = await obsCallFirst(obs, ["GetRecordStatus", "GetRecordingStatus"]);
                const st = normRecordStatus(rawSt);
                reply({ type: "obs_record_status", requestId, ...st, tsMs: Date.now() });
              } catch (e) {
                const msg2 = e?.message || String(e);
                log("[obs] get_record_status failed", { msg: msg2 });
                reply({ type: "error", requestId, error: "obs_call_failed", message: msg2, tsMs: Date.now() });
              }
              return;
            }

            if (type === "obs_record_start") {
              try {
                await obsCallFirst(obs, ["StartRecord", "StartRecording"]);
                const rawSt = await obsCallFirst(obs, ["GetRecordStatus", "GetRecordingStatus"]).catch(() => ({}));
                const st = normRecordStatus(rawSt);
                reply({ type: "obs_record_started", requestId, ...st, tsMs: Date.now() });
              } catch (e) {
                const msg2 = e?.message || String(e);
                log("[obs] record_start failed", { msg: msg2 });
                reply({ type: "error", requestId, error: "obs_call_failed", message: msg2, tsMs: Date.now() });
              }
              return;
            }

            if (type === "obs_record_stop") {
              try {
                const beforeRaw = await obsCallFirst(obs, ["GetRecordStatus", "GetRecordingStatus"]);
                const before = normRecordStatus(beforeRaw);

                if (!before.outputActive) {
                  reply({ type: "obs_record_stopped", requestId, ...before, tsMs: Date.now() });
                  return;
                }

                await obsCallFirst(obs, ["StopRecord", "StopRecording"]);

                const afterRaw = await obsCallFirst(obs, ["GetRecordStatus", "GetRecordingStatus"]).catch(() => ({}));
                const after = normRecordStatus(afterRaw);
                reply({ type: "obs_record_stopped", requestId, ...after, tsMs: Date.now() });
              } catch (e) {
                const msg2 = e?.message || String(e);
                log("[obs] record_stop failed", { msg: msg2 });
                reply({ type: "error", requestId, error: "obs_call_failed", message: msg2, tsMs: Date.now() });
              }
              return;
            }

            if (type === "obs_record_toggle") {
              try {
                const beforeRaw = await obsCallFirst(obs, ["GetRecordStatus", "GetRecordingStatus"]).catch(() => ({}));
                const before = normRecordStatus(beforeRaw);

                try {
                  await obsCallFirst(obs, ["ToggleRecord", "ToggleRecording"]);
                } catch {
                  if (before.outputActive) {
                    await obsCallFirst(obs, ["StopRecord", "StopRecording"]);
                  } else {
                    await obsCallFirst(obs, ["StartRecord", "StartRecording"]);
                  }
                }

                const afterRaw = await obsCallFirst(obs, ["GetRecordStatus", "GetRecordingStatus"]).catch(() => ({}));
                const after = normRecordStatus(afterRaw);
                reply({ type: "obs_record_toggled", requestId, ...after, tsMs: Date.now() });
              } catch (e) {
                const msg2 = e?.message || String(e);
                log("[obs] record_toggle failed", { msg: msg2 });
                reply({ type: "error", requestId, error: "obs_call_failed", message: msg2, tsMs: Date.now() });
              }
              return;
            }

            if (type === "obs_record_marker") {
              const name = String(msg.name || "").trim();
              try {
                await obsCallFirst(obs, ["CreateRecordChapter"], name ? { chapterName: name } : {});
                reply({ type: "obs_record_marker_ok", requestId, name, tsMs: Date.now() });
              } catch (e) {
                const msg2 = e?.message || String(e);
                reply(mkRpcError(requestId, "marker_not_supported", msg2 || "CreateRecordChapter failed"));
              }
              return;
            }

            return;
          } catch (e) {
            reply(mkRpcError(requestId, "obs_call_failed", e?.message || String(e)));
          }
        });

        await new Promise((resolve) => {
          ws.on("close", resolve);
        });

        log("[backend] closed - will reconnect");
        await sleep(1500);
      } catch (e) {
        log("[backend] connect failed", e?.message || String(e));
        await sleep(1500);
      }
    }
  }

  // Graceful shutdown
  process.on("SIGINT", () => {
    try {
      ws?.close();
    } catch {}
    try {
      obs?.disconnect();
    } catch {}
    process.exit(0);
  });

  await connectBackendForever();
}

main().catch((e) => {
  console.error("[agent] fatal", e?.message || e);
  process.exit(1);
});
