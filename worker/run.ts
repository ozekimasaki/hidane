import { loadArtifact } from "./db.ts";

const DYNAMIC_COMPAT_DATE = "2026-06-18";

/**
 * Containment for browser-executed generated code:
 * - `sandbox allow-scripts` forces an opaque origin even on direct top-level
 *   navigation (no access to app cookies/localStorage/credentialed /api calls).
 * - `connect-src 'none'` blocks fetch/XHR/websocket exfiltration from the page.
 * - inline script/style are allowed because generated apps inline everything.
 */
const PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data:; font-src data:; connect-src 'none'; form-action 'none'; " +
  "base-uri 'none'; sandbox allow-scripts";

function previewHeaders(): HeadersInit {
  return {
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff",
    "content-security-policy": PREVIEW_CSP,
  };
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: previewHeaders() });
}

function messagePage(title: string, message: string, status = 200): Response {
  return htmlResponse(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;
font-family:system-ui,sans-serif;background:#140a04;color:#ffe9c7;text-align:center;padding:24px}
.box{max-width:360px}h1{color:#ffb347;font-size:1.1rem}</style></head>
<body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`,
    status,
  );
}

/**
 * Execute a stored artifact in a sandboxed Dynamic Worker (no network access)
 * and return its HTML. Falls back to stored static HTML when the Worker Loader
 * is unavailable.
 */
export async function executePreview(
  env: Env,
  sessionId: string,
  _request: Request,
): Promise<Response> {
  const artifact = await loadArtifact(env, sessionId);
  if (!artifact) {
    return messagePage("プレビューが見つかりません", "もう一度「火をつける」をお試しください。", 404);
  }

  if (env.LOADER) {
    try {
      const stub = env.LOADER.get(sessionId, () => ({
        compatibilityDate: DYNAMIC_COMPAT_DATE,
        mainModule: "main.js",
        modules: { "main.js": artifact.code },
        // Hard network isolation: the generated code cannot reach the Internet.
        globalOutbound: null,
      }));
      // Send a clean request so no caller cookies/headers leak into the sandbox.
      const sandboxedRequest = new Request("https://preview.tanebi.local/", { method: "GET" });
      const result = await stub.getEntrypoint().fetch(sandboxedRequest);
      const body = await result.text();
      // Force our own headers/content-type; don't trust the generated worker's.
      return new Response(body, { status: result.status, headers: previewHeaders() });
    } catch (err) {
      console.error("Dynamic Worker execution failed:", err);
      if (artifact.html) return htmlResponse(artifact.html);
      return messagePage("実行に失敗しました", "生成コードの実行でエラーが発生しました。もう一度お試しください。", 500);
    }
  }

  if (artifact.html) return htmlResponse(artifact.html);
  return messagePage("プレビュー準備中", "実行環境が利用できません。デプロイ環境でお試しください。");
}
