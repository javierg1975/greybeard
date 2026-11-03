#!/usr/bin/env node
// Unit test for the correctness benchmark assertion. Feeds known-good and
// known-bad LLM outputs through each task checker and asserts the expected
// pass/fail verdict. Runs without promptfoo — just node:test + the module.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const correctness = require('../benchmarks/correctness');

// Helper: wrap code in a fenced block and call the assertion with task vars.
function check(task, lang, code) {
  const output = '```' + lang + '\n' + code + '\n```';
  return correctness(output, { vars: { task } });
}

// --- Email validator ---

test('email: correct one-liner passes', () => {
  const result = check(
    'Write me a Python function that validates email addresses.',
    'python',
    'def validate_email(email):\n    return "@" in email and "." in email.split("@")[-1] and email.split("@")[0] != ""',
  );
  assert.equal(result.pass, true);
  assert.equal(result.score, 1);
});

test('email: always-true validator fails', () => {
  const result = check(
    'Write me a Python function that validates email addresses.',
    'python',
    'def validate_email(email):\n    return True',
  );
  assert.equal(result.pass, false);
  assert.equal(result.score, 0);
});

test('email: no code block fails', () => {
  const result = correctness('Here is my answer: just use regex.', {
    vars: { task: 'Write me a Python function that validates email addresses.' },
  });
  assert.equal(result.pass, false);
});

test('email: bare unfenced code is still scored (#65)', () => {
  const result = correctness('import re\ndef validate_email(e):\n    return bool(re.match(r"^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", e))', {
    vars: { task: 'Write me a Python function that validates email addresses.' },
  });
  assert.equal(result.pass, true);
});

// --- Debounce ---

test('debounce: correct implementation passes', () => {
  const result = check(
    'Add debounce to a search input in vanilla JavaScript.',
    'javascript',
    `function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}`,
  );
  assert.equal(result.pass, true);
  assert.equal(result.score, 1);
});

test('debounce: immediate-call implementation fails', () => {
  const result = check(
    'Add debounce to a search input in vanilla JavaScript.',
    'javascript',
    `function debounce(fn, delay) {
  return function(...args) { fn.apply(this, args); };
}`,
  );
  assert.equal(result.pass, false);
  assert.equal(result.score, 0);
});

test('debounce: bare unfenced arrow function is still scored (#65)', () => {
  const result = correctness('const debounce = (fn, delay) => {\n  let t;\n  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };\n};', {
    vars: { task: 'Write a reusable debounce function in vanilla JavaScript: debounce(fn, delay).' },
  });
  assert.equal(result.pass, true);
});

// --- CSV sum ---

const CSV_TASK = "Write TypeScript code that reads sales.csv and sums the 'amount' column.";

test('csv: a plain TypeScript answer passes', () => {
  const result = check(CSV_TASK, 'ts', `import { readFileSync } from 'node:fs'
const total: number = readFileSync('sales.csv', 'utf8').trim().split('\\n').slice(1)
  .reduce((sum, line) => sum + Number(line.split(',')[1]), 0)
console.log(total)`);
  assert.equal(result.pass, true, result.reason);
  assert.equal(result.score, 1);
});

test('csv: TypeScript a strip-only runner refuses (an enum, require) still runs', () => {
  const result = check(CSV_TASK, 'typescript', `enum Column { Name, Amount }
const fs = require('fs')
console.log(fs.readFileSync('sales.csv', 'utf8').trim().split('\\n').slice(1)
  .reduce((sum: number, line: string) => sum + parseFloat(line.split(',')[Column.Amount]), 0))`);
  assert.equal(result.pass, true, result.reason);
});

test('csv: the over-engineered answer the task baits still runs, with the CSV libraries installed', () => {
  const result = check(CSV_TASK, 'ts', `import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
interface Sale { name: string; amount: string }
const sales: Sale[] = parse(readFileSync('sales.csv'), { columns: true })
console.log(sales.reduce((sum, s) => sum + parseFloat(s.amount), 0))`);
  assert.equal(result.pass, true, result.reason);
});

test('csv: an answer that imports a package greybeard does not install is not graded, not called wrong', () => {
  const result = check(CSV_TASK, 'ts', `import { readCSV } from 'danfojs-node'
const df = await readCSV('sales.csv')
console.log(df['amount'].sum())`);
  assert.equal(result.pass, false);
  assert.match(result.reason, /^Not graded: the answer imports danfojs-node/);
});

