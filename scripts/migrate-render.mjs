import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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

try {
  await pool.query(schema);
  console.log("Render database schema is ready.");
} catch (error) {
  console.error("Render database migration failed.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
