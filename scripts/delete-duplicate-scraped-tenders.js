require('dotenv').config();

const { getDynamoDBClient } = require('../config/dynamodb');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../utils/dynamodbTableNames');

const APPLY = process.argv.includes('--apply');

const sanitizeText = (value) => String(value || '').trim();

const hasValue = (value) => {
  const text = sanitizeText(value);
  return !!text && text !== '-' && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined';
};

const isBidAssistUrl = (value) => sanitizeText(value).toLowerCase().includes('bidassist.com');

const makeTenderDedupKey = (tender) =>
  sanitizeText(tender?.tender_id) ||
  sanitizeText(tender?.source_tender_id) ||
  sanitizeText(tender?.tender_no) ||
  sanitizeText(tender?.source_hash) ||
  `${sanitizeText(tender?.title)}|${sanitizeText(tender?.location)}|${sanitizeText(tender?.closing_date)}`;

const tenderQualityScore = (tender) => {
  let score = 0;
  if (hasValue(tender?.website)) score += 5;
  if (hasValue(tender?.tender_url) && !isBidAssistUrl(tender?.tender_url)) score += 4;
  if (hasValue(tender?.source_url) && !isBidAssistUrl(tender?.source_url)) score += 3;
  if (Array.isArray(tender?.documents) && tender.documents.length > 0) score += 1;
  return score;
};

const scanAll = async (client, tableName) => {
  const out = [];
  let last;
  do {
    const res = await client.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: last }));
    if (Array.isArray(res?.Items)) out.push(...res.Items);
    last = res?.LastEvaluatedKey;
  } while (last);
  return out;
};

const deleteById = async (client, tableName, id) => {
  await client.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { id },
    })
  );
};

(async () => {
  const client = getDynamoDBClient();
  const tendersTable = getTableName('scraped_tenders');
  const docsTable = getTableName('scraped_tender_documents');

  const tenders = await scanAll(client, tendersTable);
  const docs = await scanAll(client, docsTable);

  const docsByTenderId = new Map();
  for (const doc of docs) {
    const tenderId = doc?.tender_id;
    if (tenderId === undefined || tenderId === null) continue;
    const key = String(tenderId);
    if (!docsByTenderId.has(key)) docsByTenderId.set(key, []);
    docsByTenderId.get(key).push(doc);
  }

  const withDocs = tenders.map((t) => ({
    ...t,
    documents: docsByTenderId.get(String(t.id)) || [],
  }));

  const keepByKey = new Map();
  const duplicates = [];

  for (const tender of withDocs) {
    const key = makeTenderDedupKey(tender);
    if (!key) continue;

    const existing = keepByKey.get(key);
    if (!existing) {
      keepByKey.set(key, tender);
      continue;
    }

    const existingScore = tenderQualityScore(existing);
    const currentScore = tenderQualityScore(tender);
    const existingTime = new Date(existing?.created_at || 0).getTime();
    const currentTime = new Date(tender?.created_at || 0).getTime();

    if (currentScore > existingScore || (currentScore === existingScore && currentTime > existingTime)) {
      duplicates.push(existing);
      keepByKey.set(key, tender);
    } else {
      duplicates.push(tender);
    }
  }

  const duplicateTenderIds = Array.from(
    new Set(
      duplicates
        .map((t) => Number(t?.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  const duplicateDocs = docs.filter((doc) => duplicateTenderIds.includes(Number(doc?.tender_id)));
  const duplicateDocIds = Array.from(
    new Set(
      duplicateDocs
        .map((d) => Number(d?.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  if (APPLY) {
    for (const id of duplicateDocIds) {
      await deleteById(client, docsTable, id);
    }
    for (const id of duplicateTenderIds) {
      await deleteById(client, tendersTable, id);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? 'apply' : 'dry_run',
        tables: {
          tenders: tendersTable,
          documents: docsTable,
        },
        scanned: {
          tenders: tenders.length,
          documents: docs.length,
        },
        dedupe: {
          unique_groups: keepByKey.size,
          duplicate_tenders: duplicateTenderIds.length,
          duplicate_documents: duplicateDocIds.length,
        },
        sample_duplicate_tender_ids: duplicateTenderIds.slice(0, 50),
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error('❌ delete-duplicate-scraped-tenders failed:', error);
  process.exit(1);
});

