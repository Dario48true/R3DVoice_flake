import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  LIVEKIT_URL: z.string().url().or(z.string().startsWith("ws")),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z
    .string()
    .min(32, "LIVEKIT_API_SECRET must be at least 32 chars"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Config = z.infer<typeof configSchema>;

export function parseConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  return configSchema.parse(env);
}

let cached: Config | undefined;
export function getConfig(): Config {
  if (!cached) cached = parseConfig(process.env);
  return cached;
}

// Test-only reset
export function __resetConfigForTests(): void {
  cached = undefined;
}
