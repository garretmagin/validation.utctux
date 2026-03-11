import { defineConfig } from '@playwright/test';

export default defineConfig({
  testMatch: 'demo-automation.ts',
  timeout: 300_000,
});
