/**
 * Token Detection and Validation Library
 * 
 * Provides functions to analyze smart contracts and determine if they implement
 * the SIP-010 fungible token standard on the Stacks blockchain.
 */

export interface TokenAnalysis {
  is_sip010_token: boolean;
  sip010_function_count: number;
  detected_sip010_functions: string[];
  missing_sip010_functions: string[];
  confidence_score: number;
  analysis_notes: string[];
}

export interface ContractFunction {
  name: string;
  access: string;
  args?: any[];
  outputs?: any;
}

/**
 * The complete set of SIP-010 fungible token standard functions
 */
export const SIP010_REQUIRED_FUNCTIONS = [
  'get-name',
  'get-symbol', 
  'get-decimals',
  'get-total-supply',
  'get-token-uri',
  'transfer',
  'get-balance'
] as const;

/**
 * Optional SIP-010 functions that may be present in token contracts
 */
export const SIP010_OPTIONAL_FUNCTIONS = [
  'mint',
  'burn',
  'transfer-memo',
  'get-owner',
  'set-token-uri'
] as const;

/**
 * Analyze a contract interface to determine if it implements SIP-010 token standard
 * 
 * @param contractInterface The contract interface from getContractInterface
 * @returns TokenAnalysis object with detailed analysis
 */
export function analyzeSip010Token(contractInterface: any): TokenAnalysis {
  // Default result for failed analysis
  const defaultResult: TokenAnalysis = {
    is_sip010_token: false,
    sip010_function_count: 0,
    detected_sip010_functions: [],
    missing_sip010_functions: [...SIP010_REQUIRED_FUNCTIONS],
    confidence_score: 0,
    analysis_notes: ['Contract interface not available or invalid']
  };

  // Validate input
  if (!contractInterface || !contractInterface.functions || !Array.isArray(contractInterface.functions)) {
    return defaultResult;
  }

  const contractFunctions = contractInterface.functions as ContractFunction[];
  const functionNames = contractFunctions.map(f => f.name);
  
  // Find SIP-010 functions present in the contract
  const detectedSip010Functions = SIP010_REQUIRED_FUNCTIONS.filter(funcName => 
    functionNames.includes(funcName)
  );
  
  // Find missing required functions
  const missingSip010Functions = SIP010_REQUIRED_FUNCTIONS.filter(funcName => 
    !functionNames.includes(funcName)
  );

  // Calculate confidence score based on function presence and implementation quality
  let confidenceScore = 0;
  const analysisNotes: string[] = [];

  // Base score from required function coverage
  const functionCoverage = detectedSip010Functions.length / SIP010_REQUIRED_FUNCTIONS.length;
  confidenceScore += functionCoverage * 80; // Up to 80 points for function coverage

  // Bonus points for specific critical functions
  if (detectedSip010Functions.includes('transfer')) {
    confidenceScore += 5;
    analysisNotes.push('Transfer function detected');
  }
  
  if (detectedSip010Functions.includes('get-balance')) {
    confidenceScore += 5;
    analysisNotes.push('Balance query function detected');
  }

  // Additional analysis based on function signatures
  const transferFunction = contractFunctions.find(f => f.name === 'transfer');
  if (transferFunction) {
    // Check if transfer function has reasonable signature
    if (transferFunction.args && transferFunction.args.length >= 3) {
      confidenceScore += 5;
      analysisNotes.push('Transfer function has appropriate signature');
    } else {
      analysisNotes.push('Transfer function signature may be non-standard');
    }
  }

  // Check for optional functions that increase confidence
  const optionalFunctionsPresent = SIP010_OPTIONAL_FUNCTIONS.filter(funcName =>
    functionNames.includes(funcName)
  );
  
  if (optionalFunctionsPresent.length > 0) {
    confidenceScore += Math.min(optionalFunctionsPresent.length * 2, 10);
    analysisNotes.push(`Optional SIP-010 functions detected: ${optionalFunctionsPresent.join(', ')}`);
  }

  // Penalize for missing critical functions
  if (missingSip010Functions.includes('transfer')) {
    confidenceScore -= 20;
    analysisNotes.push('Missing critical transfer function');
  }
  
  if (missingSip010Functions.includes('get-balance')) {
    confidenceScore -= 15;
    analysisNotes.push('Missing critical balance query function');
  }

  // Check for non-token-like functions that might indicate this isn't a token
  const suspiciousFunctions = functionNames.filter(name => 
    name.includes('admin') || 
    name.includes('governance') ||
    name.includes('vault') ||
    name.includes('pool') ||
    name.includes('stake') ||
    name.includes('farm')
  );

  if (suspiciousFunctions.length > 3) {
    confidenceScore -= 10;
    analysisNotes.push('Contract may be a DeFi protocol rather than a simple token');
  }

  // Normalize confidence score to 0-100 range
  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  // Determine if this is likely a SIP-010 token
  const isSip010Token = detectedSip010Functions.length >= 5 && confidenceScore >= 60;

  if (isSip010Token) {
    analysisNotes.push(`High confidence SIP-010 token (${detectedSip010Functions.length}/7 functions)`);
  } else if (detectedSip010Functions.length >= 3) {
    analysisNotes.push(`Partial SIP-010 implementation (${detectedSip010Functions.length}/7 functions)`);
  } else {
    analysisNotes.push('Does not appear to be a SIP-010 token');
  }

  return {
    is_sip010_token: isSip010Token,
    sip010_function_count: detectedSip010Functions.length,
    detected_sip010_functions: detectedSip010Functions,
    missing_sip010_functions: missingSip010Functions,
    confidence_score: Math.round(confidenceScore),
    analysis_notes: analysisNotes
  };
}

/**
 * Validate that a contract has the minimum required functions to be considered a token
 */
export function hasMinimumTokenFunctions(functionNames: string[]): boolean {
  const criticalFunctions = ['transfer', 'get-balance', 'get-total-supply'];
  return criticalFunctions.every(func => functionNames.includes(func));
}

/**
 * Extract token metadata expectations based on detected functions
 */
export function getTokenMetadataExpectations(detectedFunctions: string[]): {
  has_name: boolean;
  has_symbol: boolean;
  has_decimals: boolean;
  has_uri: boolean;
} {
  return {
    has_name: detectedFunctions.includes('get-name'),
    has_symbol: detectedFunctions.includes('get-symbol'),
    has_decimals: detectedFunctions.includes('get-decimals'),
    has_uri: detectedFunctions.includes('get-token-uri')
  };
}

/**
 * Generate a human-readable summary of the token analysis
 */
export function generateTokenAnalysisSummary(analysis: TokenAnalysis): string {
  if (analysis.is_sip010_token) {
    return `SIP-010 Token (${analysis.sip010_function_count}/7 functions, ${analysis.confidence_score}% confidence)`;
  } else if (analysis.sip010_function_count >= 3) {
    return `Partial Token Implementation (${analysis.sip010_function_count}/7 functions, ${analysis.confidence_score}% confidence)`;
  } else {
    return `Not a Token Contract (${analysis.sip010_function_count}/7 functions)`;
  }
}