#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const ROOT = '/Users/shijo/Documents/GitHub/flutternode';
const DOWNLOADS_DIR = path.join(ROOT, 'bidassist-scraper', 'output', 'downloads');
const BUCKET = process.env.AWS_BUCKET || process.env.S3_BUCKET_NAME || 'scrapmate-images';
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';

function decodeFileUrl(fileUrl) {
  try {
    if (!fileUrl || !String(fileUrl).toLowerCase().startsWith('file://')) return null;
    const u = new URL(fileUrl);
    return decodeURIComponent(u.pathname);
  } catch (_) {
    return null;
  }
}

function collectFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (p) => {
    const entries = fs.readdirSync(p, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  const m = {
    '.pdf': 'application/pdf',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.zip': 'application/zip',
  };
  return m[ext] || 'application/octet-stream';
}

(async () => {
  const key = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  if (!key || !secret) throw new Error('Missing AWS credentials in env');

  const s3 = new S3Client({ region: REGION, credentials: { accessKeyId: key, secretAccessKey: secret } });
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION, credentials: { accessKeyId: key, secretAccessKey: secret } }));

  const files = collectFiles(DOWNLOADS_DIR);
  const byName = new Map();
  for (const f of files) {
    const base = path.basename(f);
    if (!byName.has(base)) byName.set(base, []);
    byName.get(base).push(f);
  }

  const docsTable = 'scraped_tender_documents';
  const scan = await ddb.send(new ScanCommand({ TableName: docsTable }));
  const items = Array.isArray(scan.Items) ? scan.Items : [];

  let checked = 0;
  let updated = 0;
  let uploaded = 0;
  const skipped = [];

  for (const item of items) {
    checked++;
    const current = String(item.doc_url || '').trim();
    const needs = !current || current.toLowerCase().startsWith('file://');
    if (!needs) continue;

    const fileName = String(item.file_name || '').trim();
    if (!fileName) {
      skipped.push(`id=${item.id} missing file_name`);
      continue;
    }

    let localPath = decodeFileUrl(current);
    if (!localPath || !fs.existsSync(localPath)) {
      const hits = byName.get(fileName) || [];
      if (hits.length === 1) localPath = hits[0];
      else if (hits.length > 1) localPath = hits.sort((a, b) => b.length - a.length)[0];
    }

    if (!localPath || !fs.existsSync(localPath)) {
      skipped.push(`id=${item.id} file not found: ${fileName}`);
      continue;
    }

    const tenderId = String(item.tender_id || 'unknown');
    const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, '_');
    const s3Key = `tenders/documents/backfill/${new Date().toISOString().slice(0,10).replace(/-/g,'/')}/${tenderId}/${safeName}`;
    const body = fs.readFileSync(localPath);

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: mimeFor(localPath),
    }));
    uploaded++;

    const s3Url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`;
    await ddb.send(new PutCommand({
      TableName: docsTable,
      Item: {
        ...item,
        doc_url: s3Url,
        updated_at: new Date().toISOString(),
      },
    }));
    updated++;
    console.log(`UPDATED id=${item.id} file=${fileName}`);
  }

  console.log('\nSUMMARY');
  console.log(JSON.stringify({ checked, updated, uploaded, skipped_count: skipped.length }, null, 2));
  if (skipped.length) {
    console.log('SKIPPED');
    for (const s of skipped.slice(0, 50)) console.log(s);
  }
})();
