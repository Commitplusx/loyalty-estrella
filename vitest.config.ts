import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins:[react()],
  resolve:{alias:{'@':path.resolve(import.meta.dirname,'src')}},
  // Fixtures only. Unit tests use mocked transports, never production credentials.
  define:{
    'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://loyalty-qa.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('qa-public-key'),
  },
  test:{globals:true,include:['src/**/*.test.{ts,tsx}'],setupFiles:['src/test/setup.ts']},
});
