import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const coordinate = v.object({ x: v.number(), y: v.number() });
const snake = v.object({
  id: v.string(),
  name: v.string(),
  health: v.number(),
  body: v.array(coordinate),
  head: coordinate,
  length: v.number(),
  latency: v.optional(v.string()),
  shout: v.optional(v.string()),
  squad: v.optional(v.string()),
});
const board = v.object({
  height: v.number(),
  width: v.number(),
  food: v.array(coordinate),
  hazards: v.array(coordinate),
  snakes: v.array(snake),
});
const ruleset = v.optional(
  v.object({
    name: v.optional(v.string()),
    version: v.optional(v.string()),
    settings: v.optional(
      v.object({
        foodSpawnChance: v.optional(v.number()),
        minimumFood: v.optional(v.number()),
        hazardDamagePerTurn: v.optional(v.number()),
        hazardMap: v.optional(v.string()),
      }),
    ),
  }),
);
const game = v.optional(
  v.object({
    id: v.optional(v.string()),
    ruleset,
    map: v.optional(v.string()),
    timeout: v.optional(v.number()),
  }),
);

const ADMIN_ENV_KEY = "BATTLESNAKE_ADMIN_PASSWORD";
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
type TestDoc = Doc<"tests">;
type RunTestResult =
  | {
      ok: true;
      move: string | null;
      shout: string | null;
      status: number;
      raw: unknown;
    }
  | {
      ok: false;
      error: string;
      status?: number;
      raw?: unknown;
    };

function requireAdminPassword(password: string) {
  const expected = process.env[ADMIN_ENV_KEY];
  if (!expected) {
    throw new Error(
      `Admin password not configured. Set ${ADMIN_ENV_KEY} in Convex env.`,
    );
  }
  if (password !== expected) {
    throw new Error("Invalid admin password.");
  }
}

async function requireAdminSession(
  ctx: { db: MutationCtx["db"] },
  token: string,
) {
  const session = await ctx.db
    .query("adminSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!session) {
    throw new Error("Admin session invalid. Sign in again.");
  }
  if (session.expiresAt < Date.now()) {
    await ctx.db.delete(session._id);
    throw new Error("Admin session expired. Sign in again.");
  }
}

export const listTests = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("tests")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
  },
});

export const getTest = query({
  args: { id: v.id("tests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createTest = mutation({
  args: {
    adminToken: v.string(),
    name: v.string(),
    board,
    game,
    turn: v.number(),
    youId: v.string(),
    expectedSafeMoves: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.adminToken);
    const youExists = args.board.snakes.some((snakeItem) => {
      return snakeItem.id === args.youId;
    });
    if (!youExists) {
      throw new Error("youId must match a snake in the board.");
    }
    const createdAt = Date.now();
    return await ctx.db.insert("tests", {
      name: args.name,
      board: args.board,
      game: args.game,
      turn: args.turn,
      youId: args.youId,
      expectedSafeMoves: args.expectedSafeMoves,
      createdAt,
    });
  },
});

export const updateTest = mutation({
  args: {
    adminToken: v.string(),
    id: v.id("tests"),
    name: v.string(),
    board,
    game,
    turn: v.number(),
    youId: v.string(),
    expectedSafeMoves: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.adminToken);
    const youExists = args.board.snakes.some((snakeItem) => {
      return snakeItem.id === args.youId;
    });
    if (!youExists) {
      throw new Error("youId must match a snake in the board.");
    }
    await ctx.db.patch(args.id, {
      name: args.name,
      board: args.board,
      game: args.game,
      turn: args.turn,
      youId: args.youId,
      expectedSafeMoves: args.expectedSafeMoves,
    });
  },
});

export const deleteTest = mutation({
  args: { adminToken: v.string(), id: v.id("tests") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.adminToken);
    await ctx.db.delete(args.id);
  },
});

