import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "../modules/shared/schema/*.ts",
    "../modules/outreach/schema/*.ts",
  ],
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
