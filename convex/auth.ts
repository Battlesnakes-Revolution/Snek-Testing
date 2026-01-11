import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import bcrypt from "bcryptjs";
import * as jose from "jose";

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

export const googleSignIn = action({
  args: {
    credential: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string; token?: string; user?: { id: string; email: string; username: string; isAdmin: boolean } }> => {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("VITE_GOOGLE_CLIENT_ID not set in Convex environment");
      return { ok: false, error: "Google sign-in is not configured. Please set VITE_GOOGLE_CLIENT_ID in Convex dashboard." };
    }

    let payload: jose.JWTPayload;
    try {
      const jwks = jose.createRemoteJWKSet(
        new URL("https://www.googleapis.com/oauth2/v3/certs")
      );
      const { payload: verifiedPayload } = await jose.jwtVerify(
        args.credential,
        jwks,
        {
          issuer: ["https://accounts.google.com", "accounts.google.com"],
          audience: clientId,
        }
      );
      payload = verifiedPayload;
    } catch (err) {
      console.error("JWT verification error:", err);
      return { ok: false, error: "Invalid Google credential. Please try again." };
    }

    const sub = payload.sub as string | undefined;
    const email = payload.email as string | undefined;
    const name = (payload.name as string) || (email ? email.split("@")[0] : "user");

    if (!sub || !email) {
      return { ok: false, error: "Invalid Google credential - missing user info." };
    }

    try {
      const result = await ctx.runMutation(internal.auth.createGoogleSession, {
        googleId: sub,
        email,
        name,
      });
      return result;
    } catch (err) {
      console.error("Session creation error:", err);
      return { ok: false, error: "Failed to create session. Please try again." };
    }
  },
});

export const createGoogleSession = internalMutation({
  args: {
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const emailLower = args.email.toLowerCase().trim();
    
    let user = await ctx.db
      .query("users")
      .withIndex("by_googleId", (q) => q.eq("googleId", args.googleId))
      .first();

    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_emailLower", (q) => q.eq("emailLower", emailLower))
        .first();
      
      if (user) {
        await ctx.db.patch(user._id, { googleId: args.googleId, googleName: args.name });
      }
    }

    const now = Date.now();

    if (!user) {
      const username = args.name.replace(/\s+/g, "_").toLowerCase().slice(0, 20) + "_" + Math.random().toString(36).slice(2, 6);
      
      const userId = await ctx.db.insert("users", {
        email: args.email.trim(),
        emailLower,
        username,
        isAdmin: false,
        createdAt: now,
        googleId: args.googleId,
        googleName: args.name,
      });
      
      user = await ctx.db.get(userId);
    } else {
      await ctx.db.patch(user._id, { googleName: args.name });
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

    if (!user.passwordHash) {
      await recordFailedAttempt(ctx, args.clientId);
      return { ok: false, error: "This account uses Google sign-in. Please sign in with Google." };
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
