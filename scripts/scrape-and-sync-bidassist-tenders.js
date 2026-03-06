#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { getDynamoDBClient } = require('../config/dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');
const { uploadBufferToS3 } = require('../utils/s3Upload');

let AdmZip = null;
try {
  // Optional dependency, fallback to system unzip if missing.
  AdmZip = require('adm-zip');
} catch (_) {}

const DEFAULT_INPUT = path.resolve(
  '/Users/shijo/Documents/GitHub/flutternode/bidassist-scraper/output/scrap-kerala-tenders.json'
);
const INPUT_PATH = process.env.BIDASSIST_INPUT_JSON || process.argv[2] || DEFAULT_INPUT;
const PROFILE_DIR =
  process.env.BIDASSIST_PROFILE_DIR ||
  path.resolve('/Users/shijo/Documents/GitHub/flutternode/bidassist-scraper/.chrome-profile');
const CHROME_PATH =
  process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DOWNLOAD_ROOT = path.resolve(
  '/Users/shijo/Documents/GitHub/flutternode/bidassist-scraper/output/downloads'
);

const S3_PREFIX = process.env.BIDASSIST_S3_PREFIX || 'tenders/scraped';

function cleanText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function deriveStateFromLocation(locationValue) {
  const location = cleanText(locationValue);
  if (!location) return '';
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  const last = parts[parts.length - 1];
  if (last.toUpperCase() === 'INDIA' && parts.length > 1) {
    return parts[parts.length - 2];
  }
  return last;
}

function parseDateLabelPairs(values) {
  const out = {};
  for (const raw of values || []) {
    const match = String(raw).match(/^(.+?)(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})$/);
    if (!match) continue;
    out[cleanText(match[1])] = cleanText(match[2]);
  }
  return out;
}

function buildTenderId(t) {
  const sourceUrl = String(t.url || '').trim();
  const title = String(t.title || '').trim();
  const authority = String(t.tender_authority || t.authority || '').trim();
  const closingDate = String(t.closingDate || t.closing_date || '').trim();
  const sourceHash = crypto
    .createHash('md5')
    .update(`${sourceUrl}|${title}|${authority}|${closingDate}`)
    .digest('hex');

  let id = parseInt(sourceHash.substring(0, 12), 16);
  if (!Number.isFinite(id) || id <= 0) id = Date.now();

  return { id, sourceHash };
}

function safeName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 180);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function unzipArchive(archivePath, outDir) {
  ensureDir(outDir);

  if (AdmZip) {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(outDir, true);
    return;
  }

  execFileSync('unzip', ['-o', archivePath, '-d', outDir], { stdio: 'pipe' });
}

async function openDocumentsTab(page) {
  const selectors = [
    'a[href="#tab-DOCUMENTS"]',
    '[data-target="#tab-DOCUMENTS"]',
    '#DOCUMENTS-tab',
    'text=/^Documents$/i',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    try {
      await locator.click({ timeout: 2000, force: true });
      await page.waitForTimeout(500);
      return;
    } catch (_) {}
  }
}

async function clickDownloadAllAndWait(page, tenderDbId, tenderDownloadDir) {
  const downloadPromise = page.waitForEvent('download', { timeout: 90000 });

  let clicked = false;
  const selectors = [
    'button:has-text("Download All")',
    'a:has-text("Download All")',
    '#tab-DOCUMENTS button[title*="Download"]',
    '#tab-DOCUMENTS a[title*="Download"]',
    '#tab-DOCUMENTS [class*="download"]',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    try {
      await locator.click({ timeout: 4000, force: true });
      clicked = true;
      break;
    } catch (_) {}
  }

  if (!clicked) {
    clicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, div, span'));
      const target = elements.find((el) => /download\s*all/i.test((el.textContent || '').trim()));
      if (!target) return false;
      target.click();
      return true;
    });
  }

  if (!clicked) {
    throw new Error('Download All button not found');
  }

  const download = await downloadPromise;
  const suggested = safeName(download.suggestedFilename() || `tender_${tenderDbId}.zip`);
  const archivePath = path.join(tenderDownloadDir, suggested.endsWith('.zip') ? suggested : `${suggested}.zip`);
  await download.saveAs(archivePath);

  return archivePath;
}

