#!/usr/bin/env node

/**
 * Output Quality Evaluator
 * 
 * This module validates the format and content of MCP responses.
 * It checks for:
 * - MCP response format correctness
 * - Tool output format
 * - Content quality metrics
 * - Format consistency
 */

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * Response Evaluator
 */
export class ResponseEvaluator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.baselinePath = options.baselinePath || path.join(__dirname, 'baselines');
  }

  /**
   * Validate MCP response format
   */
  validateMCPFormat(response) {
    const issues = [];

    // Check response structure
    if (!response || typeof response !== 'object') {
      issues.push('Response is not an object');
      return { valid: false, issues };
    }

    // Check for content array
    if (!response.content || !Array.isArray(response.content)) {
      issues.push('Response missing "content" array');
      return { valid: false, issues };
    }

    // Check content items
    for (let i = 0; i < response.content.length; i++) {
      const item = response.content[i];
      if (!item.type || item.type !== 'text') {
        issues.push(`Content item ${i} missing or invalid "type" (expected "text")`);
      }
      if (!item.text || typeof item.text !== 'string') {
        issues.push(`Content item ${i} missing or invalid "text"`);
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Validate tool-specific output
   */
  validateToolOutput(response, toolName) {
    const issues = [];

    // Check if response has content
    if (!response.content || !Array.isArray(response.content)) {
      issues.push('Response missing "content" array');
      return { valid: false, issues };
    }

    const content = response.content[0];
    if (!content || !content.text) {
      issues.push('Response missing content text');
      return { valid: false, issues };
    }

    // Parse the JSON content
    let parsed;
    try {
      parsed = JSON.parse(content.text);
    } catch (e) {
      issues.push(`Content is not valid JSON: ${e.message}`);
      return { valid: false, issues };
    }

    // Validate based on tool type
    switch (toolName) {
      case 'create-doc':
        return this._validateCreateDocOutput(parsed);
      case 'create-excel':
        return this._validateCreateExcelOutput(parsed);
      case 'read-doc':
        return this._validateReadDocOutput(parsed);
      case 'edit-doc':
        return this._validateEditDocOutput(parsed);
      case 'edit-excel':
        return this._validateEditExcelOutput(parsed);
      default:
        return { valid: true, issues };
    }
  }

  /**
   * Validate create-doc output
   */
  _validateCreateDocOutput(parsed) {
    const issues = [];

    // Required fields
    if (parsed.success === undefined) {
      issues.push('Missing "success" field');
    }

    if (parsed.filePath === undefined) {
      issues.push('Missing "filePath" field');
    }

    if (parsed.message === undefined) {
      issues.push('Missing "message" field');
    }

    // Check message content
    if (parsed.message && !parsed.message.includes('WRITTEN TO DISK')) {
      issues.push('Message should contain "WRITTEN TO DISK"');
    }

    // Check enforcement structure
    if (parsed.enforcement) {
      const requiredEnforcementFields = ['docsFolderEnforced', 'duplicatePrevented', 'categorized'];
      for (const field of requiredEnforcementFields) {
        if (parsed.enforcement[field] === undefined) {
          issues.push(`Missing "enforcement.${field}" field`);
        }
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Validate create-excel output
   */
  _validateCreateExcelOutput(parsed) {
    const issues = [];

    // Required fields
    if (parsed.success === undefined) {
      issues.push('Missing "success" field');
    }

    if (parsed.filePath === undefined) {
      issues.push('Missing "filePath" field');
    }

    if (parsed.message === undefined) {
      issues.push('Missing "message" field');
    }

    // Check message content
    if (parsed.message && !parsed.message.includes('WRITTEN TO DISK')) {
      issues.push('Message should contain "WRITTEN TO DISK"');
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Validate read-doc output
   */
  _validateReadDocOutput(parsed) {
    const issues = [];

    // Check content structure
    if (!parsed.content || !Array.isArray(parsed.content)) {
      issues.push('Missing or invalid "content" array');
    } else if (parsed.content.length === 0) {
      issues.push('Content array is empty');
    } else {
      const firstContent = parsed.content[0];
      if (!firstContent.type || firstContent.type !== 'text') {
        issues.push('First content item should have type "text"');
      }
      if (!firstContent.text || typeof firstContent.text !== 'string') {
        issues.push('First content item should have valid text');
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Validate edit-doc output
   */
  _validateEditDocOutput(parsed) {
    const issues = [];

    // Required fields
    if (parsed.success === undefined) {
      issues.push('Missing "success" field');
    }

    if (parsed.filePath === undefined) {
      issues.push('Missing "filePath" field');
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Validate edit-excel output
   */
  _validateEditExcelOutput(parsed) {
    const issues = [];

    // Required fields
    if (parsed.success === undefined) {
      issues.push('Missing "success" field');
    }

    if (parsed.filePath === undefined) {
      issues.push('Missing "filePath" field');
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Evaluate format quality
   */
  evaluateFormatQuality(response) {
    let score = 0;
    const maxScore = 100;
    const details = [];

    // Check MCP format (20 points)
    const formatCheck = this.validateMCPFormat(response);
    if (formatCheck.valid) {
      score += 20;
      details.push({ name: 'MCP Format', score: 20, max: 20 });
    } else {
      details.push({ name: 'MCP Format', score: 0, max: 20, issues: formatCheck.issues });
    }

    // Check content quality (30 points)
    let contentScore = 0;
    if (response.content && response.content[0] && response.content[0].text) {
      const text = response.content[0].text;
      
      // Check for proper formatting
      if (text.length > 0 && text.length < 10000) {
        contentScore += 10;
      }
      
      // Check for proper JSON structure
      try {
        JSON.parse(text);
        contentScore += 10;
      } catch (e) {
        // Not JSON, might be plain text
        contentScore += 5;
      }
      
      // Check for required keywords
      if (text.includes('WRITTEN TO DISK') || text.includes('Document Summary')) {
        contentScore += 10;
      }
    }
    score += contentScore;
    details.push({ name: 'Content Quality', score: contentScore, max: 30 });

    // Check tool-specific format (30 points)
    const toolCheck = this._checkToolFormat(response);
    score += toolCheck.score;
    details.push({ name: 'Tool Format', score: toolCheck.score, max: 30, issues: toolCheck.issues });

    // Check error handling (20 points)
    const errorCheck = this._checkErrorHandling(response);
    score += errorCheck.score;
    details.push({ name: 'Error Handling', score: errorCheck.score, max: 20, issues: errorCheck.issues });

    return {
      score,
      maxScore,
      percentage: (score / maxScore) * 100,
      details,
      pass: score >= 80
    };
  }

  /**
   * Check tool-specific format
   */
  _checkToolFormat(response) {
    let score = 0;
    const issues = [];

    if (!response.content || !response.content[0] || !response.content[0].text) {
      return { score: 0, issues: ['No content in response'] };
    }

    let parsed;
    try {
      parsed = JSON.parse(response.content[0].text);
    } catch (e) {
      return { score: 0, issues: ['Content is not valid JSON'] };
    }

    // Check for success field
    if (parsed.success !== undefined) {
      score += 10;
    } else {
      issues.push('Missing "success" field');
    }

    // Check for filePath or content field
    if (parsed.filePath || parsed.content) {
      score += 10;
    } else {
      issues.push('Missing "filePath" or "content" field');
    }

    // Check for message field
    if (parsed.message) {
      score += 10;
    } else {
      issues.push('Missing "message" field');
    }

    return { score, issues };
  }

  /**
   * Check error handling
   */
  _checkErrorHandling(response) {
    let score = 0;
    const issues = [];

    if (!response.content || !response.content[0] || !response.content[0].text) {
      return { score: 0, issues: ['No content in response'] };
    }

    const text = response.content[0].text;

    // Check for error indicators
    if (text.includes('Error:') || text.includes('error:')) {
      // Check if there's an isError flag
      if (response.isError === true) {
        score += 10;
      } else {
        issues.push('Error message without isError flag');
      }
    } else if (response.isError === true) {
      issues.push('isError flag without error message');
    } else {
      score += 10;
    }

    return { score, issues };
  }

  /**
   * Compare against baseline
   */
  async compareAgainstBaseline(response, baselineName) {
    const issues = [];

    // Load baseline
    let baseline;
    try {
      const baselinePath = path.join(this.baselinePath, `${baselineName}.json`);
      const baselineContent = await fs.readFile(baselinePath, 'utf-8');
      baseline = JSON.parse(baselineContent);
    } catch (e) {
      return { valid: false, issues: [`Failed to load baseline: ${e.message}`] };
    }

    // Compare key fields
    if (!response.content || !response.content[0]) {
      issues.push('Response missing content');
      return { valid: false, issues };
    }

    const responseContent = response.content[0];
    const baselineContent = baseline.content?.[0];

    if (!baselineContent) {
      issues.push('Baseline missing content');
      return { valid: false, issues };
    }

    // Check for key fields
    const requiredFields = ['success', 'filePath', 'message'];
    for (const field of requiredFields) {
      if (responseContent[field] === undefined && baselineContent[field] !== undefined) {
        issues.push(`Missing required field: ${field}`);
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Generate quality report
   */
  generateReport(results) {
    const report = {
      summary: {
        total: results.length,
        passed: 0,
        failed: 0,
        totalScore: 0
      },
      details: []
    };

    for (const result of results) {
      report.details.push({
        name: result.name,
        passed: result.passed,
        score: result.score,
        issues: result.issues || []
      });

      if (result.passed) {
        report.summary.passed++;
      } else {
        report.summary.failed++;
      }

      report.summary.totalScore += result.score || 0;
    }

    report.summary.averageScore = report.summary.total / results.length > 0 
      ? report.summary.totalScore / results.length 
      : 0;

    return report;
  }
}

/**
 * Run evaluator if executed directly
 */
async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const baseline = args.find(arg => arg.startsWith('--baseline='))?.split('=')[1];

  console.log(`${colors.cyan}${colors.bold}Response Evaluator${colors.reset}\n`);

  const evaluator = new ResponseEvaluator({ verbose });

  // Example test
  const testResponse = {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        filePath: '/path/to/file.docx',
        message: 'DOCX FILE WRITTEN TO DISK at: /path/to/file.docx'
      })
    }]
  };

  console.log(`${colors.bold}Testing response format...${colors.reset}\n`);

  // Validate MCP format
  const formatCheck = evaluator.validateMCPFormat(testResponse);
  console.log(`MCP Format: ${formatCheck.valid ? colors.green + '✓ PASS' : colors.red + '✗ FAIL'}${colors.reset}`);
  if (!formatCheck.valid) {
    console.log(`  Issues: ${formatCheck.issues.join(', ')}`);
  }

  // Validate tool output
  const toolCheck = evaluator.validateToolOutput(testResponse, 'create-doc');
  console.log(`Tool Output: ${toolCheck.valid ? colors.green + '✓ PASS' : colors.red + '✗ FAIL'}${colors.reset}`);
  if (!toolCheck.valid) {
    console.log(`  Issues: ${toolCheck.issues.join(', ')}`);
  }

  // Evaluate format quality
  const quality = evaluator.evaluateFormatQuality(testResponse);
  console.log(`Format Quality: ${colors.green + quality.percentage.toFixed(0) + '%' + colors.reset}`);
  console.log(`  Passed: ${quality.pass ? '✓' : '✗'}`);
  console.log(`  Score: ${quality.score}/${quality.maxScore}`);

  // Compare against baseline
  if (baseline) {
    const baselineCheck = await evaluator.compareAgainstBaseline(testResponse, baseline);
    console.log(`Baseline Comparison: ${baselineCheck.valid ? colors.green + '✓ PASS' : colors.red + '✗ FAIL'}${colors.reset}`);
    if (!baselineCheck.valid) {
      console.log(`  Issues: ${baselineCheck.issues.join(', ')}`);
    }
  }

  console.log('\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('evaluator.js')) {
  main();
}
