/**
 * Format Router Service
 * 
 * Analyzes user prompts for keywords to recommend the appropriate document format
 * (markdown, docx, or excel) based on detected intent.
 */

// Document format constants
const DocumentFormat = {
  MARKDOWN: 'markdown',
  DOCX: 'docx',
  EXCEL: 'excel'
};

// Document type (tone/depth) constants
const DocumentType = {
  CONCISE: 'concise',
  FORMAL: 'formal',
  EXPLANATORY: 'explanatory',
  SCIENTIFIC: 'scientific'
};

// Keyword patterns for each format category
const KEYWORDS = {
  // Implementation/Technical keywords → markdown
  implementation: [
    'implementation', 'developer', 'dev', 'api', 'integration', 'spec', 'specification',
    'guide', 'tutorial', 'how-to', 'how to', 'code', 'build', 'create', 'write',
    'develop', 'deploy', 'configure', 'setup', 'install', 'use', 'practical',
    'hands-on', 'reference', 'documentation', 'technical details', 'architecture',
    'design', 'schema', 'endpoint', 'function', 'method', 'class', 'module',
    'library', 'sdk', 'instructions', 'steps', 'process', 'workflow', 'procedure',
    'explain', 'describe', 'show me how', 'technical', 'engineering', 'software',
    'programming', 'script', 'command', 'terminal', 'cli', 'shell', 'bash',
    'javascript', 'python', 'typescript', 'node', 'react', 'vue', 'angular',
    'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'database', 'sql', 'nosql',
    'frontend', 'backend', 'fullstack', 'web', 'mobile', 'app', 'application',
    'server', 'client', 'rest', 'graphql', 'microservice', 'monolith', 'ci/cd',
    'pipeline', 'testing', 'unit test', 'integration test', 'e2e', 'debugging',
    'refactor', 'optimize', 'performance', 'security', 'authentication', 'oauth',
    'jwt', 'session', 'cookie', 'cache', 'redis', 'elasticsearch', 'mongodb',
    'postgresql', 'mysql', 'sqlite', 'prisma', 'typeorm', 'orm', 'migration',
    'seed', 'fixture', 'mock', 'stub', 'spy', 'jest', 'mocha', 'chai', 'vitest',
    'webpack', 'vite', 'rollup', 'esbuild', 'babel', 'transpile', 'bundle',
    'npm', 'yarn', 'pnpm', 'package.json', 'dependency', 'import', 'export',
    'module', 'component', 'hook', 'state', 'props', 'context', 'redux', 'mobx',
    'vuex', 'pinia', 'signalr', 'websocket', 'sse', 'polling', 'async', 'await',
    'promise', 'callback', 'event', 'observer', 'reactive', 'immutable', 'functional'
  ],
  
  // High-Level/Stakeholder keywords → docx
  stakeholder: [
    'high level', 'executive', 'stakeholder', 'management', 'overview', 'summary',
    'presentation', 'report', 'proposal', 'business case', 'strategy', 'planning',
    'email', 'attach', 'attachment', 'confluence', 'share', 'distribute', 'formal',
    'official', 'document', 'board', 'c-level', 'leadership', 'senior', 'summary deck',
    'briefing', 'memo', 'memorandum', 'whitepaper', 'case study', 'roadmap',
    'milestone', 'deliverable', 'stakeholder update', 'status report', 'progress',
    'quarterly', 'annual', 'monthly review', 'kpi', 'metric', 'dashboard', 'chart',
    'graph', 'visualization', 'infographic', 'slide', 'powerpoint', 'deck',
    'pitch', 'investor', 'funding', 'startup', 'venture', 'cap table', 'equity',
    'revenue model', 'business plan', 'market analysis', 'competitor', 'swot',
    'risk assessment', 'compliance', 'regulatory', 'audit', 'governance', 'policy',
    'procedure document', 'standard operating procedure', 'sop', 'handbook',
    'employee', 'hr', 'onboarding', 'training', 'orientation', 'benefits',
    'compensation', 'performance review', 'goal setting', 'okr', 'kpi tracking'
  ],
  
  // Data/Spreadsheet keywords → excel
  data: [
    'budget', 'financial', 'numbers', 'data', 'spreadsheet', 'table', 'costs',
    'pricing', 'revenue', 'forecast', 'expenses', 'income', 'profit', 'loss',
    'quarter', 'q1', 'q2', 'q3', 'q4', 'ytd', 'monthly', 'weekly', 'tracker',
    'log', 'record', 'database', 'csv', 'import', 'export', 'calculation',
    'formula', 'sum', 'average', 'total', 'subtotal', 'pivot table', 'chart',
    'graph', 'trend', 'analysis', 'variance', 'actual vs budget', 'variance analysis',
    'cash flow', 'balance sheet', 'income statement', 'p&l', 'general ledger',
    'accounts payable', 'accounts receivable', 'invoicing', 'payment', 'transaction',
    'reconciliation', 'journal entry', 'chart of accounts', 'tax', 'vat', 'sales tax',
    'payroll', 'timesheet', 'hours', 'overtime', 'bonus', 'commission', 'expense report',
    'mileage', 'travel expenses', 'per diem', 'procurement', 'purchase order', 'vendor',
    'supplier', 'inventory', 'stock', 'warehouse', 'shipping', 'fulfillment', 'order',
    'sales pipeline', 'crm', 'lead', 'opportunity', 'deal', 'conversion rate',
    'customer acquisition cost', 'lifetime value', 'churn rate', 'retention'
  ],
  
  // Explicit format keywords → that format
  explicit: {
    markdown: ['markdown', '.md', 'md file'],
    docx: ['docx', 'word', 'document', '.docx', 'ms word', 'microsoft word'],
    excel: ['excel', 'xlsx', 'spreadsheet', '.xlsx', 'xls', '.xls']
  }
};

