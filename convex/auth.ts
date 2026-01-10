import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";

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
  handler: async () => {
    return { ok: false, error: "Registration with email and password is no longer available. Please sign in with Google." };
  },
});

export const googleSignIn = mutation({
  args: {
    credential: v.string(),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return { ok: false, error: "Google sign-in is not configured." };
    }

    const client = new OAuth2Client(clientId);
    
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: args.credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      return { ok: false, error: "Invalid Google credential." };
    }

    if (!payload || !payload.sub || !payload.email) {
      return { ok: false, error: "Invalid Google credential." };
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || email.split("@")[0];
    const emailLower = email.toLowerCase().trim();
    
    let user = await ctx.db
      .query("users")
      .withIndex("by_googleId", (q) => q.eq("googleId", googleId))
      .first();

    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_emailLower", (q) => q.eq("emailLower", emailLower))
        .first();
      
      if (user) {
        await ctx.db.patch(user._id, { googleId });
      }
    }

    const now = Date.now();

    if (!user) {
      const username = name.replace(/\s+/g, "_").toLowerCase().slice(0, 20) + "_" + Math.random().toString(36).slice(2, 6);
      
      const userId = await ctx.db.insert("users", {
        email: email.trim(),
        emailLower,
        passwordHash: "",
        username,
        isAdmin: false,
        createdAt: now,
        googleId,
      });
      
      user = await ctx.db.get(userId);
    }

    if (!user) {
      return { ok: false, error: "Failed to create or find user." };
    }

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
