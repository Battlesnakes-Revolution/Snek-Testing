import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
  team: v.optional(v.string()),
  isKing: v.optional(v.boolean()),
  headEmoji: v.optional(v.string()),
  color: v.optional(v.string()),
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

const MONTHLY_ENGINE_LIMIT = 5;

function getCurrentMonth(): number {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth();
}

export const checkEngineAccess = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) {
      return { ok: false, error: "Session invalid.", canUse: false, usageRemaining: 0 };
    }
    if (session.expiresAt < Date.now()) {
      return { ok: false, error: "Session expired.", canUse: false, usageRemaining: 0 };
    }

    const user = await ctx.db.get(session.userId);
    if (!user) {
      return { ok: false, error: "User not found.", canUse: false, usageRemaining: 0 };
    }

    if (user.bannedFromEngine) {
      return { ok: false, error: "You are banned from using the engine.", canUse: false, usageRemaining: 0 };
    }

    if (user.isSuperAdmin) {
      return { ok: true, canUse: true, usageRemaining: -1 };
    }

    const currentMonth = getCurrentMonth();
    let usageCount = user.engineUsageCount ?? 0;

    if (user.engineUsageResetMonth !== currentMonth) {
      usageCount = 0;
    }

    const usageRemaining = MONTHLY_ENGINE_LIMIT - usageCount;

    return {
      ok: true,
      canUse: usageRemaining > 0,
      usageRemaining,
    };
  },
});

export const incrementEngineUsage = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) {
      return { ok: false, error: "Session invalid." };
    }

    const user = await ctx.db.get(session.userId);
    if (!user) {
      return { ok: false, error: "User not found." };
    }

    if (user.bannedFromEngine) {
      return { ok: false, error: "You are banned from using the engine." };
    }

    if (user.isSuperAdmin) {
      return { ok: true };
    }

    const currentMonth = getCurrentMonth();
    let usageCount = user.engineUsageCount ?? 0;

    if (user.engineUsageResetMonth !== currentMonth) {
      usageCount = 0;
    }

    if (usageCount >= MONTHLY_ENGINE_LIMIT) {
      return { ok: false, error: "Monthly engine usage limit reached (5 uses per month)." };
    }

    await ctx.db.patch(session.userId, {
      engineUsageCount: usageCount + 1,
      engineUsageResetMonth: currentMonth,
    });

    return { ok: true };
  },
});

export const analyseWithEngine = action({
  args: {
    token: v.string(),
    board,
    game,
    turn: v.number(),
    youId: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string; analysis?: unknown }> => {
    const engineUrl = process.env.ENGINE_ANALYSE_URL;
    const enginePassword = process.env.ENGINE_ANALYSE_PASSWORD;

    if (!engineUrl) {
      return { ok: false, error: "Engine URL is not configured." };
    }

    const youSnake = args.board.snakes.find(s => s.id === args.youId);
    if (!youSnake) {
      return { ok: false, error: "Could not find your snake on the board." };
    }

    const usageResult = await ctx.runMutation("engine:incrementEngineUsage" as any, { token: args.token });
    if (!usageResult.ok) {
      return { ok: false, error: usageResult.error };
    }

    try {
      const payload = {
        game: args.game ?? { id: "test", ruleset: { name: "standard", version: "v1.1.0" }, timeout: 500 },
        turn: args.turn,
        board: args.board,
        you: youSnake,
        passwrd: enginePassword,
      };

      const response = await fetch(engineUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return { ok: false, error: `Engine returned status ${response.status}` };
      }

      const analysis = await response.json();

      return { ok: true, analysis };
    } catch (error) {
      return { ok: false, error: `Failed to contact engine: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
});
