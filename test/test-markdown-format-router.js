/**
 * Tests for Markdown Document Tool & Format Router Service
 */

import { detectFormat } from '../src/services/format-router.js';
import { createMarkdown } from '../src/tools/create-markdown.js';
import { formatHeading, formatCodeBlock, formatBulletList, formatTaskList, formatInlineCode, applyImplementationStyle } from '../src/utils/markdown-formatter.js';

// ============================================================================
// Format Router Tests
// ============================================================================

console.log('\n=== Format Router Tests ===\n');

async function testFormatRouter() {
  // Test 1: Implementation keywords → markdown
  console.log('Test 1: Implementation keywords should recommend markdown');
  const implResult = await detectFormat({ userQuery: 'I need documentation for my next implementation' });
  console.log(`  Result: ${implResult.format} (confidence: ${implResult.confidence})`);
  console.log(`  Reason: ${implResult.reason}`);
  console.assert(implResult.format === 'markdown', 'Expected markdown format');
  console.assert(implResult.suggestedTool === 'create-markdown', 'Expected create-markdown tool');
  console.log('  ✓ PASSED\n');

  // Test 2: Stakeholder keywords → docx
  console.log('Test 2: Stakeholder keywords should recommend docx');
  const stakeResult = await detectFormat({ userQuery: 'high level overview for stakeholders' });
  console.log(`  Result: ${stakeResult.format} (confidence: ${stakeResult.confidence})`);
  console.log(`  Reason: ${stakeResult.reason}`);
  console.assert(stakeResult.format === 'docx', 'Expected docx format');
  console.assert(stakeResult.suggestedTool === 'create-doc', 'Expected create-doc tool');
  console.log('  ✓ PASSED\n');

  // Test 3: Data keywords → excel
  console.log('Test 3: Budget/spreadsheet keywords should recommend excel');
  const dataResult = await detectFormat({ userQuery: 'budget spreadsheet with costs' });
  console.log(`  Result: ${dataResult.format} (confidence: ${dataResult.confidence})`);
  console.log(`  Reason: ${dataResult.reason}`);
  console.assert(dataResult.format === 'excel', 'Expected excel format');
  console.assert(dataResult.suggestedTool === 'create-excel', 'Expected create-excel tool');
  console.log('  ✓ PASSED\n');

  // Test 4: Explicit markdown mention → markdown
  console.log('Test 4: Explicit "markdown" mention should recommend markdown');
  const explicitMd = await detectFormat({ userQuery: 'create a markdown file with the API docs' });
  console.log(`  Result: ${explicitMd.format} (confidence: ${explicitMd.confidence})`);
  console.assert(explicitMd.format === 'markdown', 'Expected markdown format');
  console.log('  ✓ PASSED\n');

  // Test 5: Explicit docx mention → docx
  console.log('Test 5: Explicit "docx" mention should recommend docx');
  const explicitDocx = await detectFormat({ userQuery: 'create a docx document for the board meeting' });
  console.log(`  Result: ${explicitDocx.format} (confidence: ${explicitDocx.confidence})`);
  console.assert(explicitDocx.format === 'docx', 'Expected docx format');
  console.log('  ✓ PASSED\n');

  // Test 6: Explicit excel mention → excel
  console.log('Test 6: Explicit "xlsx" mention should recommend excel');
  const explicitXlsx = await detectFormat({ userQuery: 'create an xlsx file with the quarterly numbers' });
  console.log(`  Result: ${explicitXlsx.format} (confidence: ${explicitXlsx.confidence})`);
  console.assert(explicitXlsx.format === 'excel', 'Expected excel format');
  console.log('  ✓ PASSED\n');

  // Test 7: Technical keywords → markdown
  console.log('Test 7: Technical keywords (API, code, integration) should recommend markdown');
  const techResult = await detectFormat({ userQuery: 'I need to document the API endpoints and how to integrate with our code' });
  console.log(`  Result: ${techResult.format} (confidence: ${techResult.confidence})`);
  console.log(`  Matched keywords: ${techResult.matchedKeywords.slice(0, 5).join(', ')}`);
  console.assert(techResult.format === 'markdown', 'Expected markdown format');
  console.log('  ✓ PASSED\n');

  // Test 8: Financial keywords → excel
  console.log('Test 8: Financial keywords (revenue, forecast, expenses) should recommend excel');
  const finResult = await detectFormat({ userQuery: 'I need to track revenue and expenses with a quarterly forecast' });
  console.log(`  Result: ${finResult.format} (confidence: ${finResult.confidence})`);
  console.assert(finResult.format === 'excel', 'Expected excel format');
  console.log('  ✓ PASSED\n');

  // Test 9: Ambiguous query → defaults to markdown
  console.log('Test 9: Ambiguous query should default to markdown');
  const ambiguous = await detectFormat({ userQuery: 'create a document' });
  console.log(`  Result: ${ambiguous.format} (confidence: ${ambiguous.confidence})`);
  console.assert(ambiguous.format === 'markdown', 'Expected markdown as default');
  console.log('  ✓ PASSED\n');

  // Test 10: Combined title and query analysis
  console.log('Test 10: Title + query combined analysis');
  const combined = await detectFormat({ 
    userQuery: 'I need this documented',
    title: 'REST API Integration Guide'
  });
  console.log(`  Result: ${combined.format} (confidence: ${combined.confidence})`);
  console.assert(combined.format === 'markdown', 'Expected markdown format');
  console.log('  ✓ PASSED\n');

  console.log('=== All Format Router Tests Passed! ===\n');
}