async function scrapeOneTender(page, tender, tenderDbId, tenderDownloadDir) {
  await page.goto(tender.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(1500);

  const details = await page.evaluate(() => {
    const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const card = document.querySelector('.block.card.clearfix') || document.body;

    const title =
      text(card.querySelector('h2.flex.card-title a')) ||
      text(card.querySelector('h2.flex.card-title')) ||
      text(card.querySelector('h2.title span')) ||
      text(card.querySelector('h2.title'));

    const chips = Array.from(
      new Set(
        Array.from(card.querySelectorAll('.categoryChips .inline-heading, .categoryChips .chips'))
          .map(text)
          .filter(Boolean)
      )
    ).slice(0, 3);

    const locationValues = Array.from(card.querySelectorAll('.location .value')).map(text).filter(Boolean);
    const location = locationValues.join(', ') || text(card.querySelector('.location'));

    const topDescription = text(card.querySelector('.description')).replace(/^Description:\s*/i, '');
    const dateWraps = Array.from(card.querySelectorAll('.date-wrap')).map(text);

    const panelByHeading = (heading) => {
      const h = Array.from(document.querySelectorAll('h3.panel-heading')).find(
        (node) => text(node).toLowerCase() === heading.toLowerCase()
      );
      return h ? h.closest('.card.panel.panel-default') : null;
    };

    const readListPanel = (panelEl) => {
      if (!panelEl) return {};
      const map = {};
      const rows = Array.from(panelEl.querySelectorAll('ul.detail-list-wrap li'));
      for (const row of rows) {
        const key = text(row.querySelector('h3.tenderlabel'));
        const valueEl =
          row.querySelector('.value a') ||
          row.querySelector('.value') ||
          row.querySelector('a') ||
          row.querySelector('span');
        const value = text(valueEl);
        const href =
          valueEl?.tagName === 'A'
            ? valueEl.href
            : valueEl?.querySelector?.('a')?.href || '';
        if (key) map[key] = { value, href: href || '' };
      }
      return map;
    };

    const contactMap = readListPanel(panelByHeading('Contact'));
    const costsMap = readListPanel(panelByHeading('Costs'));

    const docs = Array.from(document.querySelectorAll('#tab-DOCUMENTS .doc-wrap')).map((doc) => ({
      file_name: text(doc.querySelector('.itemDocumentTooltip')) || text(doc.querySelector('.fileName')),
      doc_label: text(doc.querySelector('.type')),
      file_size: text(doc.querySelector('.size')),
    }));

    return {
      title,
      chips,
      location,
      topDescription,
      dateWraps,
      contactMap,
      costsMap,
      docs,
    };
  });

  const docsMeta = (details.docs || [])
    .map((d) => ({
      file_name: cleanText(d.file_name),
      doc_label: cleanText(d.doc_label),
      file_size: cleanText(d.file_size),
    }))
    .filter((d) => d.file_name);

  let archivePath = null;
  const extractedDir = path.join(tenderDownloadDir, 'unzipped');
  let extractedFiles = [];

  await openDocumentsTab(page);
  try {
    archivePath = await clickDownloadAllAndWait(page, tenderDbId, tenderDownloadDir);
    unzipArchive(archivePath, extractedDir);
    extractedFiles = listFilesRecursive(extractedDir);
  } catch (err) {
    console.log(`   ⚠️ Download all failed: ${err.message}`);
  }

  const parsedDates = parseDateLabelPairs(details.dateWraps);

  const panelValue = (map, key) => {
    const entry = map?.[key];
    if (!entry) return '';
    if (typeof entry === 'string') return cleanText(entry);
    return cleanText(entry.value) || cleanText(entry.href) || '';
  };

  const panelHref = (map, key) => {
    const entry = map?.[key];
    if (!entry) return '';
    if (typeof entry === 'string') return '';
    return cleanText(entry.href) || '';
  };

  const websiteUrl =
    panelHref(details.contactMap, 'Website') ||
    panelValue(details.contactMap, 'Website');
  const tenderUrlFromContact =
    panelHref(details.contactMap, 'Tender URL') ||
    panelHref(details.contactMap, 'Tender Url') ||
    panelValue(details.contactMap, 'Tender URL') ||
    panelValue(details.contactMap, 'Tender Url');

  return {
    title: cleanText(details.title) || tender.title,
    type: cleanText(details.chips?.[0]) || tender.type || null,
    category: cleanText(details.chips?.[1]) || tender.category || null,
    platform: cleanText(details.chips?.[2]) || tender.source || null,
    location: cleanText(details.location) || tender.location || null,
    description: cleanText(details.topDescription) || tender.description || null,
    opening_date: parsedDates['Opening Date'] || null,
    closing_date: parsedDates['Closing Date'] || tender.closingDate || null,
    closing_label: tender.status || null,
    tender_amount: parsedDates['Tender Amount'] || tender.tenderAmount || null,
    emd: panelValue(details.costsMap, 'EMD') || null,
    tender_id: panelValue(details.contactMap, 'Tender Id') || null,
    tender_no: panelValue(details.contactMap, 'Tender No') || null,
    tender_authority:
      panelValue(details.contactMap, 'Tender Authority').replace(/\s+View$/i, '') || null,
    purchaser_address: panelValue(details.contactMap, 'Purchaser Address') || null,
    website: websiteUrl || null,
    tender_url: tenderUrlFromContact || tender.url || null,
    documents_meta: docsMeta,
    downloaded_archive_path: archivePath,
    downloaded_files: extractedFiles,
  };
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Input JSON not found: ${INPUT_PATH}`);
  }

  const tenders = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
  if (!Array.isArray(tenders) || tenders.length === 0) {
    throw new Error('Input JSON must be a non-empty array of tenders');
  }

  ensureDir(DOWNLOAD_ROOT);

  const ddb = getDynamoDBClient();
  const tendersTable = getTableName('scraped_tenders');
  const docsTable = getTableName('scraped_tender_documents');
  const now = new Date().toISOString();
  const datePrefix = now.slice(0, 10);

  console.log(`Input: ${INPUT_PATH}`);
  console.log(`Tenders: ${tenders.length}`);
  console.log(`Profile: ${PROFILE_DIR}`);
  console.log(`Download root: ${DOWNLOAD_ROOT}`);
  console.log(`Tables: ${tendersTable}, ${docsTable}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--profile-directory=Default'],
    acceptDownloads: true,
    viewport: { width: 1360, height: 900 },
  });

  try {
    let savedTenders = 0;
    let savedDocs = 0;
    const errors = [];

    for (let i = 0; i < tenders.length; i++) {
      const t = tenders[i];
      const { id: tenderDbId, sourceHash } = buildTenderId(t);

      console.log(`\n[${i + 1}/${tenders.length}] ${t.title}`);

      const page = await context.newPage();
      const tenderDownloadDir = path.join(DOWNLOAD_ROOT, `${datePrefix}_${tenderDbId}`);
      ensureDir(tenderDownloadDir);

      try {
        const details = await scrapeOneTender(page, t, tenderDbId, tenderDownloadDir);
        const resolvedState = cleanText(
          t.state || t.state_name || deriveStateFromLocation(details.location || t.location)
        );

        await ddb.send(
          new PutCommand({
            TableName: tendersTable,
            Item: {
              id: tenderDbId,
              source_hash: sourceHash,
              source_url: t.url,
              source_list_url:
                'https://bidassist.com/all-tenders/active?filter=KEYWORD:scrap&filter=LOCATION_STRING:Kerala',
              title: details.title,
              authority: details.tender_authority,
              location: details.location,
              description: details.description,
              type: details.type,
              category: details.category,
              platform: details.platform,
              opening_date: details.opening_date,
              closing_date: details.closing_date,
              closing_label: details.closing_label,
              tender_amount: details.tender_amount,
              emd: details.emd,
              tender_id: details.tender_id,
              tender_no: details.tender_no,
              tender_authority: details.tender_authority,
              purchaser_address: details.purchaser_address,
              website: details.website,
              tender_url: details.tender_url || t.url,
              state: resolvedState || null,
              state_normalized: resolvedState ? resolvedState.toUpperCase() : null,
              downloaded_archive_path: details.downloaded_archive_path || null,
              created_at: now,
              updated_at: now,
            },
          })
        );

        savedTenders++;

        const metaByNameLower = new Map(
          details.documents_meta.map((m) => [m.file_name.toLowerCase(), m])
        );
        const uploadedMetaNames = new Set();

        for (let d = 0; d < details.downloaded_files.length; d++) {
          const filePath = details.downloaded_files[d];
          const fileName = path.basename(filePath);
          const fileBuffer = fs.readFileSync(filePath);
          const matchedMeta = metaByNameLower.get(fileName.toLowerCase()) || null;
          if (matchedMeta) uploadedMetaNames.add(matchedMeta.file_name.toLowerCase());

          const docHash = crypto
            .createHash('md5')
            .update(`${sourceHash}|${fileName}|${d}`)
            .digest('hex');
          let docId = parseInt(docHash.substring(0, 12), 16);
          if (!Number.isFinite(docId) || docId <= 0) docId = Date.now() + d;

          const safeFile = `${tenderDbId}__${safeName(fileName)}`;
          const folder = `${S3_PREFIX}/${datePrefix}/${tenderDbId}`;
          const uploaded = await uploadBufferToS3(fileBuffer, safeFile, folder);

          await ddb.send(
            new PutCommand({
              TableName: docsTable,
              Item: {
                id: docId,
                tender_id: tenderDbId,
                doc_label: matchedMeta?.doc_label || null,
                file_name: fileName,
                file_size: matchedMeta?.file_size || `${fileBuffer.length} B`,
                doc_url: null,
                s3_key: uploaded?.s3Key || null,
                s3_url: uploaded?.s3Url || null,
                source_local_path: filePath,
                created_at: now,
                updated_at: now,
              },
            })
          );
          savedDocs++;
        }

        // Save metadata-only document rows when ZIP download fails or misses items.
        for (let d = 0; d < details.documents_meta.length; d++) {
          const meta = details.documents_meta[d];
          if (uploadedMetaNames.has(meta.file_name.toLowerCase())) continue;

          const docHash = crypto
            .createHash('md5')
            .update(`${sourceHash}|${meta.file_name}|missing|${d}`)
            .digest('hex');
          let docId = parseInt(docHash.substring(0, 12), 16);
          if (!Number.isFinite(docId) || docId <= 0) docId = Date.now() + d + 1000;

          await ddb.send(
            new PutCommand({
              TableName: docsTable,
              Item: {
                id: docId,
                tender_id: tenderDbId,
                doc_label: meta.doc_label || null,
                file_name: meta.file_name || null,
                file_size: meta.file_size || null,
                doc_url: null,
                s3_key: null,
                s3_url: null,
                download_status: 'not_downloaded',
                created_at: now,
                updated_at: now,
              },
            })
          );
          savedDocs++;
        }

        console.log(
          `   ✅ saved tender + ${details.downloaded_files.length}/${details.documents_meta.length} downloaded docs`
        );
      } catch (err) {
        console.error(`   ❌ ${err.message}`);
        errors.push({ rank: t.rank, url: t.url, message: err.message });
      } finally {
        await page.close();
      }
    }

    const report = {
      input_path: INPUT_PATH,
      tenders_total: tenders.length,
      saved_tenders: savedTenders,
      saved_docs: savedDocs,
      errors,
      tables: {
        tenders: tendersTable,
        documents: docsTable,
      },
      s3_prefix: S3_PREFIX,
      download_root: DOWNLOAD_ROOT,
      completed_at: new Date().toISOString(),
    };

    const reportPath = path.resolve(
      '/Users/shijo/Documents/GitHub/flutternode/bidassist-scraper/output/bidassist-sync-report.json'
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${reportPath}`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
