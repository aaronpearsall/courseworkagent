#!/usr/bin/env node

/**
 * CLI for the Coursework Agent.
 * Types essays into Google Docs at human-like speed.
 *
 * Usage:
 *   courseworkagent --essay essay.txt --doc "https://docs.google.com/document/d/xxx/edit"
 *   courseworkagent --text "Your essay content..." --doc "https://docs.google.com/..."
 *   courseworkagent --stdin --doc "https://docs.google.com/..."   # essay from stdin
 *   courseworkagent --config jobs.json
 */

import { program } from 'commander';
import { runAgent } from './agent.js';
import { loadConfig } from './config.js';
import { existsSync } from 'fs';
import { resolve } from 'path';
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8').trim();
}

program
  .name('courseworkagent')
  .description('Type coursework into Google Docs at human-like speed across multiple documents')
  .version('1.0.0');

program
  .option('-e, --essay <path>', 'Path to essay text file')
  .option('-t, --text <content>', 'Essay content directly (for shorter text)')
  .option('--stdin', 'Read essay content from stdin (pipe or paste)')
  .option('-d, --doc <url>', 'Google Doc URL to type into')
  .option('-c, --config <path>', 'Path to JSON config file with multiple jobs')
  .option('-s, --sequential', 'Process docs one at a time (default: true)', true)
  .option('-p, --parallel', 'Open all docs in tabs and type in parallel')
  .option('--wpm <number>', 'Words per minute (default: 45)', '45')
  .option('--typos', 'Simulate occasional typos and corrections')
  .option('--user-data-dir <path>', 'Chrome user data dir (keeps you logged into Google)')
  .option('--chrome', 'Use installed Google Chrome instead of Chromium')
  .option('--headless', 'Run browser headless (not recommended for Google Docs)')
  .option('--close-tabs', 'Close each tab when done (when sequential)')
  .action(async (options) => {
    let jobs = [];
    let runOptions = {
      sequential: !options.parallel,
      userDataDir: options.userDataDir || undefined,
      useChrome: options.chrome || false,
      headless: options.headless || false,
      closeTabOnComplete: options.closeTabs || false,
    };

    if (options.config) {
      const configPath = resolve(process.cwd(), options.config);
      if (!existsSync(configPath)) {
        console.error(`Config file not found: ${configPath}`);
        process.exit(1);
      }
      const { jobs: configJobs, options: configOptions } = await loadConfig(options.config);
      jobs = configJobs;
      if (configOptions?.sequential !== undefined) runOptions.sequential = configOptions.sequential;
      if (configOptions?.useChrome !== undefined && !options.chrome) runOptions.useChrome = configOptions.useChrome;
    } else if (options.doc) {
      let essayContent = '';
      if (options.stdin) {
        essayContent = await readStdin();
      } else if (options.text) {
        essayContent = options.text.trim();
      } else if (options.essay) {
        essayContent = options.essay; // agent will load from file
      }
      if (!essayContent && !options.essay) {
        console.error('Provide essay via --essay <path>, --text <content>, or --stdin');
        process.exit(1);
      }
      jobs = [
        {
          essay: options.stdin || options.text ? essayContent : options.essay,
          docUrl: options.doc,
          wpm: parseInt(options.wpm, 10) || 45,
          simulateTypos: options.typos || false,
        },
      ];
    } else {
      console.error('Provide --doc <url> and essay via --essay, --text, or --stdin. Or use --config.');
      program.help();
      process.exit(1);
    }

    await runAgent(jobs, runOptions);
  });

program.parse();