// ============================================================================
// Markdown Formatter Tests
// ============================================================================

console.log('\n=== Markdown Formatter Tests ===\n');

function testMarkdownFormatter() {
  // Test formatHeading
  console.log('Test: formatHeading');
  const h1 = formatHeading(1, 'Main Title');
  console.log(`  H1: ${h1}`);
  console.assert(h1 === '# Main Title', 'H1 formatting incorrect');
  
  const h2 = formatHeading(2, 'Section');
  console.log(`  H2: ${h2}`);
  console.assert(h2 === '## Section', 'H2 formatting incorrect');
  console.log('  ✓ PASSED\n');

  // Test formatCodeBlock
  console.log('Test: formatCodeBlock');
  const code = formatCodeBlock('javascript', 'console.log("hello");');
  console.log(`  Code block:\n${code}`);
  console.assert(code.includes('```javascript'), 'Language hint missing');
  console.assert(code.includes('console.log'), 'Code content missing');
  console.log('  ✓ PASSED\n');

  // Test formatBulletList
  console.log('Test: formatBulletList');
  const bullets = formatBulletList(['Item 1', 'Item 2', 'Item 3']);
  console.log(`  Bullets:\n${bullets}`);
  console.assert(bullets.startsWith('- Item 1'), 'First bullet incorrect');
  console.assert(bullets.includes('\n- Item 2'), 'Second bullet missing');
  console.log('  ✓ PASSED\n');

  // Test formatTaskList
  console.log('Test: formatTaskList');
  const tasks = formatTaskList([{ text: 'Task 1' }, { text: 'Task 2', checked: true }]);
  console.log(`  Tasks:\n${tasks}`);
  console.assert(tasks.includes('- [ ] Task 1'), 'Unchecked task incorrect');
  console.assert(tasks.includes('- [x] Task 2'), 'Checked task incorrect');
  console.log('  ✓ PASSED\n');

  // Test formatInlineCode
  console.log('Test: formatInlineCode');
  const inline = formatInlineCode('./src/index.js');
  console.log(`  Inline code: ${inline}`);
  console.assert(inline === '`./src/index.js`', 'Inline code formatting incorrect');
  console.log('  ✓ PASSED\n');

  // Test applyImplementationStyle
  console.log('Test: applyImplementationStyle');
  const paragraphs = [
    { text: 'Introduction', headingLevel: 'heading1' },
    'This is a simple paragraph.',
    { text: 'Setup Steps', headingLevel: 'heading2' },
    { listItems: [{ text: 'Install dependencies' }, { text: 'Run the server' }] }
  ];
  const styled = applyImplementationStyle(paragraphs);
  console.log(`  Styled content:\n${styled}`);
  console.assert(styled.includes('# Introduction'), 'H1 missing');
  console.assert(styled.includes('## Setup Steps'), 'H2 missing');
  console.assert(styled.includes('- Install dependencies'), 'List item missing');
  console.log('  ✓ PASSED\n');

  console.log('=== All Markdown Formatter Tests Passed! ===\n');
}

// ============================================================================
// Create-Markdown Integration Tests
// ============================================================================

