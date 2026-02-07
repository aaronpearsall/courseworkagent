# Coursework Agent

An AI agent that types your coursework into Google Docs at **human-like speed** across multiple essays and documents. Handles multiple tabs, different documents, variable typing speed, optional typos, and natural pauses.

## Features

- **Human-like typing**: Configurable WPM (words per minute), random variance, pauses after punctuation
- **Multiple essays → multiple docs**: Process many essay→doc pairs from a single config
- **Sequential or parallel**: Type one doc at a time, or open all docs in tabs and type in parallel
- **Optional typo simulation**: Occasionally type wrong key → backspace → correct (QWERTY neighbors)
- **Persistent login**: Use a Chrome profile so you stay logged into Google across runs

## Setup

```bash
npm install
npx playwright install chromium
```

## Web UI

Launch the web interface to paste your essay and Google Doc URL:

```bash
npm run ui
```

Then open **http://localhost:3847** in your browser. Paste the essay text, paste the doc link, and click Start.

## Usage

### Single essay → single doc

**From a file:**
```bash
npx courseworkagent --essay ./my-essay.txt --doc "https://docs.google.com/document/d/YOUR_DOC_ID/edit"
```

**Paste content directly:**
```bash
npx courseworkagent --text "Your essay content here..." --doc "https://docs.google.com/document/d/YOUR_DOC_ID/edit"
```

**From stdin** (pipe a file, or paste then Ctrl+D):
```bash
npx courseworkagent --stdin --doc "https://docs.google.com/document/d/YOUR_DOC_ID/edit" < my-essay.txt
# or: cat my-essay.txt | npx courseworkagent --stdin --doc "https://docs.google.com/..."
```

### Multiple essays from config

Create `jobs.json`:

```json
{
  "options": {
    "sequential": true,
    "wpm": 45
  },
  "jobs": [
    {
      "essay": "./essays/history.txt",
      "docUrl": "https://docs.google.com/document/d/DOC_ID_1/edit"
    },
    {
      "essay": "./essays/english.txt",
      "docUrl": "https://docs.google.com/document/d/DOC_ID_2/edit",
      "wpm": 50
    }
  ]
}
```

Run:

```bash
npx courseworkagent --config jobs.json
```

### Stay logged into Google

Use a persistent Chrome profile so you don’t have to sign in every run:

```bash
npx courseworkagent --config jobs.json --user-data-dir ~/.courseworkagent-chrome
```

The first run will open Chrome—log into Google. Later runs will reuse that session.

### Parallel mode (multiple tabs)

Open all docs in separate tabs and type into them in parallel:

```bash
npx courseworkagent --config jobs.json --parallel
```

## Options

| Option | Description |
|--------|-------------|
| `-e, --essay <path>` | Path to essay text file |
| `-d, --doc <url>` | Google Doc URL |
| `-c, --config <path>` | Path to JSON config with multiple jobs |
| `-s, --sequential` | One doc at a time (default) |
| `-p, --parallel` | All docs in separate tabs, type in parallel |
| `--wpm <n>` | Words per minute (default: 45) |
| `--typos` | Simulate occasional typos |
| `--user-data-dir <path>` | Chrome profile dir for persistent login |
| `--chrome` | Use your installed Google Chrome instead of Chromium |
| `--headless` | Run headless (not recommended for Docs) |
| `--close-tabs` | Close each tab when done (sequential mode) |

## Job config options

Per-job overrides:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `essay` | string | - | File path to essay |
| `essayContent` | string | - | Essay text inline (alternative to `essay`) |
| `docUrl` | string | - | Google Doc URL |
| `wpm` | number | 45 | Words per minute |
| `wpmVariance` | number | 10 | Random speed variation |
| `simulateTypos` | boolean | false | Add typos and corrections |
| `typoChance` | number | 0.02 | Typo probability per character |
| `punctuationPauses` | boolean | true | Pause after . , ! ? etc. |
| `breakEveryChars` | number | 0 | Take a break every N chars (0 = off) |
| `breakDurationMs` | number | 5000 | Break length in ms |

## Programmatic API

```js
import { runAgent } from 'courseworkagent';

await runAgent(
  [
    { essay: './essay1.txt', docUrl: 'https://docs.google.com/document/d/xxx/edit' },
    { essay: './essay2.txt', docUrl: 'https://docs.google.com/document/d/yyy/edit', wpm: 50 },
  ],
  {
    sequential: true,
    userDataDir: '~/.courseworkagent-chrome',
    headless: false,
  }
);
```

## How it works

1. Launches Chromium (optionally with a persistent profile).
2. Opens each Google Doc in a new tab.
3. Clicks into the document to focus the editor.
4. Types character-by-character with variable delays and optional typos.
5. Uses Playwright’s `keyboard.type()` so keystrokes show in version history as normal edits.

## Notes

- **Login**: Log into Google in the launched browser (or use `--user-data-dir` once).
- **Tab focus**: The agent types into the focused tab; keep the browser in the foreground.
- **Rate limits**: Human-like typing avoids typical paste/API limits.
- **Version history**: Text is typed as normal keystrokes, so it appears in Docs version history.
