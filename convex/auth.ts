import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import bcrypt from "bcryptjs";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

async function checkRateLimit(
  ctx: { db: MutationCtx["db"] },
  clientId: string
): Promise<{ blocked: boolean; retryAt?: number }> {
  const now = Date.now();
  const limiter = await ctx.db
    .query("adminRateLimits")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .first();
  
  if (limiter?.blockedUntil && limiter.blockedUntil > now) {
    return { blocked: true, retryAt: limiter.blockedUntil };
  }
  return { blocked: false };
}

async function recordFailedAttempt(
  ctx: { db: MutationCtx["db"] },
  clientId: string
): Promise<{ blocked: boolean; retryAt?: number }> {
  const now = Date.now();
  const limiter = await ctx.db
    .query("adminRateLimits")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .first();

  const windowStart = limiter?.windowStart ?? now;
  const withinWindow = now - windowStart < RATE_LIMIT_WINDOW_MS;
  const attempts = withinWindow ? (limiter?.attempts ?? 0) : 0;
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
      clientId,
      windowStart: now,
      attempts: nextAttempts,
      blockedUntil,
    });
  }

  return { blocked: !!blockedUntil, retryAt: blockedUntil };
}

async function resetRateLimit(
  ctx: { db: MutationCtx["db"] },
  clientId: string
) {
  const now = Date.now();
  const limiter = await ctx.db
    .query("adminRateLimits")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .first();

  if (limiter) {
    await ctx.db.patch(limiter._id, {
      windowStart: now,
      attempts: 0,
      blockedUntil: undefined,
    });
  }
}

export const register = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    username: v.string(),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const rateCheck = await checkRateLimit(ctx, args.clientId);
    if (rateCheck.blocked) {
      return { ok: false, error: "Too many attempts. Try again later.", retryAt: rateCheck.retryAt };
    }

    const emailLower = args.email.toLowerCase().trim();
    const username = args.username.trim();

    if (!emailLower || !emailLower.includes("@")) {
      return { ok: false, error: "Please enter a valid email address." };
    }
    if (!username || username.length < 2) {
      return { ok: false, error: "Username must be at least 2 characters." };
    }
    if (!args.password || args.password.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters." };
    }

    const existingEmail = await ctx.db
      .query("users")
      .withIndex("by_emailLower", (q) => q.eq("emailLower", emailLower))
      .first();
    if (existingEmail) {
      return { ok: false, error: "An account with this email already exists." };
    }

    const existingUsername = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (existingUsername) {
      return { ok: false, error: "This username is already taken." };
    }

    const passwordHash = bcrypt.hashSync(args.password, 10);
    const now = Date.now();

    const userId = await ctx.db.insert("users", {
      email: args.email.trim(),
      emailLower,
      passwordHash,
      username,
      isAdmin: false,
      createdAt: now,
    });

    const token = crypto.randomUUID();
    await ctx.db.insert("userSessions", {
      userId,
      token,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });

    await resetRateLimit(ctx, args.clientId);

    const user = await ctx.db.get(userId);
    return {
      ok: true,
      token,
      user: user ? { id: user._id, email: user.email, username: user.username, isAdmin: user.isAdmin } : null,
    };
  },
});

export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const rateCheck = await checkRateLimit(ctx, args.clientId);
    if (rateCheck.blocked) {
      return { ok: false, error: "Too many attempts. Try again later.", retryAt: rateCheck.retryAt };
    }

    const emailLower = args.email.toLowerCase().trim();
    const user = await ctx.db
      .query("users")
      .withIndex("by_emailLower", (q) => q.eq("emailLower", emailLower))
      .first();

    if (!user) {
      await recordFailedAttempt(ctx, args.clientId);
      return { ok: false, error: "Invalid email or password." };
    }

    const valid = bcrypt.compareSync(args.password, user.passwordHash);
    if (!valid) {
      await recordFailedAttempt(ctx, args.clientId);
      return { ok: false, error: "Invalid email or password." };
    }

    await resetRateLimit(ctx, args.clientId);

    const now = Date.now();
    const token = crypto.randomUUID();
    await ctx.db.insert("userSessions", {
      userId: user._id,
      token,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });

    return {
      ok: true,
      token,
      user: { id: user._id, email: user.email, username: user.username, isAdmin: user.isAdmin },
    };
  },
});

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { ok: true };
  },
});

export const getCurrentUser = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const token = args.token;
    if (!token) {
      return null;
    }
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!session || session.expiresAt < Date.now()) {
      return null;
    }
    const user = await ctx.db.get(session.userId);
    if (!user) {
      return null;
    }
    return { id: user._id, email: user.email, username: user.username, isAdmin: user.isAdmin };
  },
});

export async function requireUserSession(
  ctx: { db: QueryCtx["db"] },
  token: string
): Promise<{ userId: string; isAdmin: boolean }> {
  const session = await ctx.db
    .query("userSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!session) {
    throw new Error("Session invalid. Please log in again.");
  }
  if (session.expiresAt < Date.now()) {
    throw new Error("Session expired. Please log in again.");
  }
  const user = await ctx.db.get(session.userId);
  if (!user) {
    throw new Error("User not found. Please log in again.");
  }
  return { userId: user._id, isAdmin: user.isAdmin };
}

export async function requireAdmin(
  ctx: { db: QueryCtx["db"] },
  token: string
): Promise<{ userId: string }> {
  const { userId, isAdmin } = await requireUserSession(ctx, token);
  if (!isAdmin) {
    throw new Error("Admin access required.");
  }
  return { userId };
}
