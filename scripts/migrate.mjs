import fs from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    await client.connect();
    break;
  } catch (error) {
    if (attempt === 30) throw error;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
const schema = await fs.readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
await client.query(schema);
await client.end();
console.log("Nexus database is ready.");
