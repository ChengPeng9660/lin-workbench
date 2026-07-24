/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const WORKSPACE_SCHEMA = `CREATE TABLE IF NOT EXISTS workspace_state (
  user_id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function handleWorkspaceSync(request: Request, env: Env): Promise<Response> {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) return json({ error: "è¯·å…ˆç™»å½•åŽå†åŒæ­¥" }, 401);

  await env.DB.prepare(WORKSPACE_SCHEMA).run();

  if (request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT payload, updated_at FROM workspace_state WHERE user_id = ?",
    ).bind(email).first<{ payload: string; updated_at: number }>();

    return json({
      user: email,
      state: row ? JSON.parse(row.payload) : null,
      updatedAt: row?.updated_at ?? null,
    });
  }

  if (request.method === "PUT") {
    const raw = await request.text();
    if (raw.length > 1_000_000) return json({ error: "è®°å½•å†…å®¹è¿‡å¤§" }, 413);

    let body: { state?: unknown };
    try {
      body = JSON.parse(raw) as { state?: unknown };
    } catch {
      return json({ error: "æ— æ•ˆçš„æ•°æ®æ ¼å¼" }, 400);
    }
    if (!body.state || typeof body.state !== "object") {
      return json({ error: "ç¼ºå°‘åŒæ­¥å†…å®¹" }, 400);
    }

    const updatedAt = Date.now();
    await env.DB.prepare(
      `INSERT INTO workspace_state (user_id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    ).bind(email, JSON.stringify(body.state), updatedAt).run();

    return json({ ok: true, user: email, updatedAt });
  }

  return json({ error: "ä¸æ”¯æŒçš„è¯·æ±‚" }, 405);
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === "/api/sync") {
      return handleWorkspaceSync(request, env);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

