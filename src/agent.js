/**
 * Coursework Agent - Orchestrates typing multiple essays into multiple Google Docs.
 * Handles job queue, tab management, and human-like typing across documents.
 */

import { chromium } from 'playwright';
import { typeWithHumanSpeed } from './typer.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { platform } from 'os';
import chalk from 'chalk';

/** Find Google Chrome executable (uses your installed Chrome, not Playwright's Chromium) */
function findChromePath() {
  const paths = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      process.env.HOME + '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ],
    win32: [
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ],
  };
  const list = paths[platform()] || paths.linux;
  for (const p of list) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

/**
 * Load essay content from file path or use inline text.
 * @param {string} essay - File path or raw text
 * @returns {Promise<string>}
 */
async function loadEssay(essay) {
  if (!essay || typeof essay !== 'string') return '';
  const trimmed = essay.trim();
  // Heuristic: if it looks like a path (has / or . and no spaces, or exists as file)
  const mightBePath = !trimmed.includes('\n') && (trimmed.includes('/') || trimmed.includes('\\') || /\.(txt|md|docx?)$/i.test(trimmed));
  if (mightBePath) {
    try {
      const path = isAbsolute(trimmed) ? trimmed : resolve(process.cwd(), trimmed);
      return (await readFile(path, 'utf-8')).trim();
    } catch (err) {
      // Not a valid path, treat as inline text
      return trimmed;
    }
  }
  return trimmed;
}

/**
 * Ensure URL is a valid Google Docs document URL.
 */
function normalizeDocUrl(url) {
  const u = url.trim();
  if (u.startsWith('https://docs.google.com/document/d/')) return u;
  if (u.includes('docs.google.com/document')) return u;
  // Allow shortened form
  if (/^[a-zA-Z0-9_-]{20,}$/.test(u)) {
    return `https://docs.google.com/document/d/${u}/edit`;
  }
  return u;
}

/**
 * Run a single job: open doc, wait for load, type essay.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {Object} job - { essay, docUrl, options }
 * @param {Object} runOptions - { sequential, onJobStart, onJobProgress, onJobComplete }
 */
async function runJob(context, job, runOptions = {}) {
  const { onJobStart, onJobProgress, onJobComplete } = runOptions;
  const docUrl = normalizeDocUrl(job.docUrl);
  const essay = job.essay || (await loadEssay(job.essayPath || job.essay));

  if (!essay) {
    throw new Error(`No essay content for job: ${job.docUrl}`);
  }

  onJobStart?.(job, essay.length);

  const page = await context.newPage();

  try {
    await page.goto(docUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    // Wait for Docs editor to be ready
    await page.waitForSelector('.kix-appview-editor, #canvas, [role="document"]', { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    const state = { stopped: false, paused: false };

    await typeWithHumanSpeed(page, essay, {
      wpm: job.wpm ?? 45,
      wpmVariance: job.wpmVariance ?? 10,
      simulateTypos: job.simulateTypos ?? false,
      typoChance: job.typoChance ?? 0.02,
      punctuationPauses: job.punctuationPauses ?? true,
      breakEveryChars: job.breakEveryChars ?? 0,
      breakDurationMs: job.breakDurationMs ?? 5000,
      shouldStop: () => state.stopped,
      isPaused: () => state.paused,
      onProgress: (char, progress) => onJobProgress?.(job, progress),
    });

    onJobComplete?.(job, null);
  } catch (err) {
    onJobComplete?.(job, err);
    throw err;
  } finally {
    // Keep tab open so user can see result; close if running many jobs
    if (runOptions.closeTabOnComplete) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Run multiple jobs. Can run sequentially (one doc at a time) or in parallel (multiple tabs).
 *
 * @param {Array<{essay: string, docUrl: string, ...options}>} jobs
 * @param {Object} options
 * @param {boolean} [options.sequential=true] - If true, one doc at a time; if false, open all tabs and type in parallel
 * @param {string} [options.userDataDir] - Chrome user data dir for persistent login (stay logged into Google)
 * @param {boolean} [options.useChrome=false] - Use installed Google Chrome instead of Playwright's Chromium
 * @param {boolean} [options.headless=false] - Run browser headless
 * @param {boolean} [options.closeTabOnComplete=false] - Close each tab when done (only when sequential)
 * @param {Function} [options.onJobStart] - Override job start callback (job, charCount)
 * @param {Function} [options.onJobProgress] - Override progress callback (job, progress)
 * @param {Function} [options.onJobComplete] - Override job complete callback (job, err)
 */
export async function runAgent(jobs, options = {}) {
  const {
    sequential = true,
    userDataDir,
    useChrome = false,
    headless = false,
    closeTabOnComplete = false,
    onJobStart: customOnJobStart,
    onJobProgress: customOnJobProgress,
    onJobComplete: customOnJobComplete,
  } = options;

  const resolvedJobs = [];
  for (const j of jobs) {
    let essay = '';
    if (j.essayContent != null && typeof j.essayContent === 'string') {
      essay = j.essayContent.trim();
    } else if (typeof j.essay === 'string') {
      essay = await loadEssay(j.essay);
    }
    if (!essay) {
      console.warn(chalk.yellow(`Skipping job (no content): ${j.docUrl}`));
      continue;
    }
    resolvedJobs.push({
      ...j,
      essay,
      docUrl: normalizeDocUrl(j.docUrl),
    });
  }

  if (resolvedJobs.length === 0) {
    console.error(chalk.red('No valid jobs to run.'));
    return;
  }

  const launchOpts = {
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (useChrome) {
    const chromePath = findChromePath();
    if (chromePath) {
      launchOpts.executablePath = chromePath;
    } else {
      console.warn(chalk.yellow('Google Chrome not found; falling back to Chromium'));
    }
  }

  // Use persistent context (not incognito) so you stay logged in and get a normal Chrome window
  const dataDir = (userDataDir || '~/.courseworkagent-chrome').replace(/^~/, process.env.HOME || '');
  const context = await chromium.launchPersistentContext(dataDir, {
    ...launchOpts,
    viewport: { width: 1280, height: 800 },
  });

  const onJobStart = customOnJobStart || ((job, charCount) => {
    console.log(chalk.blue(`\n▶ Typing ${charCount} chars into ${job.docUrl.slice(0, 50)}...`));
  });
  const onJobProgress = customOnJobProgress || ((job, progress) => {
    if (Math.floor(progress * 100) % 10 === 0 && progress > 0) {
      process.stdout.write(chalk.gray(`  ${Math.round(progress * 100)}%\r`));
    }
  });
  const onJobComplete = customOnJobComplete || ((job, err) => {
    if (err) {
      console.error(chalk.red(`  ✗ Error: ${err.message}`));
    } else {
      console.log(chalk.green(`  ✓ Done`));
    }
  });

  try {
    if (sequential) {
      for (const job of resolvedJobs) {
        await runJob(context, job, {
          onJobStart,
          onJobProgress,
          onJobComplete,
          closeTabOnComplete: resolvedJobs.length > 1 && closeTabOnComplete,
        });
      }
    } else {
      // Parallel: open all tabs, then type in each
      const promises = resolvedJobs.map((job) =>
        runJob(context, job, {
          onJobStart,
          onJobProgress,
          onJobComplete,
          closeTabOnComplete,
        })
      );
      await Promise.all(promises);
    }
  } finally {
    console.log(chalk.blue('\nAll jobs finished. Close the browser when done, or it will stay open.'));
    // Keep browser/context open so user can review
  }
}
