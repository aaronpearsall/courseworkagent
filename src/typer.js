/**
 * Human-like typing engine for Google Docs.
 * Simulates realistic typing speed with variable delays, optional typos, and natural pauses.
 */

/**
 * Get a random delay between min and max ms (inclusive).
 * Slightly favors mid-range values for more natural rhythm.
 */
function randomDelay(minMs, maxMs) {
  const range = maxMs - minMs + 1;
  return Math.floor(Math.random() * range) + minMs;
}

/**
 * Get delay after punctuation - longer pause to mimic reading/thinking.
 */
function punctuationDelay(char) {
  const pauses = {
    '.': 400, '!': 350, '?': 380,
    ',': 120, ';': 180, ':': 150,
    '\n': 200,  // Paragraph break - brief pause
  };
  return pauses[char] ?? 0;
}

/**
 * Typing speed in WPM to average ms per character.
 * Average word = 5 chars + 1 space. 60 WPM = 360 chars/min = 6 chars/sec = ~167ms/char
 */
function wpmToMsPerChar(wpm) {
  const charsPerMinute = wpm * 6; // 6 chars per word on average
  return 60000 / charsPerMinute;
}

/**
 * Keyboard neighbors for typo simulation (QWERTY layout).
 */
const KEYBOARD_NEIGHBORS = {
  a: ['q', 's', 'w', 'z'], b: ['v', 'n', 'g', 'h'], c: ['x', 'v', 'd', 'f'],
  d: ['s', 'f', 'e', 'r'], e: ['w', 'r', 'd', 'f'], f: ['d', 'g', 'r', 't'],
  g: ['f', 'h', 't', 'y'], h: ['g', 'j', 'y', 'u'], i: ['u', 'o', 'j', 'k'],
  j: ['h', 'k', 'u', 'i'], k: ['j', 'l', 'i', 'o'], l: ['k', 'o', 'p'],
  m: ['n', 'j', 'k'], n: ['b', 'm', 'h', 'j'], o: ['i', 'p', 'k', 'l'],
  p: ['o', 'l'], q: ['a', 'w', 's'], r: ['e', 't', 'd', 'f'],
  s: ['a', 'd', 'q', 'w'], t: ['r', 'y', 'f', 'g'], u: ['y', 'i', 'h', 'j'],
  v: ['c', 'b', 'f', 'g'], w: ['q', 'e', 'a', 's'], x: ['z', 'c', 's', 'd'],
  y: ['t', 'u', 'g', 'h'], z: ['a', 's', 'x'],
};

/**
 * Type text into a Playwright page with human-like behavior.
 *
 * @param {import('playwright').Page} page - Playwright page (Google Doc tab)
 * @param {string} text - Text to type
 * @param {Object} options - Typing options
 * @param {number} [options.wpm=45] - Words per minute (typical human 40-80)
 * @param {number} [options.wpmVariance=10] - Random variance in speed
 * @param {boolean} [options.simulateTypos=false] - Occasionally type wrong char then backspace
 * @param {number} [options.typoChance=0.02] - Chance of typo per character (0-1)
 * @param {boolean} [options.punctuationPauses=true] - Longer pause after .,!?;
 * @param {number} [options.breakEveryChars=0] - Take a break every N chars (0 = disabled)
 * @param {number} [options.breakDurationMs=5000] - Duration of breaks in ms
 * @param {() => boolean} [options.shouldStop] - Called before each char; return true to abort
 * @param {() => boolean} [options.isPaused] - Return true while paused
 * @param {(char: string, progress: number) => void} [options.onProgress] - Progress callback
 */
export async function typeWithHumanSpeed(page, text, options = {}) {
  const {
    wpm = 45,
    wpmVariance = 10,
    simulateTypos = false,
    typoChance = 0.02,
    punctuationPauses = true,
    breakEveryChars = 0,
    breakDurationMs = 5000,
    shouldStop = () => false,
    isPaused = () => false,
    onProgress = () => {},
  } = options;

  const baseMsPerChar = wpmToMsPerChar(wpm);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Focus the doc - try multiple selectors (Google Docs structure varies)
  const focusSelectors = ['.kix-appview-editor', '#canvas', 'body'];
  for (const sel of focusSelectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      try {
        await el.click({ position: { x: 100, y: 100 }, timeout: 3000 });
        await sleep(400);
        break;
      } catch {
        continue;
      }
    }
  }

  for (let i = 0; i < text.length; i++) {
    if (shouldStop()) break;

    while (isPaused()) {
      await sleep(200);
    }

    const char = text[i];
    const variance = (Math.random() - 0.5) * 2 * wpmVariance;
    const delay = Math.max(30, baseMsPerChar + variance * (baseMsPerChar / 20));

    // Simulate typo: wrong key, then backspace, then correct char
    if (simulateTypos && typoChance > 0 && Math.random() < typoChance) {
      const lower = char.toLowerCase();
      if (KEYBOARD_NEIGHBORS[lower] && char !== '\n') {
        const wrongChar = KEYBOARD_NEIGHBORS[lower][Math.floor(Math.random() * KEYBOARD_NEIGHBORS[lower].length)];
        const upper = char === char.toUpperCase() && char !== char.toLowerCase();
        await sleep(delay);
        await page.keyboard.type(upper ? wrongChar.toUpperCase() : wrongChar);
        await sleep(randomDelay(80, 200));
        await page.keyboard.press('Backspace');
        await sleep(randomDelay(50, 120));
      }
    }

    await sleep(Math.round(delay));
    if (char === '\n') {
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.type(char);
    }

    onProgress(char, (i + 1) / text.length);

    // Extra pause after punctuation
    if (punctuationPauses && punctuationDelay(char) > 0) {
      const extra = punctuationDelay(char) + randomDelay(0, 200);
      await sleep(extra);
    }

    // Periodic breaks (e.g. every ~200 chars = "stretch")
    if (breakEveryChars > 0 && (i + 1) % breakEveryChars === 0 && i < text.length - 1) {
      await sleep(breakDurationMs);
    }

    await sleep(randomDelay(0, 25));
  }
}

export { wpmToMsPerChar };
