import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const app = await buildApp({ logger: true });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
