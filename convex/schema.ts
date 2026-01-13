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

export default defineSchema({
  users: defineTable({
    email: v.string(),
    emailLower: v.string(),
    passwordHash: v.optional(v.string()),
    username: v.string(),
    isAdmin: v.boolean(),
    createdAt: v.number(),
    googleId: v.optional(v.string()),
    googleName: v.optional(v.string()),
  })
    .index("by_emailLower", ["emailLower"])
    .index("by_username", ["username"])
    .index("by_googleId", ["googleId"]),

  userSessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  tests: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    board,
    game,
    turn: v.number(),
    youId: v.string(),
    expectedSafeMoves: v.array(v.string()),
    createdAt: v.number(),
    ownerId: v.optional(v.id("users")),
    status: v.optional(v.union(v.literal("approved"), v.literal("pending"), v.literal("rejected"), v.literal("private"))),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    permaRejected: v.optional(v.boolean()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_ownerId", ["ownerId"])
    .index("by_status", ["status"]),

  collections: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    ownerId: v.id("users"),
    isPublic: v.boolean(),
    shareSlug: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_shareSlug", ["shareSlug"]),

  collectionTests: defineTable({
    collectionId: v.id("collections"),
    testId: v.id("tests"),
    addedAt: v.number(),
  })
    .index("by_collectionId", ["collectionId"])
    .index("by_testId", ["testId"]),

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

  testRuns: defineTable({
    testId: v.id("tests"),
    userId: v.id("users"),
    botUrl: v.string(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    move: v.optional(v.string()),
    shout: v.optional(v.string()),
    passed: v.optional(v.boolean()),
    error: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    rawResponse: v.optional(v.string()),
    responseTimeMs: v.optional(v.number()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_testId", ["testId"])
    .index("by_status", ["status"]),
});