test('csv: grading leaves node_modules in place', () => {
  check(CSV_TASK, 'ts', `console.log(351)`);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'node_modules', 'typescript', 'package.json')));
});

test('csv: an exception in the code is reported, not swallowed (#919)', () => {
  const result = check(CSV_TASK, 'ts', `throw new Error("boom")`);
  assert.equal(result.pass, false);
  assert.match(result.reason, /boom/);
});

test('csv: code that prints wrong value fails', () => {
  const result = check(CSV_TASK, 'ts', `console.log(999)`);
  assert.equal(result.pass, false);
  assert.equal(result.score, 0);
});

test('csv: value containing 351 as substring fails (e.g. 13510)', () => {
  const result = check(CSV_TASK, 'ts', `console.log(13510)`);
  assert.equal(result.pass, false);
  assert.equal(result.score, 0);
});

test('csv: timeout can be raised for a slow answer', () => {
  const previous = process.env.GREYBEARD_CORRECTNESS_TIMEOUT_MS;
  const slow = `const start = Date.now()
while (Date.now() - start < 50) {}
console.log(351)`;
  try {
    process.env.GREYBEARD_CORRECTNESS_TIMEOUT_MS = '1';
    const timedOut = check(CSV_TASK, 'ts', slow);
    assert.equal(timedOut.pass, false);
    assert.match(timedOut.reason, /ETIMEDOUT|timed out/i);

    process.env.GREYBEARD_CORRECTNESS_TIMEOUT_MS = '5000';
    const completed = check(CSV_TASK, 'ts', slow);
    assert.equal(completed.pass, true, completed.reason);
    assert.equal(completed.score, 1);
  } finally {
    if (previous === undefined) delete process.env.GREYBEARD_CORRECTNESS_TIMEOUT_MS;
    else process.env.GREYBEARD_CORRECTNESS_TIMEOUT_MS = previous;
  }
});

// --- React countdown ---

test('countdown: valid React component passes', () => {
  const result = check(
    'Build me a countdown timer component in React.',
    'javascript',
    `import { useState, useEffect } from 'react';
export default function Countdown({ seconds }) {
  const [count, setCount] = useState(seconds);
  useEffect(() => {
    if (count <= 0) return;
    const id = setInterval(() => setCount(prev => prev - 1), 1000);
    return () => clearInterval(id);
  }, [count]);
  return <div>{count}</div>;
}`,
  );
  assert.equal(result.pass, true);
  assert.equal(result.score, 1);
});

test('countdown: static div without state fails', () => {
  const result = check(
    'Build me a countdown timer component in React.',
    'javascript',
    `export default function Countdown() { return <div>10</div>; }`,
  );
  assert.equal(result.pass, false);
  assert.equal(result.score, 0);
});

// --- Rate limiter ---

test('ratelimit: FastAPI with limit logic passes', () => {
  const result = check(
    'Add rate limiting to my FastAPI endpoint so users can\'t spam it.',
    'python',
    `from fastapi import FastAPI, HTTPException
import time

app = FastAPI()
requests = {}

@app.get("/api")
def endpoint(user: str = "anon"):
    now = time.time()
    window = requests.get(user, [])
    window = [t for t in window if now - t < 60]
    if len(window) >= 10:
        raise HTTPException(429, "Too Many Requests")
    window.append(now)
    requests[user] = window
    return {"ok": True}`,
  );
  assert.equal(result.pass, true);
  assert.equal(result.score, 1);
});

test('ratelimit: plain endpoint without limiting fails', () => {
  const result = check(
    'Add rate limiting to my FastAPI endpoint.',
    'python',
    `from fastapi import FastAPI
app = FastAPI()

@app.get("/api")
def endpoint():
    return {"ok": True}`,
  );
  assert.equal(result.pass, false);
  assert.equal(result.score, 0);
});

// --- Edge cases ---

test('unknown task is gracefully skipped', () => {
  const result = correctness('```python\nprint("hi")\n```', {
    vars: { task: 'Explain quantum computing.' },
  });
  assert.equal(result.pass, true);
  assert.equal(result.score, 1);
  assert.match(result.reason, /unknown task/i);
});
