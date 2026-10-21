import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const TEST_DB = path.resolve(__dirname, "../prisma/test.db");

// Fresh throwaway SQLite schema for the service integration tests.
export default function setup() {
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-journal`, { force: true });
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}
