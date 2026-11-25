import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

/**
 * Component tests in real browsers (Vitest browser mode, Playwright provider).
 *
 *   npm run test:browser            every test/browser/*.test.ts in Chromium, Firefox and WebKit
 *   BROWSERS=chromium npm run test:browser
 *   npm run test:visual             screenshot comparisons (Chromium only, test/browser/*.visual.ts)
 *   npm run test:visual -- --update rewrite the baselines of this platform
 *
 * Baselines are per browser and platform (`<name>-chromium-darwin.png`, `<name>-chromium-linux.png`): fonts and
 * anti-aliasing differ between macOS and Linux, so each platform compares only against its own.
 */
const browsers = (process.env.BROWSERS ?? 'chromium,firefox,webkit').split(',').map((b) => b.trim()).filter(Boolean);

const browser = (names: string[]) => ({
  enabled: true,
  headless: true,
  provider: playwright(),
  viewport: { width: 1024, height: 720 },
  screenshotFailures: false,
  instances: names.map((name) => ({ browser: name as 'chromium' | 'firefox' | 'webkit' })),
  expect: {
    toMatchScreenshot: {
      comparatorName: 'pixelmatch' as const,
      comparatorOptions: { threshold: 0.2, allowedMismatchedPixelRatio: 0.01 },
    },
  },
});

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'browser',
          include: ['test/browser/**/*.test.ts'],
          setupFiles: ['test/browser/setup.ts'],
          browser: browser(browsers),
        },
      },
      {
        test: {
          name: 'visual',
          include: ['test/browser/**/*.visual.ts'],
          setupFiles: ['test/browser/setup.ts'],
          browser: browser(['chromium']),
        },
      },
    ],
  },
});
