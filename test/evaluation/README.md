# MCP Server Evaluation Framework

## Overview

This evaluation framework tests the MCP server with **real model interactions** rather than unit tests on individual functions. It simulates how an actual AI model would use the MCP server and validates the output format and quality.

## Test Strategy

The evaluation framework uses a **model-in-the-loop** testing approach:

1. **MCP Server Test Harness**: Runs the MCP server and simulates model interactions
2. **Output Quality Evaluator**: Validates the format and content of MCP responses
3. **Baseline Metrics**: Establishes expected output patterns for comparison

## Directory Structure

```
test/evaluation/
├── harness.js          # MCP server test harness
├── evaluator.js        # Output quality evaluator
├── baselines/          # Baseline metrics and expected outputs
│   ├── doc-creation/
│   └── excel-creation/
├── scenarios/          # Test scenarios (model interaction simulations)
└── metrics/            # Quality metrics definitions
```

## Running Tests

```bash
# Run all evaluation tests
node test/evaluation/harness.js

# Run specific scenario
node test/evaluation/harness.js --scenario doc-creation

# Run with verbose output
node test/evaluation/harness.js --verbose

# Generate baseline metrics
node test/evaluation/baselines.js --generate
```

## Key Components

### 1. MCP Server Test Harness (`harness.js`)

Runs the MCP server and simulates model interactions:

```javascript
const harness = new MCPServerHarness({
  serverPath: './src/index.js',
  timeout: 30000,
  verbose: true
});

// Simulate model calling tools
const result = await harness.callTool('create-doc', {
  title: 'Test Document',
  paragraphs: ['Test content'],
  outputPath: './output/test.docx'
});
```

### 2. Output Quality Evaluator (`evaluator.js`)

Validates MCP response format and content:

```javascript
const evaluator = new ResponseEvaluator();

// Check if response follows MCP format
const isValidFormat = evaluator.validateMCPFormat(response);

// Check if response has correct tool output
const isValidToolOutput = evaluator.validateToolOutput(response, 'create-doc');

// Check format correctness
const formatScore = evaluator.evaluateFormatQuality(response);
```

### 3. Baseline Metrics

Establishes expected output patterns:

```javascript
// Document creation baseline
{
  success: true,
  filePath: string,
  enforcement: {
    docsFolderEnforced: boolean,
    duplicatePrevented: boolean
  },
  stylePreset: string,
  category: string,
  message: string containing 'WRITTEN TO DISK'
}
```

## Test Scenarios

### 1. Document Creation Scenario

Tests the model's ability to create documents using the MCP server:

```javascript
{
  name: 'doc-creation',
  description: 'Model creates a document using create-doc tool',
  steps: [
    {
      name: 'Tool selection',
      check: 'Tool name is "create-doc"',
    },
    {
      name: 'Title validation',
      check: 'Title is descriptive and specific',
    },
    {
      name: 'Output format',
      check: 'Response contains filePath and success status',
    },
    {
      name: 'Enforcement info',
      check: 'Response includes enforcement details',
    }
  ]
}
```

### 2. Excel Creation Scenario

Tests Excel workbook creation:

```javascript
{
  name: 'excel-creation',
  description: 'Model creates an Excel workbook using create-excel tool',
  steps: [
    {
      name: 'Tool selection',
      check: 'Tool name is "create-excel"',
    },
    {
      name: 'Sheet names',
      check: 'Sheet names are descriptive',
    },
    {
      name: 'Output format',
      check: 'Response contains filePath and success status',
    }
  ]
}
```

### 3. Document Reading Scenario

Tests document analysis:

```javascript
{
  name: 'read-doc',
  description: 'Model reads and analyzes documents using read-doc tool',
  steps: [
    {
      name: 'Tool selection',
      check: 'Tool name is "read-doc"',
    },
    {
      name: 'Mode selection',
      check: 'Appropriate mode (summary/indepth/focused) is used',
    },
    {
      name: 'Response format',
      check: 'Response follows expected format for mode',
    }
  ]
}
```

## Baseline Metrics

### Document Creation Baseline

```javascript
{
  format: {
    success: true,
    filePath: string,
    message: string
  },
  content: {
    hasEnforcementInfo: true,
    hasStyleInfo: true,
    hasCategoryInfo: true
  },
  quality: {
    messageContainsDisk: true,
    filePathIsAbsolute: true,
    enforcementStructure: {
      docsFolderEnforced: boolean,
      duplicatePrevented: boolean,
      categorized: boolean
    }
  }
}
```

### Excel Creation Baseline

```javascript
{
  format: {
    success: true,
    filePath: string,
    message: string
  },
  content: {
    hasEnforcementInfo: true,
    hasStyleInfo: true
  },
  quality: {
    messageContainsDisk: true,
    filePathIsAbsolute: true
  }
}
```

## Integration with MCP Server

The evaluation framework:

1. **Starts the MCP server** using the stdio transport
2. **Simulates model tool calls** using the CallToolRequest
3. **Validates responses** against expected format
4. **Measures performance** metrics (response time, accuracy)
5. **Generates quality reports** with pass/fail status

## Usage Example

```javascript
import { MCPServerHarness } from './evaluation/harness.js';

const harness = new MCPServerHarness({
  serverPath: './src/index.js',
  verbose: true
});

// Test document creation
const result = await harness.testScenario('doc-creation', {
  title: 'Q1 2026 Report',
  paragraphs: ['Test content'],
  outputPath: './output/q1-report.docx'
});

console.log('Test Results:', result);
console.log('Pass/Fail:', result.passed ? 'PASS' : 'FAIL');
console.log('Quality Score:', result.qualityScore);
```

## Continuous Evaluation

The framework supports continuous evaluation:

```javascript
// Run all scenarios
const results = await harness.runAllScenarios();

// Check for regressions
const regressions = results.filter(r => !r.passed);

// Generate report
const report = generateEvaluationReport(results);
```

## Troubleshooting

### Common Issues

1. **Server not starting**: Check if the server path is correct
2. **Timeout errors**: Increase the timeout value
3. **Output format mismatch**: Check the baseline metrics

### Debug Mode

```javascript
const harness = new MCPServerHarness({
  verbose: true,
  debug: true
});
```

## Contributing

When adding new tools or features:

1. Update the baseline metrics
2. Add new test scenarios
3. Run the full evaluation suite
5. Update this documentation