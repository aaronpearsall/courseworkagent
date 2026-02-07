/**
 * Coursework Agent - Programmatic API
 *
 * import { runAgent } from 'courseworkagent';
 *
 * await runAgent([
 *   { essay: './essay1.txt', docUrl: 'https://docs.google.com/document/d/xxx/edit' },
 *   { essay: './essay2.txt', docUrl: 'https://docs.google.com/document/d/yyy/edit', wpm: 50 },
 * ], { sequential: true, userDataDir: '~/.chrome-profile' });
 */

export { runAgent } from './agent.js';
export { typeWithHumanSpeed, wpmToMsPerChar } from './typer.js';
export { loadConfig } from './config.js';
