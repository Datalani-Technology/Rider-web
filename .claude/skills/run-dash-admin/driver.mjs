#!/usr/bin/env node
// Playwright driver for the DASH Admin Portal (Vite dev server must already be running).
// Usage:
//   node driver.mjs shot  [route] [outfile.png]        screenshot a route (default /dashboard)
//   node driver.mjs html  [route]                      print page HTML (for finding selectors)
//   node driver.mjs eval  [route] "<js expr>"           run a JS expression in the page, print JSON
//   node driver.mjs click [route] "<css selector>" [outfile.png]   click, then screenshot
//   node driver.mjs fill  [route] "<css selector>" "<value>" [outfile.png]  fill an input, then screenshot
//
// Env overrides: DASH_ADMIN_URL (default http://localhost:5173),
//                DASH_ADMIN_EMAIL / DASH_ADMIN_PASSWORD (default: admin@datalani.co.na / DashAdmin2026! — see CLAUDE.md)
import { chromium } from 'playwright';

const BASE_URL = process.env.DASH_ADMIN_URL ?? 'http://localhost:5173';
const EMAIL = process.env.DASH_ADMIN_EMAIL ?? 'admin@datalani.co.na';
const PASSWORD = process.env.DASH_ADMIN_PASSWORD ?? 'DashAdmin2026!';

const [, , cmd, ...rest] = process.argv;

function routeUrl(route) {
  const r = route && route !== '/' ? (route.startsWith('/') ? route : `/${route}`) : '';
  return `${BASE_URL}${r}`;
}

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const emailInput = page.locator('input[type="email"]');
  if ((await emailInput.count()) === 0) return; // already authenticated (session persisted)
  await emailInput.fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in to console/i }).click();
  await page.waitForFunction(() => !document.querySelector('input[type="email"]'), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page console]', m.text()); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));

  try {
    await login(page);

    switch (cmd) {
      case 'shot': {
        const route = rest[0] ?? '/dashboard';
        const out = rest[1] ?? 'screenshot.png';
        await page.goto(routeUrl(route), { waitUntil: 'networkidle' });
        await page.waitForTimeout(800); // let charts/live Firestore listeners settle
        await page.screenshot({ path: out, fullPage: true });
        console.log(`Saved ${out}`);
        break;
      }
      case 'html': {
        const route = rest[0] ?? '/dashboard';
        await page.goto(routeUrl(route), { waitUntil: 'networkidle' });
        console.log(await page.content());
        break;
      }
      case 'eval': {
        const route = rest[0] ?? '/dashboard';
        const expr = rest[1];
        await page.goto(routeUrl(route), { waitUntil: 'networkidle' });
        const result = await page.evaluate(expr);
        console.log(JSON.stringify(result));
        break;
      }
      case 'click': {
        const [route, selector, out] = [rest[0], rest[1], rest[2] ?? 'after-click.png'];
        await page.goto(routeUrl(route), { waitUntil: 'networkidle' });
        await page.locator(selector).first().click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: out, fullPage: true });
        console.log(`Clicked ${selector}, saved ${out}`);
        break;
      }
      case 'fill': {
        const [route, selector, value, out] = [rest[0], rest[1], rest[2], rest[3] ?? 'after-fill.png'];
        await page.goto(routeUrl(route), { waitUntil: 'networkidle' });
        await page.locator(selector).first().fill(value);
        await page.screenshot({ path: out, fullPage: true });
        console.log(`Filled ${selector}, saved ${out}`);
        break;
      }
      default:
        console.error('Usage: node driver.mjs <shot|html|eval|click|fill> [route] [args...]');
        process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
