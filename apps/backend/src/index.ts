import { PrismaClient } from "@prisma/client";
import { buildApp } from "./app.js";
import { readEnv } from "./env.js";

const prisma = new PrismaClient();
const env = readEnv();
const app = await buildApp(prisma, env);

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

await app.listen({
  host: "127.0.0.1",
  port: env.port
});
