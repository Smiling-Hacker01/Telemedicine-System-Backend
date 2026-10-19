import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://amrutam_user:amrutam_secure_pass@localhost:5434/amrutam_telemedicine?schema=public",
  },
});