/**
 * Check if text contains implementation/technical keywords
 * @param {string} text - Text to analyze  
 * @returns {{ match: boolean, keywords: string[] }} Match result with matched keywords
 */
function hasImplementationKeywords(text) {
  const lowerText = text.toLowerCase();
  const matched = [];
  
  for (const keyword of KEYWORDS.implementation) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    }
  }
  
  return { match: matched.length > 0, keywords: matched };
}

/**
 * Check if text contains high-level/stakeholder keywords
 * @param {string} text - Text to analyze
 * @returns {{ match: boolean, keywords: string[] }} Match result with matched keywords
 */
function hasStakeholderKeywords(text) {
  const lowerText = text.toLowerCase();
  const matched = [];
  
  for (const keyword of KEYWORDS.stakeholder) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    }
  }
  
  return { match: matched.length > 0, keywords: matched };
}

/**
 * Check if text contains data/spreadsheet keywords  
 * @param {string} text - Text to analyze
 * @returns {{ match: boolean, keywords: string[] }} Match result with matched keywords
 */
function hasDataKeywords(text) {
  const lowerText = text.toLowerCase();
  const matched = [];
  
  for (const keyword of KEYWORDS.data) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    }
  }
  
  return { match: matched.length > 0, keywords: matched };
}

/**
 * Check for explicit format mentions in text
 * @param {string} text - Text to analyze
 * @returns {{ match: boolean, format?: string, keywords: string[] }} Match result
 */
function hasExplicitFormat(text) {
  const lowerText = text.toLowerCase();
  
  // Check markdown
  for (const keyword of KEYWORDS.explicit.markdown) {
    if (lowerText.includes(keyword)) {
      return { match: true, format: DocumentFormat.MARKDOWN, keywords: [keyword] };
    }
  }
  
  // Check docx
  for (const keyword of KEYWORDS.explicit.docx) {
    if (lowerText.includes(keyword)) {
      return { match: true, format: DocumentFormat.DOCX, keywords: [keyword] };
    }
  }
  
  // Check excel
  for (const keyword of KEYWORDS.explicit.excel) {
    if (lowerText.includes(keyword)) {
      return { match: true, format: DocumentFormat.EXCEL, keywords: [keyword] };
    }
  }
  
  return { match: false, keywords: [] };
}

