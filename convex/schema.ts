import { defineSchema, defineTable } from "convex/server";
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

export default defineSchema({
  tests: defineTable({
    name: v.string(),
    board,
    game,
    turn: v.number(),
    youId: v.string(),
    expectedSafeMoves: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),
  adminSessions: defineTable({
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),
  adminRateLimits: defineTable({
    clientId: v.string(),
    windowStart: v.number(),
    attempts: v.number(),
    blockedUntil: v.optional(v.number()),
  }).index("by_clientId", ["clientId"]),
});
