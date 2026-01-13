import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserSession, requireAdmin } from "./auth";

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
  headEmoji: v.optional(v.string()),
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
    description: v.optional(v.string()),
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
    const id = await ctx.db.insert("tests", {
      name: args.name,
      description: args.description,
      board: args.board,
      game: args.game,
      turn: args.turn,
      youId: args.youId,
      expectedSafeMoves: args.expectedSafeMoves,
      createdAt,
    });
    return await ctx.db.get(id);
  },
});

export const updateTest = mutation({
  args: {
    adminToken: v.string(),
    id: v.id("tests"),
    name: v.string(),
    description: v.optional(v.string()),
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
      description: args.description,
      board: args.board,
      game: args.game,
      turn: args.turn,
      youId: args.youId,
      expectedSafeMoves: args.expectedSafeMoves,
    });
    return await ctx.db.get(args.id);
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

export const listPublicTests = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("tests")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .order("desc")
      .collect();
  },
});

export const listPendingTests = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const tests = await ctx.db
      .query("tests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();
    const testsWithSubmitter = await Promise.all(
      tests.map(async (test) => {
        let submitterName: string | undefined;
        if (test.ownerId) {
          const owner = await ctx.db.get(test.ownerId);
          submitterName = owner?.googleName || owner?.username || owner?.email;
        }
        return { ...test, submitterName };
      })
    );
    return testsWithSubmitter;
  },
});

export const listMyTests = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    return await ctx.db
      .query("tests")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", userId as Id<"users">))
      .order("desc")
      .collect();
  },
});

export const createUserTest = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    board,
    game,
    turn: v.number(),
    youId: v.string(),
    expectedSafeMoves: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const youExists = args.board.snakes.some((snakeItem) => {
      return snakeItem.id === args.youId;
    });
    if (!youExists) {
      throw new Error("youId must match a snake in the board.");
    }
    const createdAt = Date.now();
    const id = await ctx.db.insert("tests", {
      name: args.name,
      description: args.description,
      board: args.board,
      game: args.game,
      turn: args.turn,
      youId: args.youId,
      expectedSafeMoves: args.expectedSafeMoves,
      createdAt,
      ownerId: userId as Id<"users">,
      status: "pending",
    });
    return await ctx.db.get(id);
  },
});

export const updateUserTest = mutation({
  args: {
    token: v.string(),
    id: v.id("tests"),
    name: v.string(),
    description: v.optional(v.string()),
    board,
    game,
    turn: v.number(),
    youId: v.string(),
    expectedSafeMoves: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const test = await ctx.db.get(args.id);
    if (!test) {
      throw new Error("Test not found.");
    }
    if (test.ownerId !== userId) {
      throw new Error("You don't have permission to edit this test.");
    }
    const youExists = args.board.snakes.some((snakeItem) => {
      return snakeItem.id === args.youId;
    });
    if (!youExists) {
      throw new Error("youId must match a snake in the board.");
    }
    await ctx.db.patch(args.id, {
      name: args.name,
      description: args.description,
      board: args.board,
      game: args.game,
      turn: args.turn,
      youId: args.youId,
      expectedSafeMoves: args.expectedSafeMoves,
      status: "pending",
    });
    return await ctx.db.get(args.id);
  },
});

export const adminUpdateTest = mutation({
  args: {
    token: v.string(),
    id: v.id("tests"),
    name: v.string(),
    description: v.optional(v.string()),
    board,
    game,
    turn: v.number(),
    youId: v.string(),
    expectedSafeMoves: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { isAdmin } = await requireUserSession(ctx, args.token);
    if (!isAdmin) {
      throw new Error("Admin access required.");
    }
    const test = await ctx.db.get(args.id);
    if (!test) {
      throw new Error("Test not found.");
    }
    const youExists = args.board.snakes.some((snakeItem) => {
      return snakeItem.id === args.youId;
    });
    if (!youExists) {
      throw new Error("youId must match a snake in the board.");
    }
    await ctx.db.patch(args.id, {
      name: args.name,
      description: args.description,
      board: args.board,
      game: args.game,
      turn: args.turn,
      youId: args.youId,
      expectedSafeMoves: args.expectedSafeMoves,
    });
    return await ctx.db.get(args.id);
  },
});

