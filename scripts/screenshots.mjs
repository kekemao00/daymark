#!/usr/bin/env node
// 用浏览器预览模式（npm run dev，内存示例数据）重新生成 README 用的截图，2 倍清晰度。
// 需要 Playwright：npm i -g playwright && npx playwright install chromium；先 `npm run dev` 再运行本脚本。
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('找不到 playwright：npm i -g playwright && npx playwright install chromium');
  process.exit(1);
}

const OUT = process.argv[2] ?? 'docs/screenshots';
const BASE = process.env.DEV_URL ?? 'http://localhost:1420/';
const today = '2026-10-10';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
async function shot(name, { query = '', dark = false, before } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 680 }, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?today=${today}${query}`);
  await page.waitForSelector('.app');
  await page.waitForTimeout(400);
  if (before) await before(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
  console.log(`已生成 ${OUT}/${name}.png`);
}

await shot('home', { before: (p) => p.hover('.row >> nth=1') });
await shot('home-dark', { dark: true });
await shot('editor', { before: (p) => p.click('.row-main >> nth=1') });
await shot('settings', { before: (p) => p.click('text=设置') });
await shot('update', { query: '&update', before: (p) => p.waitForSelector('.update-banner') });
await browser.close();
