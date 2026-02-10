import { z } from "zod";

const envSchema = z.object({
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url().optional().default("https://api.z.ai/api/paas/v4"),
  LLM_MODEL: z.string().min(1).default("glm-4.7-flash"),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SENTRY_DSN: z.string().url().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  const errors = _env.error.format();
  console.error("❌ Invalid environment variables:", JSON.stringify(errors, null, 2));
  if (process.env.NODE_ENV === "production") {
    throw new Error("Critical environment variables are missing or invalid");
  }
}

export const env = _env.data || ({} as z.infer<typeof envSchema>);