export const deleteUserTest = mutation({
  args: { token: v.string(), id: v.id("tests") },
  handler: async (ctx, args) => {
    const { userId, isAdmin } = await requireUserSession(ctx, args.token);
    const test = await ctx.db.get(args.id);
    if (!test) {
      throw new Error("Test not found.");
    }
    if (test.ownerId !== userId && !isAdmin) {
      throw new Error("You don't have permission to delete this test.");
    }
    const collectionTests = await ctx.db
      .query("collectionTests")
      .withIndex("by_testId", (q) => q.eq("testId", args.id))
      .collect();
    for (const ct of collectionTests) {
      await ctx.db.delete(ct._id);
    }
    await ctx.db.delete(args.id);
  },
});

export const approveTest = mutation({
  args: { token: v.string(), id: v.id("tests") },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx, args.token);
    const test = await ctx.db.get(args.id);
    if (!test) {
      throw new Error("Test not found.");
    }
    await ctx.db.patch(args.id, {
      status: "approved",
      approvedBy: userId as Id<"users">,
      approvedAt: Date.now(),
      rejectionReason: undefined,
    });
    return await ctx.db.get(args.id);
  },
});

export const rejectTest = mutation({
  args: { token: v.string(), id: v.id("tests"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const test = await ctx.db.get(args.id);
    if (!test) {
      throw new Error("Test not found.");
    }
    await ctx.db.patch(args.id, {
      status: "rejected",
      rejectionReason: args.reason,
    });
    return await ctx.db.get(args.id);
  },
});

export const permaRejectTest = mutation({
  args: { token: v.string(), id: v.id("tests"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const test = await ctx.db.get(args.id);
    if (!test) {
      throw new Error("Test not found.");
    }
    await ctx.db.patch(args.id, {
      status: "rejected",
      rejectionReason: args.reason,
      permaRejected: true,
    });
    return await ctx.db.get(args.id);
  },
});

export const resubmitTest = mutation({
  args: { token: v.string(), id: v.id("tests") },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const test = await ctx.db.get(args.id);
    if (!test) {
      throw new Error("Test not found.");
    }
    if (test.ownerId !== userId) {
      throw new Error("You don't have permission to resubmit this test.");
    }
    if (test.status !== "rejected") {
      throw new Error("Only rejected tests can be resubmitted.");
    }
    if (test.permaRejected) {
      throw new Error("This test has been permanently rejected and cannot be resubmitted.");
    }
    await ctx.db.patch(args.id, {
      status: "pending",
      rejectionReason: undefined,
    });
    return await ctx.db.get(args.id);
  },
});

export const makeTestPrivate = mutation({
  args: { token: v.string(), id: v.id("tests") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const test = await ctx.db.get(args.id);
    if (!test) {
      throw new Error("Test not found.");
    }
    await ctx.db.patch(args.id, {
      status: "private",
    });
    return await ctx.db.get(args.id);
  },
});

export const listRejectedTests = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const tests = await ctx.db
      .query("tests")
      .withIndex("by_status", (q) => q.eq("status", "rejected"))
      .order("desc")
      .collect();
    const testsWithSubmitter = await Promise.all(
      tests.map(async (test) => {
        let submitterName: string | undefined;
        if (test.ownerId) {
          const owner = await ctx.db.get(test.ownerId);
          submitterName = owner?.googleName || owner?.username || owner?.email;
        }
        return { ...test, submitterName };
      })
    );
    return testsWithSubmitter;
  },
});

export const listPrivateTests = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.token);
    const tests = await ctx.db
      .query("tests")
      .withIndex("by_status", (q) => q.eq("status", "private"))
      .order("desc")
      .collect();
    const testsWithSubmitter = await Promise.all(
      tests.map(async (test) => {
        let submitterName: string | undefined;
        if (test.ownerId) {
          const owner = await ctx.db.get(test.ownerId);
          submitterName = owner?.googleName || owner?.username || owner?.email;
        }
        return { ...test, submitterName };
      })
    );
    return testsWithSubmitter;
  },
});

function generateSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug = "";
  for (let i = 0; i < 8; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

export const listCollections = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    return await ctx.db
      .query("collections")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", userId as Id<"users">))
      .order("desc")
      .collect();
  },
});

