import { NextRequest, NextResponse } from 'next/server';
import { getVaultReserves, getV1VaultReserves, getV0VaultReserves } from '../../../../lib/vault-api';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const contractId = searchParams.get('contract_id');
  const tokenA = searchParams.get('token_a');
  const tokenB = searchParams.get('token_b'); 
  const version = searchParams.get('version') as 'v0' | 'v1' | 'auto' || 'auto';
  
  try {
    if (!contractId) {
      return NextResponse.json({
        success: false,
        error: 'contract_id parameter is required'
      }, { status: 400 });
    }
    
    console.log(`🧪 Testing vault reserves for ${contractId} (version: ${version})`);
    
    // First try a simple test to see if the contract is callable at all
    const testCall = searchParams.get('test_basic') === 'true';
    if (testCall) {
      const { callReadOnly } = await import('../../../../lib/stacks-api');
      try {
        const basicResult = await callReadOnly(contractId, 'get-name', []);
        return NextResponse.json({
          success: true,
          basicTest: true,
          basicResult,
          contractId
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          basicTest: true,
          error: error instanceof Error ? error.message : String(error),
          contractId
        });
      }
    }
    
    let result;
    
    if (version === 'v1') {
      // Test v1 method explicitly
      result = await getV1VaultReserves(contractId);
    } else if (version === 'v0') {
      if (!tokenA || !tokenB) {
        return NextResponse.json({
          success: false,
          error: 'token_a and token_b parameters are required for v0 testing'
        }, { status: 400 });
      }
      // Test v0 method explicitly
      result = await getV0VaultReserves(contractId, tokenA, tokenB);
    } else {
      // Auto-detect version
      result = await getVaultReserves(contractId, tokenA || undefined, tokenB || undefined);
    }
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'Failed to get vault reserves'
      });
    }
    
    // Additional analysis
    const analysis = {
      hasReserves: result.reservesA !== '0' || result.reservesB !== '0',
      reservesAFormatted: formatReserves(result.reservesA),
      reservesBFormatted: formatReserves(result.reservesB),
      ratio: calculateRatio(result.reservesA, result.reservesB),
      detectedVersion: result.version,
      methodUsed: result.method
    };
    
    return NextResponse.json({
      success: true,
      result,
      analysis,
      testParams: {
        contractId,
        tokenA,
        tokenB,
        requestedVersion: version
      }
    });
    
  } catch (error) {
    console.error('Error testing vault reserves:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

function formatReserves(reserves: string): string {
  const num = BigInt(reserves);
  if (num === BigInt(0)) return '0';
  
  // Format with commas for readability
  return num.toLocaleString();
}

function calculateRatio(reservesA: string, reservesB: string): string {
  const a = BigInt(reservesA);
  const b = BigInt(reservesB);
  
  if (a === BigInt(0) || b === BigInt(0)) return 'N/A';
  
  // Calculate ratio as A:B (simplified)
  const gcd = (a: bigint, b: bigint): bigint => b === BigInt(0) ? a : gcd(b, a % b);
  const divisor = gcd(a, b);
  
  const simplifiedA = a / divisor;
  const simplifiedB = b / divisor;
  
  return `${simplifiedA}:${simplifiedB}`;
}