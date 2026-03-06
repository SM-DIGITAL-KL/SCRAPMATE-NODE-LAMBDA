#!/usr/bin/env node

/**
 * Scrape pincode prefixes (first 3 digits) district-wise from indiapincodes.net
 * and save into a new DynamoDB table.
 *
 * Target site:
 *   https://indiapincodes.net/
 *
 * Data model (one row per district):
 *   id: "<state_slug>#<district_slug>"
 *   state_name
 *   state_slug
 *   district_name
 *   district_slug
 *   pincode_prefixes: ["688", "689", ...]  // first 3 digits only
 *   prefix_count
 *   pincode_count
 *   source_url
 *   created_at
 *   updated_at
 *
 * Usage:
 *   node scripts/scrape-pincode-prefixes-to-dynamodb.js --dry-run
 *   node scripts/scrape-pincode-prefixes-to-dynamodb.js --apply
 *   node scripts/scrape-pincode-prefixes-to-dynamodb.js --apply --state Kerala
 *   node scripts/scrape-pincode-prefixes-to-dynamodb.js --apply --state Kerala --limit-districts 10
 *
 * Notes:
 * - --dry-run is default (no DB writes).
 * - In --apply mode, it creates table if missing.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { loadEnvFromFile } = require('../utils/loadEnv');
const { getDynamoDBClient } = require('../config/dynamodb');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

loadEnvFromFile();

const BASE_URL = 'https://indiapincodes.net/';
const DEFAULT_TABLE = 'district_pincode_prefixes';
const PIN_RE = /\b\d{6}\b/g;

function parseArgs(argv) {
  const args = {
    apply: false,
    table: DEFAULT_TABLE,
    state: null,
    limitDistricts: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') args.apply = true;
    else if (t === '--dry-run') args.apply = false;
    else if (t === '--table') {
      args.table = argv[i + 1] || DEFAULT_TABLE;
      i += 1;
    } else if (t === '--state') {
      args.state = argv[i + 1] || null;
      i += 1;
    } else if (t === '--limit-districts') {
      const n = Number(argv[i + 1]);
      args.limitDistricts = Number.isNaN(n) ? null : n;
      i += 1;
    } else if (t === '--help' || t === '-h') {
      console.log('Usage:');
      console.log('  node scripts/scrape-pincode-prefixes-to-dynamodb.js --dry-run');
      console.log('  node scripts/scrape-pincode-prefixes-to-dynamodb.js --apply');
      console.log('  node scripts/scrape-pincode-prefixes-to-dynamodb.js --apply --state Kerala');
      console.log('  node scripts/scrape-pincode-prefixes-to-dynamodb.js --apply --state Kerala --limit-districts 10');
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${t}`);
      process.exit(1);
    }
  }
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function slugFromPath(pathname) {
  return String(pathname || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s.trim()));
}

function normalizeName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromSlug(slug) {
  return normalizeName(
    String(slug || '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase())
  );
}

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

function makeRawDynamoClient() {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
  const cfg = { region };
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    cfg.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
  }
  return new DynamoDBClient(cfg);
}

async function ensureTable(tableName) {
  const raw = makeRawDynamoClient();
  try {
    const res = await raw.send(new DescribeTableCommand({ TableName: tableName }));
    const status = res?.Table?.TableStatus;
    if (status && status !== 'ACTIVE') {
      console.log(`⏳ Waiting table to be ACTIVE (current: ${status})...`);
      await waitForTableActive(raw, tableName);
    }
    console.log(`✅ Table exists: ${tableName}`);
    return;
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }

  console.log(`ℹ️ Creating table: ${tableName}`);
  await raw.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST'
    })
  );
  console.log(`✅ Create initiated: ${tableName}`);
  await waitForTableActive(raw, tableName);
}

async function waitForTableActive(rawClient, tableName) {
  for (let i = 0; i < 60; i += 1) {
    const res = await rawClient.send(new DescribeTableCommand({ TableName: tableName }));
    const status = res?.Table?.TableStatus;
    if (status === 'ACTIVE') {
      console.log(`✅ Table ACTIVE: ${tableName}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timeout waiting for table ${tableName} to become ACTIVE`);
}

async function fetchSitemapStateLinks() {
  const res = await fetch(`${BASE_URL}sitemap.xml`);
  if (!res.ok) return [];
  const xml = await res.text();
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const states = [];
  const seen = new Set();
  for (const loc of matches) {
    try {
      const u = new URL(loc);
      const seg = slugFromPath(u.pathname);
      if (seg.length !== 1) continue;
      const stateSlug = seg[0];
      const key = stateSlug.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      states.push({
        url: u.toString(),
        stateSlug,
        label: titleFromSlug(stateSlug)
      });
    } catch (e) {
      // Ignore invalid URLs from sitemap.
    }
  }
  return states;
}

async function fetchSitemapDistrictLinks(stateSlug) {
  const res = await fetch(`${BASE_URL}sitemap.xml`);
  if (!res.ok) return [];
  const xml = await res.text();
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const out = [];
  const seen = new Set();
  for (const loc of matches) {
    try {
      const u = new URL(loc);
      const seg = slugFromPath(u.pathname);
      if (seg.length !== 2) continue;
      if (seg[0].toLowerCase() !== String(stateSlug).toLowerCase()) continue;
      const districtSlug = seg[1];
      const key = districtSlug.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        districtSlug,
        districtName: titleFromSlug(districtSlug),
        url: u.toString()
      });
    } catch (e) {
      // Ignore invalid URLs from sitemap.
    }
  }
  return out;
}

async function getStateLinks(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const uiStates = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href') || '';
      const text = (a.textContent || '').trim();
      if (!text || !/\(\d+\)/.test(text)) continue;
      if (!href.startsWith('/')) continue;
      const seg = href.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      if (seg.length !== 1) continue;
      const key = `/${seg[0]}/`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        url: new URL(key, window.location.origin).toString(),
        stateSlug: decodeURIComponent(seg[0]),
        label: text
      });
    }
    return out;
  });
  if (uiStates.length > 0) return uiStates;

  console.log('⚠️ Homepage parsing returned 0 states. Falling back to sitemap.xml');
  return fetchSitemapStateLinks();
}

async function getDistrictLinks(page, stateUrl, stateSlug) {
  await page.goto(stateUrl, { waitUntil: 'domcontentloaded' });
  const uiDistricts = await page.evaluate(({ stateSlugValue }) => {
    const out = [];
    const seen = new Set();
    const stateSlugLower = String(stateSlugValue || '').toLowerCase();
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/')) continue;
      const seg = href.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map(decodeURIComponent);
      if (seg.length !== 2) continue;
      if (seg[0].toLowerCase() !== stateSlugLower) continue;
      const districtSlug = seg[1];
      const key = `${seg[0]}#${districtSlug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        districtSlug,
        districtName: districtSlug.replace(/-/g, ' '),
        url: new URL(`/${seg[0]}/${districtSlug}/`, window.location.origin).toString()
      });
    }
    return out;
  }, { stateSlugValue: stateSlug });
  if (uiDistricts.length > 0) return uiDistricts;

  console.log(`   ⚠️ UI parsing returned 0 districts for ${stateSlug}. Falling back to sitemap.xml`);
  return fetchSitemapDistrictLinks(stateSlug);
}

async function extractDistrictPins(page, districtUrl) {
  await page.goto(districtUrl, { waitUntil: 'domcontentloaded' });
  const text = await page.evaluate(() => document.body.innerText || '');
  const matches = text.match(PIN_RE) || [];
  const full = [...new Set(matches)];
  const prefixes = [...new Set(full.map((p) => p.slice(0, 3)).filter((p) => p.length === 3))].sort();
  return { full, prefixes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const docClient = getDynamoDBClient();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📮 State/District Pincode Prefix Scraper');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Table: ${args.table}`);
  if (args.state) console.log(`State filter: ${args.state}`);
  if (args.limitDistricts) console.log(`District limit/state: ${args.limitDistricts}`);
  console.log('');

  if (args.apply) {
    await ensureTable(args.table);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results = [];
  let statesCount = 0;
  let districtsCount = 0;
  let savedCount = 0;
  let emptyCount = 0;

  try {
    let states = await getStateLinks(page);
    if (args.state) {
      const q = args.state.toLowerCase();
      states = states.filter((s) => s.stateSlug.toLowerCase() === q || s.label.toLowerCase().includes(q));
    }

    if (!states.length) {
      throw new Error('No states discovered from homepage or sitemap');
    }

    for (const s of states) {
      statesCount += 1;
      const stateName = titleFromSlug(s.stateSlug);
      console.log(`\n🏛️ State: ${stateName} (${s.stateSlug})`);
      let districts = await getDistrictLinks(page, s.url, s.stateSlug);
      if (args.limitDistricts && args.limitDistricts > 0) {
        districts = districts.slice(0, args.limitDistricts);
      }
      console.log(`   Districts found: ${districts.length}`);

      for (const d of districts) {
        districtsCount += 1;
        const districtName = titleFromSlug(d.districtSlug);
        const { full, prefixes } = await extractDistrictPins(page, d.url);
        const item = {
          id: `${s.stateSlug.toLowerCase()}#${d.districtSlug.toLowerCase()}`,
          state_name: stateName,
          state_slug: s.stateSlug.toLowerCase(),
          district_name: districtName,
          district_slug: d.districtSlug.toLowerCase(),
          pincode_prefixes: prefixes,
          prefix_count: prefixes.length,
          pincode_count: full.length,
          source_url: d.url,
          updated_at: nowIso()
        };

        if (prefixes.length === 0) {
          emptyCount += 1;
          console.log(`   ⚠️ ${districtName}: no pincodes extracted`);
          results.push({ ...item, status: 'empty' });
          continue;
        }

        if (args.apply) {
          await docClient.send(
            new PutCommand({
              TableName: args.table,
              Item: {
                ...item,
                created_at: nowIso()
              }
            })
          );
          savedCount += 1;
          console.log(`   ✅ ${districtName}: ${prefixes.length} prefixes (${full.length} pincodes)`);
          results.push({ ...item, status: 'saved' });
        } else {
          console.log(`   🧪 ${districtName}: ${prefixes.length} prefixes (${full.length} pincodes)`);
          results.push({ ...item, status: 'dry_run' });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const summary = {
    mode: args.apply ? 'apply' : 'dry_run',
    table: args.table,
    states_processed: statesCount,
    districts_processed: districtsCount,
    saved: savedCount,
    empty: emptyCount
  };

  const reportPath = path.join(__dirname, `pincode-prefix-scrape-report-${ts()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2), 'utf8');

  console.log('\nDone');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`📁 Report: ${reportPath}\n`);
}

main().catch((err) => {
  console.error('❌ Fatal:', err.message || err);
  process.exit(1);
});