export const createCollection = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const now = Date.now();
    const shareSlug = generateSlug();
    const id = await ctx.db.insert("collections", {
      name: args.name,
      description: args.description,
      ownerId: userId as Id<"users">,
      isPublic: args.isPublic,
      shareSlug,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

export const updateCollection = mutation({
  args: {
    token: v.string(),
    id: v.id("collections"),
    name: v.string(),
    description: v.optional(v.string()),
    isPublic: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const collection = await ctx.db.get(args.id);
    if (!collection) {
      throw new Error("Collection not found.");
    }
    if (collection.ownerId !== userId) {
      throw new Error("You don't have permission to edit this collection.");
    }
    await ctx.db.patch(args.id, {
      name: args.name,
      description: args.description,
      isPublic: args.isPublic,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.id);
  },
});

export const deleteCollection = mutation({
  args: { token: v.string(), id: v.id("collections") },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const collection = await ctx.db.get(args.id);
    if (!collection) {
      throw new Error("Collection not found.");
    }
    if (collection.ownerId !== userId) {
      throw new Error("You don't have permission to delete this collection.");
    }
    const collectionTests = await ctx.db
      .query("collectionTests")
      .withIndex("by_collectionId", (q) => q.eq("collectionId", args.id))
      .collect();
    for (const ct of collectionTests) {
      await ctx.db.delete(ct._id);
    }
    await ctx.db.delete(args.id);
  },
});

export const regenerateShareSlug = mutation({
  args: { token: v.string(), id: v.id("collections") },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const collection = await ctx.db.get(args.id);
    if (!collection) {
      throw new Error("Collection not found.");
    }
    if (collection.ownerId !== userId) {
      throw new Error("You don't have permission to modify this collection.");
    }
    const newSlug = generateSlug();
    await ctx.db.patch(args.id, {
      shareSlug: newSlug,
      updatedAt: Date.now(),
    });
    return { shareSlug: newSlug };
  },
});

export const addTestToCollection = mutation({
  args: { token: v.string(), collectionId: v.id("collections"), testId: v.id("tests") },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const collection = await ctx.db.get(args.collectionId);
    if (!collection) {
      throw new Error("Collection not found.");
    }
    if (collection.ownerId !== userId) {
      throw new Error("You don't have permission to modify this collection.");
    }
    const test = await ctx.db.get(args.testId);
    if (!test) {
      throw new Error("Test not found.");
    }
    if (test.ownerId !== userId && test.status !== "approved") {
      throw new Error("You can only add your own tests or public tests to collections.");
    }
    const existing = await ctx.db
      .query("collectionTests")
      .withIndex("by_collectionId", (q) => q.eq("collectionId", args.collectionId))
      .filter((q) => q.eq(q.field("testId"), args.testId))
      .first();
    if (existing) {
      throw new Error("Test is already in this collection.");
    }
    await ctx.db.insert("collectionTests", {
      collectionId: args.collectionId,
      testId: args.testId,
      addedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const removeTestFromCollection = mutation({
  args: { token: v.string(), collectionId: v.id("collections"), testId: v.id("tests") },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const collection = await ctx.db.get(args.collectionId);
    if (!collection) {
      throw new Error("Collection not found.");
    }
    if (collection.ownerId !== userId) {
      throw new Error("You don't have permission to modify this collection.");
    }
    const ct = await ctx.db
      .query("collectionTests")
      .withIndex("by_collectionId", (q) => q.eq("collectionId", args.collectionId))
      .filter((q) => q.eq(q.field("testId"), args.testId))
      .first();
    if (ct) {
      await ctx.db.delete(ct._id);
    }
    return { ok: true };
  },
});

export const getCollectionTests = query({
  args: { token: v.string(), collectionId: v.id("collections") },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const collection = await ctx.db.get(args.collectionId);
    if (!collection) {
      throw new Error("Collection not found.");
    }
    if (collection.ownerId !== userId) {
      throw new Error("You don't have permission to view this collection.");
    }
    const collectionTests = await ctx.db
      .query("collectionTests")
      .withIndex("by_collectionId", (q) => q.eq("collectionId", args.collectionId))
      .collect();
    const tests = [];
    for (const ct of collectionTests) {
      const test = await ctx.db.get(ct.testId);
      if (test) {
        tests.push(test);
      }
    }
    return tests;
  },
});

export const getCollectionBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const collection = await ctx.db
      .query("collections")
      .withIndex("by_shareSlug", (q) => q.eq("shareSlug", args.slug))
      .first();
    if (!collection) {
      return null;
    }
    if (!collection.isPublic) {
      return null;
    }
    const owner = await ctx.db.get(collection.ownerId);
    const collectionTests = await ctx.db
      .query("collectionTests")
      .withIndex("by_collectionId", (q) => q.eq("collectionId", collection._id))
      .collect();
    const tests = [];
    for (const ct of collectionTests) {
      const test = await ctx.db.get(ct.testId);
      if (test) {
        tests.push(test);
      }
    }
    return {
      collection: {
        ...collection,
        ownerName: owner?.username ?? "Unknown",
      },
      tests,
    };
  },
});

