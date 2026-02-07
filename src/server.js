#!/usr/bin/env node

import express from 'express';
import { runAgent } from './agent.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3847;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

app.post('/api/run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  const { essay, docUrl, wpm = 45 } = req.body || {};
  if (!essay || !docUrl) {
    send({ type: 'error', message: 'Essay and doc URL are required' });
    res.end();
    return;
  }

  try {
    await runAgent(
      [{ essay: essay.trim(), docUrl: docUrl.trim(), wpm: Number(wpm) || 45 }],
      {
        useChrome: true,
        onJobStart: (job, charCount) => send({ type: 'start', charCount }),
        onJobProgress: (job, progress) => send({ type: 'progress', progress }),
        onJobComplete: (job, err) => send({ type: 'complete', error: err?.message }),
      }
    );
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n  Coursework Agent UI → http://localhost:${PORT}\n`);
});