/**
 * Detect the appropriate document format based on user intent keywords
 * @param {Object} params - Detection parameters
 * @param {string} params.userQuery - Original user prompt/query
 * @param {string} [params.title] - Document title if known
 * @param {string} [params.content] - Content preview if available
 * @returns {{format: string, confidence: string, reason: string, matchedKeywords: string[], suggestedTool: string}} Format recommendation
 */
export async function detectFormat(params) {
  // Combine all text sources for analysis
  const userQuery = (params.userQuery || '').toLowerCase();
  const title = (params.title || '').toLowerCase();
  const content = (params.content || '').toLowerCase();
  
  const combinedText = `${userQuery} ${title} ${content}`;
  
  // First check for explicit format mentions (highest priority)
  const explicitMatch = hasExplicitFormat(combinedText);
  if (explicitMatch.match) {
    return {
      format: explicitMatch.format,
      confidence: 'high',
      reason: `User explicitly mentioned "${explicitMatch.keywords[0]}" which indicates ${explicitMatch.format} format`,
      matchedKeywords: explicitMatch.keywords,
      suggestedTool: getToolForFormat(explicitMatch.format)
    };
  }
  
  // Check each category and count matches
  const implementationResult = hasImplementationKeywords(combinedText);
  const stakeholderResult = hasStakeholderKeywords(combinedText);
  const dataResult = hasDataKeywords(combinedText);
  
  // Determine the winning category based on match count
  const results = [
    { format: DocumentFormat.MARKDOWN, ...implementationResult },
    { format: DocumentFormat.DOCX, ...stakeholderResult },
    { format: DocumentFormat.EXCEL, ...dataResult }
  ];
  
  // Find the category with most matches
  const winner = results.reduce((best, current) => {
    if (current.keywords.length > best.keywords.length) {
      return current;
    }
    return best;
  });
  
  // Calculate confidence based on number of matched keywords
  let confidence = 'low';
  let reason = '';
  
  if (winner.keywords.length >= 3) {
    confidence = 'high';
    reason = `Multiple implementation/technical keywords detected: ${winner.keywords.slice(0, 5).join(', ')}`;
  } else if (winner.keywords.length >= 2) {
    confidence = 'medium';
    reason = `Several keywords suggest this format: ${winner.keywords.join(', ')}`;
  } else if (winner.keywords.length === 1) {
    confidence = 'low';
    reason = `Single keyword "${winner.keywords[0]}" suggests this format`;
  } else {
    // No clear winner - default to markdown for technical projects
    return {
      format: DocumentFormat.MARKDOWN,
      docType: DocumentType.CONCISE,
      confidence: 'low',
      reason: 'No strong indicators found; defaulting to markdown for implementation documentation',
      matchedKeywords: [],
      suggestedTool: getToolForFormat(DocumentFormat.MARKDOWN)
    };
  }

  // Determine docType based on winner and confidence
  let docType = DocumentType.CONCISE;
  if (winner.format === DocumentFormat.DOCX) {
    docType = DocumentType.FORMAL;
  } else if (winner.format === DocumentFormat.EXCEL) {
    docType = DocumentType.SCIENTIFIC;
  } else if (confidence === 'high') {
    docType = DocumentType.EXPLANATORY;
  }

  return {
    format: winner.format,
    docType,
    confidence,
    reason,
    matchedKeywords: winner.keywords,
    suggestedTool: getToolForFormat(winner.format)
  };
}

/**
 * Get the appropriate tool name for a given format
 * @param {string} format - Document format
 * @returns {string} Tool name to call
 */
function getToolForFormat(format) {
  switch (format) {
    case DocumentFormat.MARKDOWN:
      return 'create-markdown';
    case DocumentFormat.DOCX:
      return 'create-doc';
    case DocumentFormat.EXCEL:
      return 'create-excel';
    default:
      return 'create-doc';
  }
}

export { DocumentFormat, DocumentType };