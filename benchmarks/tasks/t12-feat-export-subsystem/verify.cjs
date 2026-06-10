'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const node = process.execPath;
const cli = path.join(__dirname, 'src', 'cli.js');
const outDir = path.join(__dirname, 'out');

// Remove out/ before checks so each run is clean.
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}

function run(args) {
  return spawnSync(node, [cli, ...args], { encoding: 'utf8', cwd: __dirname });
}

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

// ── Check 1: export-products --format csv ────────────────────────────────────
{
  const r = run(['export-products', '--format', 'csv']);
  if (r.status !== 0) fail(`export-products --format csv exited ${r.status}; stderr: ${r.stderr.trim()}`);

  const csvPath = path.join(outDir, 'products.csv');
  if (!fs.existsSync(csvPath)) fail('out/products.csv does not exist');

  const lines = fs.readFileSync(csvPath, 'utf8').replace(/\r\n/g, '\n').trim().split('\n');
  const header = lines[0].split(',');
  const { allProducts } = require('./src/core/products.js');
  const products = allProducts();

  // Header must contain exactly the keys of a product record.
  const expectedKeys = Object.keys(products[0]);
  if (header.join(',') !== expectedKeys.join(',')) {
    fail(`products.csv header mismatch: got "${header.join(',')}", want "${expectedKeys.join(',')}"`);
  }

  // Row count (header + data rows).
  if (lines.length !== products.length + 1) {
    fail(`products.csv row count: got ${lines.length - 1}, want ${products.length}`);
  }

  // Spot-check first data row.
  const firstRow = lines[1].split(',');
  const p0 = products[0];
  const expectedFirst = expectedKeys.map((k) => String(p0[k])).join(',');
  if (lines[1] !== expectedFirst) {
    fail(`products.csv first data row: got "${lines[1]}", want "${expectedFirst}"`);
  }
}

// ── Check 2: export-orders --format json ─────────────────────────────────────
{
  const r = run(['export-orders', '--format', 'json']);
  if (r.status !== 0) fail(`export-orders --format json exited ${r.status}; stderr: ${r.stderr.trim()}`);

  const jsonPath = path.join(outDir, 'orders.json');
  if (!fs.existsSync(jsonPath)) fail('out/orders.json does not exist');

  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const { allOrders } = require('./src/core/orders.js');
  const orders = allOrders();

  if (!Array.isArray(parsed)) fail('orders.json is not an array');
  if (parsed.length !== orders.length) {
    fail(`orders.json length: got ${parsed.length}, want ${orders.length}`);
  }

  const first = JSON.parse(JSON.stringify(orders[0]));
  if (JSON.stringify(parsed[0]) !== JSON.stringify(first)) {
    fail(`orders.json first record mismatch: got ${JSON.stringify(parsed[0])}, want ${JSON.stringify(first)}`);
  }
}

// ── Check 3: export-customers --format csv ───────────────────────────────────
{
  const r = run(['export-customers', '--format', 'csv']);
  if (r.status !== 0) fail(`export-customers --format csv exited ${r.status}; stderr: ${r.stderr.trim()}`);

  const csvPath = path.join(outDir, 'customers.csv');
  if (!fs.existsSync(csvPath)) fail('out/customers.csv does not exist');

  const lines = fs.readFileSync(csvPath, 'utf8').replace(/\r\n/g, '\n').trim().split('\n');
  const { allCustomers } = require('./src/core/customers.js');
  const customers = allCustomers();

  if (lines.length !== customers.length + 1) {
    fail(`customers.csv row count: got ${lines.length - 1}, want ${customers.length}`);
  }
}

// ── Check 4: export-products --format xml → exit 2 + stderr ──────────────────
{
  const r = run(['export-products', '--format', 'xml']);
  if (r.status !== 2) fail(`export-products --format xml: expected exit 2, got ${r.status}`);
  const stderr = r.stderr.replace(/\r\n/g, '\n').trim();
  if (!stderr.startsWith('error: unsupported format:')) {
    fail(`export-products --format xml: stderr should start with "error: unsupported format:", got "${stderr}"`);
  }
}

// ── Check 5: config.features includes 'export' ───────────────────────────────
{
  const config = require('./src/config.js');
  if (!Array.isArray(config.features) || !config.features.includes('export')) {
    fail(`config.features does not include 'export': ${JSON.stringify(config.features)}`);
  }
}

// ── Check 6: docs/commands.md documents all three export commands ─────────────
{
  const docsPath = path.join(__dirname, 'docs', 'commands.md');
  const docs = fs.readFileSync(docsPath, 'utf8');
  for (const cmd of ['export-products', 'export-orders', 'export-customers']) {
    if (!docs.includes(cmd)) fail(`docs/commands.md does not mention ${cmd}`);
  }
}

// ── Check 7: list-products still works ───────────────────────────────────────
{
  const r = run(['list-products']);
  if (r.status !== 0) fail(`list-products exited ${r.status}`);
  const out = r.stdout.trim();
  if (!out) fail('list-products produced no output');
}

console.log('PASS');
