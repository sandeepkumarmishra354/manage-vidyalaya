// Bootstraps the first vendor-admin operator login. Run once per
// deployment (or whenever a new vendor operator needs an account) -- there
// is deliberately no self-service signup for this table, same reasoning
// as scripts/create-tenant.ts in apps/cloud-api: a script run by whoever
// already has DATABASE_URL access is the right amount of ceremony for a
// vendor-only operator account.
import "dotenv/config";

import { randomUUID } from "node:crypto";

import * as bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;

interface Args {
  email: string;
  fullName: string;
  password?: string;
}

function usage(): never {
  console.error(
    `Usage: pnpm create-vendor-admin --email=you@example.com --full-name="Your Name" [--password=...]

If --password is omitted, a random one is generated and printed once.`,
  );
  process.exit(1);
}

function parseArgs(): Args {
  const values = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!match) usage();
    values.set(match[1], match[2]);
  }
  const email = values.get("email");
  const fullName = values.get("full-name");
  if (!email || !fullName) usage();
  return { email, fullName, password: values.get("password") };
}

function generatePassword(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

async function main() {
  const args = parseArgs();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const password = args.password ?? generatePassword();

  try {
    const { rows: existing } = await pool.query<{ id: string }>("SELECT id FROM vendor_admins WHERE email = $1", [
      args.email,
    ]);
    if (existing.length > 0) {
      throw new Error(`A vendor admin with email "${args.email}" already exists.`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = randomUUID();
    await pool.query(
      "INSERT INTO vendor_admins (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)",
      [id, args.email, passwordHash, args.fullName],
    );

    console.log("Vendor admin created successfully.");
    console.log("  Email:   ", args.email);
    console.log("  Password:", password);
    console.log("Hand these credentials to the operator and have them change the password after first login.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
