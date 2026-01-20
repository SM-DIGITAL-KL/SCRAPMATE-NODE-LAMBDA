/**
 * Check SMS configuration against expected values
 */

console.log('\n🔍 SMS Configuration Check');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Expected values from user
const EXPECTED = {
  templateId: '1262918',
  senderName: 'SCRPMT',
  entityId: '1707176812500484578',
  senderId: 'scrapmate',
  template: 'Scrapmate pickup request {#var#}. Payable amount Rs{#var#}. Open B2C dashboard to accept.'
};

// Current values in code
const CURRENT = {
  templateid: '1707176812500484578', // This is wrong - should be 1262918
  sendername: 'SCRPMT', // ✅ Correct
  peid: '1701173389563945545', // This is wrong - should be 1707176812500484578
  username: 'scrapmate', // ✅ Correct
  smstype: 'TRANS',
  apikey: '1bf0131f-d1f2-49ed-9c57-19f1b4400f32'
};

console.log('📋 Expected Configuration:');
console.log('   Template ID:', EXPECTED.templateId);
console.log('   Sender Name:', EXPECTED.senderName);
console.log('   Entity ID:', EXPECTED.entityId);
console.log('   Sender ID:', EXPECTED.senderId);
console.log('   Template:', EXPECTED.template);
console.log('');

console.log('📋 Current Configuration in Code:');
console.log('   templateid:', CURRENT.templateid);
console.log('   sendername:', CURRENT.sendername);
console.log('   peid (Entity ID):', CURRENT.peid);
console.log('   username (Sender ID):', CURRENT.username);
console.log('');

console.log('🔍 Comparison:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const issues = [];

if (CURRENT.templateid !== EXPECTED.templateId) {
  console.log('❌ Template ID mismatch:');
  console.log(`   Expected: ${EXPECTED.templateId}`);
  console.log(`   Current:  ${CURRENT.templateid}`);
  issues.push({
    field: 'templateid',
    expected: EXPECTED.templateId,
    current: CURRENT.templateid,
    fix: `Change templateid from '${CURRENT.templateid}' to '${EXPECTED.templateId}'`
  });
} else {
  console.log('✅ Template ID is correct');
}

if (CURRENT.sendername !== EXPECTED.senderName) {
  console.log('❌ Sender Name mismatch:');
  console.log(`   Expected: ${EXPECTED.senderName}`);
  console.log(`   Current:  ${CURRENT.sendername}`);
  issues.push({
    field: 'sendername',
    expected: EXPECTED.senderName,
    current: CURRENT.sendername,
    fix: `Change sendername from '${CURRENT.sendername}' to '${EXPECTED.senderName}'`
  });
} else {
  console.log('✅ Sender Name is correct');
}

if (CURRENT.peid !== EXPECTED.entityId) {
  console.log('❌ Entity ID (peid) mismatch:');
  console.log(`   Expected: ${EXPECTED.entityId}`);
  console.log(`   Current:  ${CURRENT.peid}`);
  issues.push({
    field: 'peid',
    expected: EXPECTED.entityId,
    current: CURRENT.peid,
    fix: `Change peid from '${CURRENT.peid}' to '${EXPECTED.entityId}'`
  });
} else {
  console.log('✅ Entity ID (peid) is correct');
}

if (CURRENT.username !== EXPECTED.senderId) {
  console.log('❌ Sender ID (username) mismatch:');
  console.log(`   Expected: ${EXPECTED.senderId}`);
  console.log(`   Current:  ${CURRENT.username}`);
  issues.push({
    field: 'username',
    expected: EXPECTED.senderId,
    current: CURRENT.username,
    fix: `Change username from '${CURRENT.username}' to '${EXPECTED.senderId}'`
  });
} else {
  console.log('✅ Sender ID (username) is correct');
}

console.log('');

if (issues.length > 0) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  Issues Found:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  issues.forEach((issue, index) => {
    console.log(`\n${index + 1}. ${issue.field.toUpperCase()}:`);
    console.log(`   ${issue.fix}`);
  });
  console.log('\n');
  console.log('📝 Summary:');
  console.log(`   - Template ID should be ${EXPECTED.templateId} (not ${CURRENT.templateid})`);
  console.log(`   - Entity ID (peid) should be ${EXPECTED.entityId} (not ${CURRENT.peid})`);
  console.log(`   - Sender Name is correct: ${CURRENT.sendername}`);
  console.log(`   - Sender ID (username) is correct: ${CURRENT.username}`);
} else {
  console.log('✅ All SMS configuration values are correct!');
}

console.log('');
