/**
 * UTCT UX Demo — Playwright Automation Script
 *
 * Drives the demo HTML presentation and live site interactions
 * in sync with the narration transcript timing.
 *
 * Usage:
 *   1. Start screen recording (OBS, Teams, etc.)
 *   2. Run: npx playwright test demo-automation.ts
 *   3. Stop recording when browser closes
 *
 * The script can also be driven step-by-step via Playwright MCP
 * by calling the individual step functions exposed on the page's demoAPI.
 */

import { test, type Page, type Frame } from '@playwright/test';
import * as path from 'path';

// ===== Configuration =====
const DEMO_HTML_PATH = path.resolve(__dirname, 'index.html');
const DEMO_URL = `file:///${DEMO_HTML_PATH.replace(/\\/g, '/')}`;
const LIVE_SITE_URL = 'https://ux.utct.dev';
// Use a known build for deterministic demo — update before recording
const DEMO_BUILD_FQBN = '29549.1000.main.260305-1904';

const VIEWPORT = { width: 1920, height: 1080 };

// Timing (ms) — aligned to transcript timestamps
const TIMING = {
  titleHold: 8000,           // [0:00–0:08]
  problemSlideHold: 32000,   // [0:08–0:40]
  aiStoryHold: 35000,        // [0:40–1:15]
  transitionPause: 10000,    // [1:15–1:25]
  buildSelectTime: 30000,    // [1:25–1:55]
  ganttChartHold: 35000,     // [1:55–2:30]
  dependencyDive: 35000,     // [2:30–3:05]
  impactSlideHold: 25000,    // [3:05–3:30]
};

// ===== Helpers =====
async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function smoothScroll(page: Page | Frame, selector: string, duration: number = 2000): Promise<void> {
  await page.evaluate(({ sel, dur }) => {
    const el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, { sel: selector, dur: duration });
  await wait(duration);
}

async function nextSlide(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).demoAPI.next());
  await wait(1000); // Wait for transition animation
}

// ===== Main Demo Sequence =====
test('UTCT UX Demo Recording', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
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

  // ── Transition to Live Demo ──
  await nextSlide(page);
  // The iframe loads the live site. Wait for it to be ready.
  await wait(3000);

  const iframe = page.frameLocator('#demo-iframe');

  // Navigate iframe to the specific build for deterministic demo
  // The iframe should load ux.utct.dev, then we navigate within it
  await wait(TIMING.transitionPause - 3000);

  // ── Build Selection & Loading ──
  // If the site is at the root, we need to navigate to the build.
  // For a pre-cached deterministic demo, navigate directly:
  await page.evaluate((fqbn) => {
    const iframe = document.getElementById('demo-iframe') as HTMLIFrameElement;
    if (iframe) {
      iframe.src = `https://ux.utct.dev/testresults/${fqbn}`;
    }
  }, DEMO_BUILD_FQBN);

  // Wait for data to load — poll for the Gantt chart to appear
  try {
    await iframe.locator('[class*="gantt"], [class*="chart"], svg, canvas').first().waitFor({
      state: 'visible',
      timeout: 60000,
    });
  } catch {
    // If specific selector not found, just wait the allotted time
    console.log('Gantt chart selector not found, continuing with timed wait');
  }
  await wait(TIMING.buildSelectTime);

  // ── Gantt Chart Overview ──
  // Slowly scroll down through the chart
  const iframeElement = await page.$('#demo-iframe');
  if (iframeElement) {
    const frame = await iframeElement.contentFrame();
    if (frame) {
      // Scroll slowly through the Gantt chart
      for (let i = 0; i < 5; i++) {
        await frame.evaluate((scrollAmount) => {
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        }, 200);
        await wait(3000);
      }

      // Scroll back to top for summary view
      await frame.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      await wait(3000);
    }
  }
  await wait(TIMING.ganttChartHold - 18000); // Remaining time after scrolling

  // ── Dependency Deep Dive ──
  // Click on a testpass bar in the Gantt chart
  if (iframeElement) {
    const frame = await iframeElement.contentFrame();
    if (frame) {
      // Try to click on a testpass row/bar that starts late (further right in the chart)
      // Look for clickable elements in the chart area
      try {
        const testpassElements = await frame.$$('[class*="bar"], [class*="testpass"], tr[class*="row"]');
        if (testpassElements.length > 0) {
          // Click one in the middle-to-end range (likely a later-starting test)
          const targetIndex = Math.min(Math.floor(testpassElements.length * 0.7), testpassElements.length - 1);
          await testpassElements[targetIndex].click();
          await wait(2000);

          // Scroll to show the detail panel
          await frame.evaluate(() => {
            const detail = document.querySelector('[class*="detail"], [class*="Detail"], [class*="panel"]');
            if (detail) {
              detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          });
        }
      } catch (e) {
        console.log('Could not click testpass element, continuing with timed wait');
      }
    }
  }
  await wait(TIMING.dependencyDive);

  // ── Impact Slide ──
  // Navigate back to the HTML presentation for the final slide
  await nextSlide(page);
  await wait(TIMING.impactSlideHold);

  // ── End ──
  await wait(2000);
  await context.close();
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
    await page.evaluate((f) => {
      const iframe = document.getElementById('demo-iframe') as HTMLIFrameElement;
      if (iframe) iframe.src = `https://ux.utct.dev/testresults/${f}`;
    }, fqbn);
  },
  async scrollChart(page: Page, amount: number = 300) {
    const iframe = await page.$('#demo-iframe');
    const frame = await iframe?.contentFrame();
    if (frame) {
      await frame.evaluate((a) => window.scrollBy({ top: a, behavior: 'smooth' }), amount);
    }
  },
  async clickTestpass(page: Page, index: number = 0) {
    const iframe = await page.$('#demo-iframe');
    const frame = await iframe?.contentFrame();
    if (frame) {
      const rows = await frame.$$('[class*="bar"], [class*="testpass"], tr');
      if (rows[index]) await rows[index].click();
    }
  },
};
