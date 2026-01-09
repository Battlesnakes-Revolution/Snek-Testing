import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import bcrypt from "bcryptjs";

export const createAdminUser = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    username: v.string(),
    adminSecret: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedSecret = process.env.BATTLESNAKE_ADMIN_PASSWORD;
    if (!expectedSecret) {
      throw new Error("Admin password not configured.");
    }
    if (args.adminSecret !== expectedSecret) {
      throw new Error("Invalid admin secret.");
    }

    const emailLower = args.email.toLowerCase().trim();
    const existingEmail = await ctx.db
      .query("users")
      .withIndex("by_emailLower", (q) => q.eq("emailLower", emailLower))
      .first();
    if (existingEmail) {
      if (existingEmail.isAdmin) {
        return { ok: true, message: "Admin user already exists." };
      }
      await ctx.db.patch(existingEmail._id, { isAdmin: true });
      return { ok: true, message: "Existing user upgraded to admin." };
    }

    const passwordHash = await bcrypt.hash(args.password, 10);
    await ctx.db.insert("users", {
      email: args.email.trim(),
      emailLower,
      passwordHash,
      username: args.username.trim(),
      isAdmin: true,
      createdAt: Date.now(),
    });

    return { ok: true, message: "Admin user created." };
  },
});

export const hasAdminUser = query({
  args: {},
  handler: async (ctx) => {
    const admin = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("isAdmin"), true))
      .first();
    return !!admin;
  },
});
