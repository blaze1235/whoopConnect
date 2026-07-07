import { pool, runMigrations } from "./db";

runMigrations()
  .then(() => pool.end())
  .then(() => {
    console.log("Migration complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
  });