export const startTestRun = mutation({
  args: {
    token: v.string(),
    testId: v.id("tests"),
    botUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const test = await ctx.db.get(args.testId);
    if (!test) {
      throw new Error("Test not found.");
    }
    const runId = await ctx.db.insert("testRuns", {
      testId: args.testId,
      userId: userId as Id<"users">,
      botUrl: args.botUrl,
      status: "running",
      startedAt: Date.now(),
    });
    return { runId };
  },
});

export const getTestRun = query({
  args: { runId: v.id("testRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const executeTestRun = action({
  args: {
    runId: v.id("testRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(api.battlesnake.getTestRun, { runId: args.runId });
    if (!run) {
      return { ok: false, error: "Test run not found." };
    }
    if (run.status !== "running") {
      return { ok: false, error: "Test run is not in running state." };
    }

    const test = (await ctx.runQuery(api.battlesnake.getTest, {
      id: run.testId,
    })) as TestDoc | null;
    if (!test) {
      await ctx.runMutation(internal.battlesnake.updateTestRunResult, {
        runId: args.runId,
        status: "failed",
        error: "Test not found.",
      });
      return { ok: false, error: "Test not found." };
    }

    const you = test.board.snakes.find(
      (snakeItem: TestDoc["board"]["snakes"][number]) =>
        snakeItem.id === test.youId,
    );
    if (!you) {
      await ctx.runMutation(internal.battlesnake.updateTestRunResult, {
        runId: args.runId,
        status: "failed",
        error: "You snake not found in test.",
      });
      return { ok: false, error: "You snake not found in test." };
    }

    const rawUrl = run.botUrl.trim();
    if (!rawUrl) {
      await ctx.runMutation(internal.battlesnake.updateTestRunResult, {
        runId: args.runId,
        status: "failed",
        error: "Bot URL is required.",
      });
      return { ok: false, error: "Bot URL is required." };
    }
    const normalizedUrl = rawUrl.replace(/\/+$/, "");
    const endpoint = normalizedUrl.endsWith("/move")
      ? normalizedUrl
      : `${normalizedUrl}/move`;

    const requestBody = {
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
      const fetchStart = Date.now();
      const response: Response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const responseTimeMs = Date.now() - fetchStart;
      const responseText = await response.text();
      let data: unknown = null;
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          await ctx.runMutation(internal.battlesnake.updateTestRunResult, {
            runId: args.runId,
            status: "failed",
            error: `Non-JSON response (${response.status}).`,
            httpStatus: response.status,
            rawResponse: responseText.slice(0, 1000),
            responseTimeMs,
          });
          return { ok: false, error: `Non-JSON response (${response.status}).` };
        }
      }
      if (!response.ok) {
        await ctx.runMutation(internal.battlesnake.updateTestRunResult, {
          runId: args.runId,
          status: "failed",
          error: `HTTP ${response.status}`,
          httpStatus: response.status,
          rawResponse: JSON.stringify(data).slice(0, 1000),
          responseTimeMs,
        });
        return { ok: false, error: `HTTP ${response.status}` };
      }
      const move =
        typeof (data as { move?: unknown })?.move === "string"
          ? (data as { move: string }).move
          : null;
      const shout =
        typeof (data as { shout?: unknown })?.shout === "string"
          ? (data as { shout: string }).shout
          : null;
      
      const passed = move !== null && test.expectedSafeMoves.includes(move);
      
      await ctx.runMutation(internal.battlesnake.updateTestRunResult, {
        runId: args.runId,
        status: "completed",
        move: move ?? undefined,
        shout: shout ?? undefined,
        passed,
        httpStatus: response.status,
        rawResponse: JSON.stringify(data).slice(0, 1000),
        responseTimeMs,
      });
      return { ok: true, move, shout, passed, responseTimeMs };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Request failed.";
      await ctx.runMutation(internal.battlesnake.updateTestRunResult, {
        runId: args.runId,
        status: "failed",
        error: errorMsg,
      });
      return { ok: false, error: errorMsg };
    }
  },
});

export const updateTestRunResult = internalMutation({
  args: {
    runId: v.id("testRuns"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    move: v.optional(v.string()),
    shout: v.optional(v.string()),
    passed: v.optional(v.boolean()),
    error: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    rawResponse: v.optional(v.string()),
    responseTimeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      move: args.move,
      shout: args.shout,
      passed: args.passed,
      error: args.error,
      httpStatus: args.httpStatus,
      rawResponse: args.rawResponse,
      responseTimeMs: args.responseTimeMs,
      completedAt: Date.now(),
    });
  },
});

export const listUserTestRuns = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { userId } = await requireUserSession(ctx, args.token);
    const runs = await ctx.db
      .query("testRuns")
      .withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
      .order("desc")
      .take(args.limit ?? 50);
    return runs;
  },
});
