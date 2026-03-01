#!/usr/bin/env node

/**
 * Integration Test Runner
 * 
 * This script runs all integration tests for the MCP server,
 * simulating how a model would interact with the server.
 */

import { MCPServerHarness } from './harness.js';
import { ResponseEvaluator } from './evaluator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
};

/**
 * Integration Test Runner
 */
export class IntegrationTestRunner {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.harness = new MCPServerHarness({
      verbose: options.verbose,
      timeout: options.timeout || 30000
    });
    this.evaluator = new ResponseEvaluator({
      verbose: options.verbose
    });
    this.results = [];
  }

  /**
   * Run all integration tests
   */
  async runAllTests() {
    console.log(`${colors.cyan}${colors.bold}MCP Server Integration Tests${colors.reset}\n`);

    // Test scenarios
    const scenarios = [
      {
        name: 'doc-creation',
        description: 'Create a document using create-doc tool',
        test: this._testDocCreation.bind(this)
      },
      {
        name: 'excel-creation',
        description: 'Create an Excel workbook using create-excel tool',
        test: this._testExcelCreation.bind(this)
      },
      {
        name: 'read-doc-summary',
        description: 'Read a document summary using read-doc tool',
        test: this._testReadDocSummary.bind(this)
      },
      {
        name: 'organization',
        description: 'Test docs/ folder enforcement',
        test: this._testOrganization.bind(this)
      },
      {
        name: 'duplicate-prevention',
        description: 'Test duplicate file prevention',
        test: this._testDuplicatePrevention.bind(this)
      }
    ];

    let passed = 0;
    let failed = 0;

    for (const scenario of scenarios) {
      console.log(`${colors.bold}Testing: ${scenario.name}${colors.reset}`);
      console.log(`  ${scenario.description}\n`);

      try {
        const result = await scenario.test();
        this.results.push({
          name: scenario.name,
          passed: result.passed,
          score: result.score,
          details: result.details || []
        });

        if (result.passed) {
          console.log(`  ${colors.green}✓ PASS${colors.reset} (${result.score.toFixed(0)}%)\n`);
          passed++;
        } else {
          console.log(`  ${colors.red}✗ FAIL${colors.reset} (${result.score.toFixed(0)}%)\n`);
          failed++;
        }
      } catch (error) {
        console.log(`  ${colors.red}✗ FAIL${colors.reset} (Error: ${error.message})\n`);
        this.results.push({
          name: scenario.name,
          passed: false,
          score: 0,
          error: error.message
        });
        failed++;
      }
    }

    // Print summary
    console.log(`${colors.bold}========================================${colors.reset}`);
    console.log(`${colors.bold}Integration Test Summary${colors.reset}`);
    console.log(`${colors.bold}========================================${colors.reset}`);
    console.log(`Total: ${this.results.length}`);
    console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
    console.log('');

    // Check for format issues
    const formatIssues = this.results.filter(r => !r.passed && r.error);
    if (formatIssues.length > 0) {
      console.log(`${colors.yellow}Format Issues:${colors.reset}`);
      for (const issue of formatIssues) {
        console.log(`  - ${issue.name}: ${issue.error}`);
      }
      console.log('');
    }

    return {
      passed,
      failed,
      total: this.results.length
    };
  }

  /**
   * Test document creation
   */
  async _testDocCreation() {
    const result = await this.harness.callTool('create-doc', {
      title: 'Test Document - Integration Test',
      paragraphs: [
        'This is a test document created during integration testing.',
        'It contains multiple paragraphs to test formatting.',
        { text: 'Heading Level 2', headingLevel: 'heading2' },
        'More content here.'
      ],
      outputPath: './test/output/integration-test.docx',
      preventDuplicates: false
    });

    // Validate the output
    const validation = this.evaluator.validateToolOutput({
      content: [{ type: 'text', text: JSON.stringify(result) }]
    }, 'create-doc');

    // Check enforcement
    const hasEnforcement = result.enforcement !== undefined;
    const hasCategory = result.category !== undefined;
    const hasStylePreset = result.stylePreset !== undefined;

    // Calculate score
    let score = 0;
    const checks = [];

    checks.push({
      name: 'Success status',
      passed: result.success === true,
      expected: 'success: true',
      actual: `success: ${result.success}`
    });
    score += result.success ? 20 : 0;

    checks.push({
      name: 'File path exists',
      passed: !!result.filePath,
      expected: 'filePath: string',
      actual: `filePath: ${result.filePath || 'missing'}`
    });
    score += result.filePath ? 20 : 0;

    checks.push({
      name: 'Enforcement info',
      passed: hasEnforcement,
      expected: 'enforcement: object',
      actual: `enforcement: ${hasEnforcement ? 'present' : 'missing'}`
    });
    score += hasEnforcement ? 20 : 0;

    checks.push({
      name: 'Category info',
      passed: hasCategory,
      expected: 'category: string',
      actual: `category: ${hasCategory ? result.category : 'missing'}`
    });
    score += hasCategory ? 15 : 0;

    checks.push({
      name: 'Style info',
      passed: hasStylePreset,
      expected: 'stylePreset: string',
      actual: `stylePreset: ${hasStylePreset ? result.stylePreset : 'missing'}`
    });
    score += hasStylePreset ? 15 : 0;

    checks.push({
      name: 'Message format',
      passed: result.message && result.message.includes('WRITTEN TO DISK'),
      expected: 'message contains WRITTEN TO DISK',
      actual: `message: ${result.message ? (result.message.includes('WRITTEN TO DISK') ? 'contains WRITTEN TO DISK' : 'missing') : 'missing'}`
    });
    score += (result.message && result.message.includes('WRITTEN TO DISK')) ? 10 : 0;

    return {
      passed: score >= 80,
      score: score,
      details: checks
    };
  }

  /**
   * Test Excel creation
   */
  async _testExcelCreation() {
    const result = await this.harness.callTool('create-excel', {
      title: 'Test Excel - Integration Test',
      sheets: [
        {
          name: 'Test Data',
          data: [
            ['Column 1', 'Column 2', 'Column 3'],
            ['Value 1', 'Value 2', 'Value 3'],
            ['Value 4', 'Value 5', 'Value 6']
          ]
        }
      ],
      outputPath: './test/output/integration-test.xlsx',
      preventDuplicates: false
    });

    let score = 0;
    const checks = [];

    checks.push({
      name: 'Success status',
      passed: result.success === true,
      expected: 'success: true',
      actual: `success: ${result.success}`
    });
    score += result.success ? 25 : 0;

    checks.push({
      name: 'File path exists',
      passed: !!result.filePath,
      expected: 'filePath: string',
      actual: `filePath: ${result.filePath || 'missing'}`
    });
    score += result.filePath ? 25 : 0;

    checks.push({
      name: 'Enforcement info',
      passed: result.enforcement !== undefined,
      expected: 'enforcement: object',
      actual: `enforcement: ${result.enforcement ? 'present' : 'missing'}`
    });
    score += result.enforcement ? 25 : 0;

    checks.push({
      name: 'Style info',
      passed: result.stylePreset !== undefined,
      expected: 'stylePreset: string',
      actual: `stylePreset: ${result.stylePreset || 'missing'}`
    });
    score += result.stylePreset ? 25 : 0;

    return {
      passed: score >= 80,
      score: score,
      details: checks
    };
  }

  /**
   * Test read-doc summary
   */
  async _testReadDocSummary() {
    const result = await this.harness.callTool('read-doc', {
      filePath: './test/test-doc-input.json',
      mode: 'summary'
    });

    let score = 0;
    const checks = [];

    checks.push({
      name: 'Content array exists',
      passed: result.content && Array.isArray(result.content),
      expected: 'content: array',
      actual: `content: ${result.content ? 'present' : 'missing'}`
    });
    score += (result.content && Array.isArray(result.content)) ? 33 : 0;

    checks.push({
      name: 'Content type is text',
      passed: result.content && result.content[0] && result.content[0].type === 'text',
      expected: 'content[0].type: text',
      actual: `content[0].type: ${result.content?.[0]?.type || 'missing'}`
    });
    score += (result.content?.[0]?.type === 'text') ? 33 : 0;

    checks.push({
      name: 'Content has text',
      passed: result.content && result.content[0] && result.content[0].text && result.content[0].text.length > 0,
      expected: 'content[0].text: non-empty string',
      actual: `content[0].text: ${result.content?.[0]?.text ? (result.content[0].text.length > 0 ? 'has text' : 'empty') : 'missing'}`
    });
    score += (result.content?.[0]?.text && result.content[0].text.length > 0) ? 34 : 0;

    return {
      passed: score >= 80,
      score: score,
      details: checks
    };
  }

  /**
   * Test organization enforcement
   */
  async _testOrganization() {
    const result = await this.harness.callTool('create-doc', {
      title: 'Organization Test Document',
      paragraphs: ['Test content'],
      outputPath: './test/output/org-test.docx',
      enforceDocsFolder: true
    });

    let score = 0;
    const checks = [];

    checks.push({
      name: 'Docs folder enforced',
      passed: result.filePath && result.filePath.includes('docs/'),
      expected: 'filePath contains docs/',
      actual: `filePath: ${result.filePath || 'missing'}`
    });
    score += (result.filePath && result.filePath.includes('docs/')) ? 40 : 0;

    checks.push({
      name: 'Enforcement flag set',
      passed: result.enforcement && result.enforcement.docsFolderEnforced === true,
      expected: 'enforcement.docsFolderEnforced: true',
      actual: `enforcement.docsFolderEnforced: ${result.enforcement?.docsFolderEnforced}`
    });
    score += (result.enforcement?.docsFolderEnforced === true) ? 30 : 0;

    checks.push({
      name: 'Category set',
      passed: result.category !== undefined && result.category !== null,
      expected: 'category: string',
      actual: `category: ${result.category || 'missing'}`
    });
    score += (result.category !== undefined && result.category !== null) ? 30 : 0;

    return {
      passed: score >= 80,
      score: score,
      details: checks
    };
  }

  /**
   * Test duplicate prevention
   */
  async _testDuplicatePrevention() {
    // Create first document
    const result1 = await this.harness.callTool('create-doc', {
      title: 'Duplicate Prevention Test',
      paragraphs: ['First version'],
      outputPath: './test/output/dup-test.docx',
      preventDuplicates: true
    });

    // Try to create duplicate
    const result2 = await this.harness.callTool('create-doc', {
      title: 'Duplicate Prevention Test',
      paragraphs: ['Second version'],
      outputPath: './test/output/dup-test.docx',
      preventDuplicates: true
    });

    let score = 0;
    const checks = [];

    checks.push({
      name: 'First creation succeeds',
      passed: result1.success === true,
      expected: 'success: true',
      actual: `success: ${result1.success}`
    });
    score += result1.success ? 33 : 0;

    checks.push({
      name: 'Duplicate prevented',
      passed: result2.success === false && result2.duplicate === true,
      expected: 'success: false, duplicate: true',
      actual: `success: ${result2.success}, duplicate: ${result2.duplicate}`
    });
    score += (result2.success === false && result2.duplicate === true) ? 33 : 0;

    checks.push({
      name: 'Duplicate message',
      passed: result2.message && (result2.message.includes('ALREADY EXISTS') || result2.message.includes('Duplicate')),
      expected: 'message contains ALREADY EXISTS or Duplicate',
      actual: `message: ${result2.message ? (result2.message.includes('ALREADY EXISTS') || result2.message.includes('Duplicate') ? 'correct' : 'incorrect') : 'missing'}`
    });
    score += (result2.message && (result2.message.includes('ALREADY EXISTS') || result2.message.includes('Duplicate'))) ? 34 : 0;

    return {
      passed: score >= 80,
      score: score,
      details: checks
    };
  }

  /**
   * Generate report
   */
  generateReport() {
    const report = {
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length
      },
      details: this.results
    };

    return report;
  }
}

/**
 * Run integration tests
 */
async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  const runner = new IntegrationTestRunner({ verbose });

  try {
    const results = await runner.runAllTests();
    
    console.log(`${colors.bold}\n========================================${colors.reset}`);
    console.log(`${colors.bold}Final Results${colors.reset}`);
    console.log(`${colors.bold}========================================${colors.reset}`);
    console.log(`Total: ${results.total}`);
    console.log(`${colors.green}Passed: ${results.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`);

    if (results.failed > 0) {
      console.log('\nFailed tests:');
      for (const result of runner.results) {
        if (!result.passed) {
          console.log(`  - ${result.name}: ${result.error || 'Failed'}`);
        }
      }
    }

    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset} ${error.message}`);
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('run-integration-tests.js');
if (isMainModule) {
  main();
}
