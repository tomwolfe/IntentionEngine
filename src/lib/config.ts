import { z } from "zod";

const envSchema = z.object({
  LLM_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional().default("https://api.z.ai/api/paas/v4"),
  LLM_MODEL: z.string().min(1).default("glm-4.7-flash"),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  TABLESTACK_API_URL: z.string().url().default("https://table-stack.vercel.app/api/v1"),
  TABLESTACK_INTERNAL_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.warn("⚠️ Some environment variables are missing or invalid:", _env.error.format());
  if (process.env.NODE_ENV === "production") {
    // Only throw in production if we are not in a build environment
    // or if we really need them to start. For Next.js build, we often don't have secrets.
    // We'll just export whatever we have and let the usage fail if needed.
  }
}

export const env = _env.data || ({} as z.infer<typeof envSchema>);
