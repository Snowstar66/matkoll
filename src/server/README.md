Server-only infrastructure: `env.ts` (the only reader of process.env) and the ports `ai/` and `fetch/`, which never import features or Supabase (AD-1, AD-9, AD-11, AD-14).
