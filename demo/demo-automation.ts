/**
 * UTCT UX Demo — Playwright Automation Script
 *
 * Drives the demo HTML presentation and live site interactions
 * in sync with the narration transcript timing.
 * Video is recorded automatically via Playwright (saved to test-results/).
 *
 * Usage:
 *   1. Close Microsoft Edge (so the profile isn't locked)
 *   2. Run: npm run demo
 *   3. Video saved to test-results/ when complete
 *
 * The script can also be driven step-by-step via Playwright MCP
 * by calling the individual step functions exposed on the page's demoAPI.
 */

import { test, chromium, type Page } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';

// ===== Configuration =====
const DEMO_HTML_PATH = path.resolve(__dirname, 'index.html');
const DEMO_URL = `file:///${DEMO_HTML_PATH.replace(/\\/g, '/')}`;
const LIVE_SITE_URL = 'https://ux.utct.dev';
// Use a known build for deterministic demo — update before recording
const DEMO_BUILD_FQBN = '29549.1000.main.260305-1904';

const VIEWPORT = { width: 1920, height: 1080 };

// Edge user data directory — uses your existing profile with saved auth sessions.
// Close Edge before running so the profile isn't locked.
const EDGE_USER_DATA_DIR = path.join(
  os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'
);

// Timing (ms) — compressed to ~2:00 total
const TIMING = {
  titleHold: 9000,           // [0:00–0:09]
  problemSlideHold: 30000,   // [0:09–0:39]
  aiStoryHold: 27000,        // [0:39–1:06]
  caseStudyHold: 18000,      // [1:06–1:24]
  transitionPause: 6000,     // [1:24–1:30]
  buildSelectTime: 15000,    // [1:30–1:45]
  ganttChartHold: 20000,     // [1:45–2:05]
  dependencyDive: 15000,     // [2:05–2:20]
};

// ===== Helpers =====
async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function nextSlide(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).demoAPI.next());
  await wait(1000); // Wait for transition animation
}

// ===== Main Demo Sequence =====
test('UTCT UX Demo Recording', async () => {
  // Launch Edge with your existing profile (preserves auth sessions).
  // Close Edge before running so the profile isn't locked.
  const context = await chromium.launchPersistentContext(EDGE_USER_DATA_DIR, {
    channel: 'msedge',
    headless: false,
    viewport: VIEWPORT,
    colorScheme: 'light',
    args: ['--start-maximized'],
    recordVideo: {
      dir: 'test-results/',
      size: VIEWPORT,
    },
  });
  const page = await context.newPage();

  // ── Title Slide ──
  await page.goto(DEMO_URL);
  await wait(TIMING.titleHold);

  // ── Problem Slide ──
  await nextSlide(page);
  await wait(TIMING.problemSlideHold);

  // ── AI Story Slide ──
  await nextSlide(page);
  await wait(TIMING.aiStoryHold);

  // ── Case Study Slide ──
  await nextSlide(page);
  await wait(TIMING.caseStudyHold);

  // ── Transition to Live Demo ──
  await nextSlide(page);
  await wait(TIMING.transitionPause);

  // Open the live site in a new tab and navigate to the demo build
  const demoPage = await context.newPage();
  await demoPage.goto(`${LIVE_SITE_URL}/testresults/${DEMO_BUILD_FQBN}`);

  // Wait for data to load — poll for the Gantt chart to appear
  try {
    await demoPage.locator('[class*="gantt"], [class*="chart"], svg, canvas').first().waitFor({
      state: 'visible',
      timeout: 60000,
    });
  } catch {
    console.log('Gantt chart selector not found, continuing with timed wait');
  }
  await wait(TIMING.buildSelectTime);

  // ── Gantt Chart Overview ──
  for (let i = 0; i < 4; i++) {
    await demoPage.evaluate((scrollAmount) => {
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }, 250);
    await wait(2000);
  }

  await demoPage.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  await wait(2000);
  await wait(TIMING.ganttChartHold - 10000); // Remaining time after scrolling

  // ── Dependency Deep Dive ──
  // Click on a testpass bar in the Gantt chart
  try {
    const testpassElements = await demoPage.$$('[class*="bar"], [class*="testpass"], tr[class*="row"]');
    if (testpassElements.length > 0) {
      const targetIndex = Math.min(Math.floor(testpassElements.length * 0.7), testpassElements.length - 1);
      await testpassElements[targetIndex].click();
      await wait(2000);

      // Scroll the detail panel into view
      await demoPage.evaluate(() => {
        const detail = document.querySelector('[class*="detail"], [class*="Detail"], [class*="panel"]');
        if (detail) {
          detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      await wait(2000);

      // Scroll further down to reveal the full mini Gantt chart and critical path
      for (let i = 0; i < 3; i++) {
        await demoPage.evaluate(() => {
          window.scrollBy({ top: 300, behavior: 'smooth' });
        });
        await wait(2000);
      }
    }
  } catch {
    console.log('Could not click testpass element, continuing with timed wait');
  }
  await wait(TIMING.dependencyDive - 8000); // Remaining time after scrolling

  // ── End ──
  // Close the demo tab and return to the presentation
  await demoPage.close();
  await page.bringToFront();
  await wait(2000);
  const videoPath = await page.video()?.path();
  await context.close();
  if (videoPath) {
    console.log(`Video saved to: ${videoPath}`);
  }
});

// ===== Manual Step-by-Step Mode =====
// For use with Playwright MCP — call these individually
export const demoSteps = {
  async openPresentation(page: Page) {
    await page.goto(DEMO_URL);
  },
  async advanceSlide(page: Page) {
    await page.evaluate(() => (window as any).demoAPI.next());
  },
  async loadBuild(page: Page, fqbn: string = DEMO_BUILD_FQBN) {
    await page.goto(`${LIVE_SITE_URL}/testresults/${fqbn}`);
  },
  async scrollChart(page: Page, amount: number = 300) {
    await page.evaluate((a) => window.scrollBy({ top: a, behavior: 'smooth' }), amount);
  },
  async clickTestpass(page: Page, index: number = 0) {
    const rows = await page.$$('[class*="bar"], [class*="testpass"], tr');
    if (rows[index]) await rows[index].click();
  },
};
