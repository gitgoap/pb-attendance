import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  ...(mode === 'e2e'
    ? {
        define: {
          'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
            'https://pb-attendance-test.supabase.co',
          ),
          'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('browser-test-public-key'),
        },
      }
    : {}),
  test: { include: ['tests/**/*.test.ts'], testTimeout: 15000 },
}));
