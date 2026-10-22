import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'node',
      env: {
        VITE_APPWRITE_ENDPOINT: 'https://cloud.appwrite.io/v1',
        VITE_APPWRITE_PROJECT_ID: 'test-project',
      },
    },
  })
);