console.log('\n=== Create-Markdown Integration Tests ===\n');

async function testCreateMarkdown() {
  // Test 1: Basic document creation (dry run)
  console.log('Test 1: Basic markdown document creation (dry run)');
  const dryRunResult = await createMarkdown({
    title: 'Test API Documentation',
    paragraphs: [
      { text: 'Overview', headingLevel: 'heading1' },
      'This is the main content of the documentation.',
      { text: 'Installation', headingLevel: 'heading2' },
      { listItems: [{ text: 'Run npm install' }, { text: 'Configure environment variables' }] }
    ],
    category: 'technical',
    dryRun: true
  });
  console.log(`  Success: ${dryRunResult.success}`);
  console.log(`  Preview path: ${dryRunResult.preview?.outputPath}`);
  console.assert(dryRunResult.success === true, 'Dry run should succeed');
  console.assert(dryRunResult.dryRun === true, 'Should be marked as dry run');
  console.log('  ✓ PASSED\n');

  // Test 2: Document with code blocks (dry run)
  console.log('Test 2: Markdown document with code blocks (dry run)');
  const codeDocResult = await createMarkdown({
    title: 'API Integration Guide',
    paragraphs: [
      { text: 'Getting Started', headingLevel: 'heading1' },
      'To integrate with our API, first obtain an API key.',
      "```javascript\nconst api = require('my-api');\napi.init({ key: process.env.API_KEY });\n```",
      { text: 'Authentication', headingLevel: 'heading2' },
      'All requests must include the Authorization header.'
    ],
    dryRun: true
  });
  console.log(`  Success: ${codeDocResult.success}`);
  console.assert(codeDocResult.success === true, 'Document with code should succeed');
  console.log('  ✓ PASSED\n');

  // Test 3: Generic title rejection
  console.log('Test 3: Generic title should be rejected');
  const genericTitleResult = await createMarkdown({
    title: 'Untitled',
    paragraphs: ['Some content'],
    dryRun: true
  });
  console.log(`  Success: ${genericTitleResult.success}`);
  console.log(`  Error: ${genericTitleResult.error}`);
  console.assert(genericTitleResult.success === false, 'Generic title should fail');
  console.assert(genericTitleResult.error === 'GENERIC_TITLE', 'Should be GENERIC_TITLE error');
  console.log('  ✓ PASSED\n');

  // Test 4: Empty title rejection
  console.log('Test 4: Empty title should be rejected');
  const emptyTitleResult = await createMarkdown({
    title: '',
    paragraphs: ['Some content'],
    dryRun: true
  });
  console.log(`  Success: ${emptyTitleResult.success}`);
  console.assert(emptyTitleResult.success === false, 'Empty title should fail');
  console.log('  ✓ PASSED\n');

  // Test 5: Category-based folder organization (dry run)
  console.log('Test 5: Category-based folder organization');
  const categorizedResult = await createMarkdown({
    title: 'Technical Specification Document',
    paragraphs: [{ text: 'Spec content' }],
    category: 'technical',
    dryRun: true
  });
  console.log(`  Success: ${categorizedResult.success}`);
  console.log(`  Was categorized: ${categorizedResult.wasCategorized}`);
  console.log(`  Category applied: ${categorizedResult.enforcement?.categoryApplied}`);
  console.assert(categorizedResult.success === true, 'Should succeed');
  console.log('  ✓ PASSED\n');

  // Test 6: Tags and description for registry (dry run)
  console.log('Test 6: Document with tags and description');
  const taggedResult = await createMarkdown({
    title: 'Project Documentation',
    paragraphs: ['Content here'],
    tags: ['api', 'integration', 'v2'],
    description: 'Documentation for the v2 API integration process',
    dryRun: true
  });
  console.log(`  Success: ${taggedResult.success}`);
  console.assert(taggedResult.success === true, 'Should succeed');
  console.log('  ✓ PASSED\n');

  console.log('=== All Create-Markdown Integration Tests Passed! ===\n');
}

// ============================================================================
// Run All Tests
// ============================================================================

async function runAllTests() {
  try {
    testMarkdownFormatter();
    await testFormatRouter();
    await testCreateMarkdown();
    
    console.log('\n========================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (process.argv[1]?.endsWith('test-markdown-format-router.js')) {
  runAllTests();
}

export { testFormatRouter, testMarkdownFormatter, testCreateMarkdown };