export const verifyAdminPassword = mutation({
  args: { password: v.string(), clientId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limiter = await ctx.db
      .query("adminRateLimits")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .first();
    if (limiter?.blockedUntil && limiter.blockedUntil > now) {
      return {
        ok: false,
        error: "Too many attempts. Try again later.",
        retryAt: limiter.blockedUntil,
      };
    }
    const windowStart = limiter?.windowStart ?? now;
    const withinWindow = now - windowStart < RATE_LIMIT_WINDOW_MS;
    const attempts = withinWindow ? (limiter?.attempts ?? 0) : 0;

    try {
      requireAdminPassword(args.password);
    } catch (error) {
      const nextAttempts = attempts + 1;
      const blockedUntil =
        nextAttempts >= RATE_LIMIT_MAX_ATTEMPTS
          ? now + RATE_LIMIT_WINDOW_MS
          : undefined;
      if (limiter) {
        await ctx.db.patch(limiter._id, {
          windowStart: withinWindow ? windowStart : now,
          attempts: nextAttempts,
          blockedUntil,
        });
      } else {
        await ctx.db.insert("adminRateLimits", {
          clientId: args.clientId,
          windowStart: now,
          attempts: nextAttempts,
          blockedUntil,
        });
      }
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Invalid admin password.",
      };
    }

    if (limiter) {
      await ctx.db.patch(limiter._id, {
        windowStart: now,
        attempts: 0,
        blockedUntil: undefined,
      });
    } else {
      await ctx.db.insert("adminRateLimits", {
        clientId: args.clientId,
        windowStart: now,
        attempts: 0,
      });
    }

    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `admin-${Math.random().toString(36).slice(2)}`;
    const sessionId = await ctx.db.insert("adminSessions", {
      token,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
    return {
      ok: true,
      token,
      expiresAt: now + SESSION_TTL_MS,
      sessionId,
    };
  },
});

export const validateAdminSession = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("adminSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) {
      return { ok: false, error: "Session not found." };
    }
    if (session.expiresAt < Date.now()) {
      return { ok: false, error: "Session expired." };
    }
    return { ok: true, expiresAt: session.expiresAt };
  },
});

export const runTest = action({
  args: {
    testId: v.id("tests"),
    url: v.string(),
  },
  handler: async (ctx, args): Promise<RunTestResult> => {
    const test = (await ctx.runQuery(api.battlesnake.getTest, {
      id: args.testId,
    })) as TestDoc | null;
    if (!test) {
      return { ok: false, error: "Test not found." };
    }

    const you = test.board.snakes.find(
      (snakeItem: TestDoc["board"]["snakes"][number]) =>
        snakeItem.id === test.youId,
    );
    if (!you) {
      return { ok: false, error: "You snake not found in test." };
    }

    const rawUrl = args.url.trim();
    if (!rawUrl) {
      return { ok: false, error: "Bot URL is required." };
    }
    const normalizedUrl = rawUrl.replace(/\/+$/, "");
    const endpoint = normalizedUrl.endsWith("/move")
      ? normalizedUrl
      : `${normalizedUrl}/move`;

    const requestBody: {
      game: {
        id: string;
        ruleset: {
          name?: string;
          version?: string;
          settings?: {
            foodSpawnChance?: number;
            minimumFood?: number;
            hazardDamagePerTurn?: number;
            hazardMap?: string;
          };
        };
        map?: string;
        timeout?: number;
      };
      turn: number;
      board: TestDoc["board"];
      you: TestDoc["board"]["snakes"][number];
    } = {
      game: {
        id: test.game?.id ?? `test-${test._id}`,
        ruleset: test.game?.ruleset ?? {
          name: "standard",
          version: "1.0.0",
          settings: {
            foodSpawnChance: 0,
            minimumFood: 0,
            hazardDamagePerTurn: 100,
            hazardMap: "custom",
          },
        },
        map: test.game?.map ?? "custom",
        timeout: test.game?.timeout ?? 500,
      },
      turn: test.turn,
      board: test.board,
      you,
    };

    try {
      const response: Response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const responseText = await response.text();
      let data: unknown = null;
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (error) {
          return {
            ok: false,
            error: `Non-JSON response (${response.status}).`,
            status: response.status,
            raw: responseText,
          };
        }
      }
      if (!response.ok) {
        return {
          ok: false,
          error: `HTTP ${response.status}`,
          status: response.status,
          raw: data,
        };
      }
      const move =
        typeof (data as { move?: unknown })?.move === "string"
          ? (data as { move: string }).move
          : null;
      const shout =
        typeof (data as { shout?: unknown })?.shout === "string"
          ? (data as { shout: string }).shout
          : null;
      return {
        ok: true,
        move,
        shout,
        status: response.status,
        raw: data,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Request failed.",
      };
    }
  },
});
