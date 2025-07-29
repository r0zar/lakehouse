import { callReadOnly } from './stacks-api';
import { cvToHex, uintCV, someCV, bufferCV, principalCV } from '@stacks/transactions';

// Router opcodes - keep in sync with the reference code
export const OPCODES = {
  SWAP_A_TO_B: 0x00,
  SWAP_B_TO_A: 0x01,
  ADD_LIQUIDITY: 0x02,
  REMOVE_LIQUIDITY: 0x03,
  LOOKUP_RESERVES: 0x04,
  OP_DEPOSIT: 0x05,
  OP_WITHDRAW: 0x06,
} as const;

export interface VaultReserves {
  contractId: string;
  reservesA: string;
  reservesB: string;
  tokenA?: string;
  tokenB?: string;
  version: 'v0' | 'v1';
  method: 'quote_opcode_4' | 'balance_check';
  timestamp: Date;
  success: boolean;
  error?: string;
}

/**
 * Convert numeric opcode to optional 16-byte buffer for Clarity contract calls
 * Based on the reference code's opcodeCV function
 */
function opcodeToBuffer(opcode: number): string {
  const buffer = new Array(16).fill(0);
  buffer[0] = opcode;
  return '0x' + buffer.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get vault reserves for v1 pools using quote function with opcode 4
 * V1 pools have a quote function that accepts an opcode parameter
 * Based on the reference buildVault function
 */
export async function getV1VaultReserves(contractId: string): Promise<VaultReserves | null> {
  try {
    console.log(`🔍 Fetching v1 vault reserves for ${contractId} using quote(opcode=4)`);
    
    // Call quote function with opcode 4 (LOOKUP_RESERVES) to get reserves
    // Function signature: (quote (amount uint) (opcode (optional (buff 16))))
    // Based on reference: callReadOnly(contractId, 'quote', [uintCV(0), opcodeCV(OPCODES.LOOKUP_RESERVES)])
    
    // Create proper Clarity values
    const amountCV = uintCV(0);
    const opcodeBuffer = new Uint8Array(16);
    opcodeBuffer[0] = OPCODES.LOOKUP_RESERVES;
    const opcodeCV = someCV(bufferCV(opcodeBuffer));
    
    const quoteResult = await callReadOnly(contractId, 'quote', [
      cvToHex(amountCV),
      cvToHex(opcodeCV)
    ]);
    
    console.log(`📋 Raw quote result for ${contractId}:`, JSON.stringify(quoteResult, null, 2));
    
    if (!quoteResult) {
      console.log(`❌ Quote call returned null for ${contractId}`);
      return {
        contractId,
        reservesA: '0',
        reservesB: '0',
        version: 'v1',
        method: 'quote_opcode_4',
        timestamp: new Date(),
        success: false,
        error: 'Quote call returned null'
      };
    }
    
    // The callReadOnly function may return the value directly, not wrapped in {type: 'ok'}
    // Let's handle both cases
    
    // Parse the result - should be a tuple with dx (reserves A) and dy (reserves B)
    // The callReadOnly function may return different formats depending on the call
    let reservesData = quoteResult;
    
    // If wrapped in type/value structure, unwrap it
    if (quoteResult && typeof quoteResult === 'object' && 'value' in quoteResult) {
      reservesData = quoteResult.value;
    }
    
    console.log(`📊 V1 reserves data for ${contractId}:`, JSON.stringify(reservesData, null, 2));
    
    // Extract reserves from the response structure
    // Based on reference: reservesA = Number(r.value.dx.value); reservesB = Number(r.value.dy.value);
    let reservesA = '0';
    let reservesB = '0';
    
    if (reservesData && typeof reservesData === 'object') {
      // Handle different possible response formats
      
      // Direct access to dx/dy fields
      if (reservesData['dx']) {
        reservesA = String(reservesData['dx'].value || reservesData['dx'] || '0');
      }
      if (reservesData['dy']) {
        reservesB = String(reservesData['dy'].value || reservesData['dy'] || '0');
      }
      
      // Handle tuple wrapper
      if (reservesData.type === 'tuple' && reservesData.value) {
        if (reservesData.value['dx']) {
          reservesA = String(reservesData.value['dx'].value || reservesData.value['dx'] || '0');
        }
        if (reservesData.value['dy']) {
          reservesB = String(reservesData.value['dy'].value || reservesData.value['dy'] || '0');
        }
      }
    }
    
    return {
      contractId,
      reservesA,
      reservesB,
      version: 'v1',
      method: 'quote_opcode_4',
      timestamp: new Date(),
      success: true
    };
    
  } catch (error) {
    console.error(`❌ Error fetching v1 reserves for ${contractId}:`, error);
    return {
      contractId,
      reservesA: '0',
      reservesB: '0',
      version: 'v1',
      method: 'quote_opcode_4',
      timestamp: new Date(),
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get vault reserves for v0 pools by checking token balances on the contract principal
 * V0 pools don't have a quote function, so we get reserves by checking how much of each token
 * the pool contract holds (which represents the reserves)
 */
export async function getV0VaultReserves(contractId: string, tokenAContract: string, tokenBContract: string): Promise<VaultReserves | null> {
  try {
    console.log(`🔍 Fetching v0 vault reserves for ${contractId} using balance checks`);
    console.log(`  Token A: ${tokenAContract}`);
    console.log(`  Token B: ${tokenBContract}`);
    
    // Get the balance of token A that the pool contract holds
    let balanceAResult;
    if (tokenAContract === '.stx' || tokenAContract.toLowerCase() === 'stx') {
      // For STX in v0 pools, we need to use the Stacks API to get the STX balance of the contract principal
      // V0 pools don't typically have get-stx-balance functions
      console.log(`  Getting STX balance for pool ${contractId} using contract principal balance`);
      try {
        // Use the Stacks API directly to get the STX balance of the contract address
        const [contractAddress] = contractId.split('.');
        const response = await fetch(`https://api.mainnet.hiro.so/extended/v1/address/${contractAddress}/balances`);
        const balanceData = await response.json();
        balanceAResult = balanceData.stx.balance || '0';
        console.log(`  STX balance from API: ${balanceAResult}`);
      } catch (error) {
        console.log(`  Failed to get STX balance from API, trying contract call`);
        balanceAResult = await callReadOnly(contractId, 'get-stx-balance', []);
      }
    } else {
      // For SIP-010 tokens, call get-balance on the token contract with proper Clarity encoding
      console.log(`  Getting ${tokenAContract} balance for pool ${contractId}`);
      const principalArg = cvToHex(principalCV(contractId));
      balanceAResult = await callReadOnly(tokenAContract, 'get-balance', [principalArg]);
    }
    
    console.log(`  Token A balance result:`, JSON.stringify(balanceAResult, null, 2));
    
    // Get the balance of token B that the pool contract holds  
    let balanceBResult;
    if (tokenBContract === '.stx' || tokenBContract.toLowerCase() === 'stx') {
      // For STX in v0 pools, use the Stacks API to get the STX balance of the contract principal
      console.log(`  Getting STX balance for pool ${contractId} using contract principal balance`);
      try {
        // Use the Stacks API directly to get the STX balance of the contract address
        const [contractAddress] = contractId.split('.');
        const response = await fetch(`https://api.mainnet.hiro.so/extended/v1/address/${contractAddress}/balances`);
        const balanceData = await response.json();
        balanceBResult = balanceData.stx.balance || '0';
        console.log(`  STX balance from API: ${balanceBResult}`);
      } catch (error) {
        console.log(`  Failed to get STX balance from API, trying contract call`);
        balanceBResult = await callReadOnly(contractId, 'get-stx-balance', []);
      }
    } else {
      // For SIP-010 tokens, call get-balance on the token contract with proper Clarity encoding
      console.log(`  Getting ${tokenBContract} balance for pool ${contractId}`);
      const principalArg = cvToHex(principalCV(contractId));
      balanceBResult = await callReadOnly(tokenBContract, 'get-balance', [principalArg]);
    }
    
    console.log(`  Token B balance result:`, JSON.stringify(balanceBResult, null, 2));
    
    let reservesA = '0';
    let reservesB = '0';
    let success = true;
    let error: string | undefined;
    
    // Extract balance A - handle same format as v1 (direct value or nested structure)
    if (balanceAResult !== null && balanceAResult !== undefined) {
      // Handle different possible response formats like in v1
      if (typeof balanceAResult === 'string' || typeof balanceAResult === 'number') {
        reservesA = String(balanceAResult);
      } else if (balanceAResult && typeof balanceAResult === 'object') {
        if (balanceAResult.value !== undefined) {
          reservesA = String(balanceAResult.value.value || balanceAResult.value || '0');
        } else {
          reservesA = String(balanceAResult);
        }
      }
      console.log(`  ✓ Token A balance: ${reservesA}`);
    } else {
      console.log(`⚠️ Failed to get token A balance for ${contractId}:`, balanceAResult);
      success = false;
      error = 'Failed to get token A balance';
    }
    
    // Extract balance B - handle same format as v1
    if (balanceBResult !== null && balanceBResult !== undefined) {
      // Handle different possible response formats like in v1
      if (typeof balanceBResult === 'string' || typeof balanceBResult === 'number') {
        reservesB = String(balanceBResult);
      } else if (balanceBResult && typeof balanceBResult === 'object') {
        if (balanceBResult.value !== undefined) {
          reservesB = String(balanceBResult.value.value || balanceBResult.value || '0');
        } else {
          reservesB = String(balanceBResult);
        }
      }
      console.log(`  ✓ Token B balance: ${reservesB}`);
    } else {
      console.log(`⚠️ Failed to get token B balance for ${contractId}:`, balanceBResult);
      success = false;
      error = error ? `${error}; Failed to get token B balance` : 'Failed to get token B balance';
    }
    
    console.log(`📊 V0 reserves for ${contractId}: A=${reservesA}, B=${reservesB}`);
    
    return {
      contractId,
      reservesA,
      reservesB,
      tokenA: tokenAContract,
      tokenB: tokenBContract,
      version: 'v0',
      method: 'balance_check',
      timestamp: new Date(),
      success,
      error
    };
    
  } catch (error) {
    console.error(`❌ Error fetching v0 reserves for ${contractId}:`, error);
    return {
      contractId,
      reservesA: '0',
      reservesB: '0',
      tokenA: tokenAContract,
      tokenB: tokenBContract,
      version: 'v0',
      method: 'balance_check',
      timestamp: new Date(),
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Automatically detect vault version and get reserves
 * For v1: Use vaultContractId for quote calls
 * For v0: Use poolContractId for balance checks
 */
export async function getVaultReserves(
  poolContractId: string, 
  tokenAContract?: string, 
  tokenBContract?: string,
  vaultContractId?: string
): Promise<VaultReserves | null> {
  console.log(`🔄 Auto-detecting vault version and fetching reserves`);
  console.log(`  Pool contract: ${poolContractId}`);
  console.log(`  Vault contract: ${vaultContractId || 'same as pool'}`);
  
  // If we have a separate vault contract, try v1 method first (vault wrapper with quote function)
  if (vaultContractId && vaultContractId !== poolContractId) {
    console.log(`🔄 Trying v1 method with vault contract ${vaultContractId}`);
    const v1Result = await getV1VaultReserves(vaultContractId);
    
    if (v1Result && v1Result.success && (v1Result.reservesA !== '0' || v1Result.reservesB !== '0')) {
      console.log(`✅ Successfully got v1 reserves using vault contract ${vaultContractId}`);
      return {
        ...v1Result,
        contractId: poolContractId // Return pool contract ID for consistency in storage
      };
    }
  }
  
  // Try v1 method on pool contract (in case it's a direct pool with quote function)
  const v1Result = await getV1VaultReserves(poolContractId);
  
  if (v1Result && v1Result.success && (v1Result.reservesA !== '0' || v1Result.reservesB !== '0')) {
    console.log(`✅ Successfully got v1 reserves from pool contract ${poolContractId}`);
    return v1Result;
  }
  
  // If v1 failed and we have token contracts, try v0 method on pool contract
  if (tokenAContract && tokenBContract) {
    console.log(`🔄 V1 method failed, trying v0 method on pool contract ${poolContractId}`);
    const v0Result = await getV0VaultReserves(poolContractId, tokenAContract, tokenBContract);
    
    if (v0Result && v0Result.success) {
      console.log(`✅ Successfully got v0 reserves from pool contract ${poolContractId}`);
      return v0Result;
    }
  }
  
  console.log(`❌ Failed to get reserves for pool ${poolContractId} using both methods`);
  return v1Result; // Return the v1 result even if failed, for debugging
}

/**
 * Get reserves for multiple vaults in parallel
 */
export async function getMultipleVaultReserves(vaults: Array<{
  contractId: string;
  tokenA?: string;
  tokenB?: string;
}>): Promise<VaultReserves[]> {
  console.log(`🔄 Fetching reserves for ${vaults.length} vaults in parallel`);
  
  const promises = vaults.map(vault => 
    getVaultReserves(vault.contractId, vault.tokenA, vault.tokenB)
  );
  
  const results = await Promise.allSettled(promises);
  
  return results
    .map((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      } else {
        console.error(`Failed to get reserves for ${vaults[index].contractId}:`, result);
        return {
          contractId: vaults[index].contractId,
          reservesA: '0',
          reservesB: '0',
          version: 'v1' as const,
          method: 'quote_opcode_4' as const,
          timestamp: new Date(),
          success: false,
          error: result.status === 'rejected' ? result.reason : 'Unknown error'
        };
      }
    });
}