import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const entitlements = sqliteTable("entitlements", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  appId: text("app_id"),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref"),
  currentPeriodEnd: integer("current_period_end"),
  createdAt: integer("created_at").notNull(),
});

export const checkoutSessions = sqliteTable("checkout_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  plan: text("plan").notNull(),
  appId: text("app_id"),
  provider: text("provider").notNull(),
  providerSessionId: text("provider_session_id"),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const gameReports = sqliteTable("game_reports", {
  appId: text("app_id").primaryKey(),
  title: text("title").notNull(),
  riskScore: integer("risk_score").notNull(),
  verdict: text("verdict").notNull(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const paymentSettings = sqliteTable("payment_settings", {
  provider: text("provider").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by"),
});
