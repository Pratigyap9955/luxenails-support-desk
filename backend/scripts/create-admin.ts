/**
 * Create or promote a user, without touching any other data.
 *
 * `npm run seed` is destructive — it clears the demo rows and rebuilds them.
 * This script is the non-destructive way to add a real account to a desk that
 * already has tickets on it.
 *
 *   npm run create:admin -- you@example.com "Your Name" [password] [role]
 *
 * Role defaults to ADMIN, password to `luxe1234`. Re-running is safe: an
 * existing account is promoted and its password reset rather than duplicated.
 */

import bcrypt from "bcryptjs";
import { PrismaClient, type Role } from "@prisma/client";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

const VALID_ROLES: Role[] = ["ADMIN", "MANAGER", "AGENT"];

async function main() {
  const [email, name, password = "luxe1234", role = "ADMIN"] = process.argv.slice(2);

  if (!email || !name) {
    console.error(
      'Usage: npm run create:admin -- <email> "<Full Name>" [password] [ADMIN|MANAGER|AGENT]',
    );
    process.exit(1);
  }

  if (!email.includes("@")) {
    console.error(`"${email}" does not look like an email address.`);
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role as Role)) {
    console.error(`Role must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const normalised = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalised } });
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  const user = await prisma.user.upsert({
    where: { email: normalised },
    update: { name, role: role as Role, active: true, passwordHash },
    create: {
      email: normalised,
      name,
      role: role as Role,
      title: role === "ADMIN" ? "Owner" : null,
      avatarHue: 300,
      passwordHash,
    },
    select: { id: true, email: true, name: true, role: true, title: true, createdAt: true },
  });

  console.log(`\n${existing ? "Updated" : "Created"} ${user.role}: ${user.name} <${user.email}>`);
  console.log(`Password: ${password}`);
  console.log("Sign in at http://localhost:5173\n");

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Admins on this desk: ${admins.map((a) => `${a.name} <${a.email}>`).join(" · ")}`);
}

main()
  .catch((error) => {
    console.error("\nFailed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
