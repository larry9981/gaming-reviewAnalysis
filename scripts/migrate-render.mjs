import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("Render database migration requires DATABASE_URL.");
  process.exit(1);
}

const schemaPath = fileURLToPath(new URL("../render/schema.sql", import.meta.url));
const schema = await readFile(schemaPath, "utf8");
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 15000,
});

async function bootstrapAdmin() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email && !password) return;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL must be a valid email address.");
  }
  if (!password || password.length < 12) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD must contain at least 12 characters.");
  }

  const salt = randomBytes(16);
  const digest = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const passwordHash = `pbkdf2:${salt.toString("hex")}:${digest.toString("hex")}`;
  const userId = `usr_${randomUUID().replaceAll("-", "")}`;
  const username = email.split("@")[0];

  const result = await pool.query(
    `INSERT INTO users (id, email, username, password_hash, role, created_at)
     VALUES ($1, $2, $3, $4, 'admin', $5)
     ON CONFLICT (email) DO UPDATE SET role = 'admin'
     RETURNING id, (xmax = 0) AS created`,
    [userId, email, username, passwordHash, Date.now()],
  );
  console.log(result.rows[0]?.created ? `Admin account created for ${email}.` : `Admin role confirmed for ${email}.`);
}

try {
  await pool.query(schema);
  await bootstrapAdmin();
  console.log("Render database schema is ready.");
} catch (error) {
  console.error("Render database migration failed.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
