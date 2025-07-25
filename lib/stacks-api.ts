// Re-export functions from your full blockchain API client
// This provides the token metadata functionality using your existing infrastructure

import { createClient } from "@stacks/blockchain-api-client";
import { cvToValue, hexToCV } from "@stacks/transactions";

// Create the client instance
const apiClient = createClient({
  headers: { 'x-api-key': process.env.HIRO_API_KEY }
});

/**
 * Make a read-only contract call to get token metadata
 * Uses your existing blockchain API infrastructure
 */
export async function callReadOnly(
  contractId: string,
  functionName: string,
  args: any[] = []
): Promise<any> {
  try {
    const [contractAddress, contractName] = contractId.split(".");
    const endpoint = `/v2/contracts/call-read/${contractAddress}/${contractName}/${functionName}`;

    const response = await apiClient.POST(endpoint as any, {
      body: {
        sender: contractAddress,
        arguments: args.map(arg => arg), // No conversion needed for empty args
      }
    });

    if (!response.data?.result) {
      console.warn(`Contract call failed for ${contractId}.${functionName}:`, response.error);
      return null;
    }

    // Use proper Clarity parsing with @stacks/transactions
    const clarityResult = cvToValue(hexToCV(response.data.result));

    // Extract the actual value from the Clarity result
    if (clarityResult && typeof clarityResult === 'object' && 'value' in clarityResult) {
      return clarityResult.value;
    }

    return clarityResult;
  } catch (error) {
    console.error(`Error calling ${contractId}.${functionName}:`, error);
    return null;
  }
}

/**
 * Get STX total supply using your API client
 */
export async function getStxTotalSupply(): Promise<number> {
  try {
    const response = await apiClient.GET('/extended/v1/stx_supply/total/plain' as any);

    if (!response.data) {
      throw new Error(`STX total supply API error: ${response.error}`);
    }

    const totalSupply = Number(response.data);
    return totalSupply;
  } catch (error) {
    console.error('Failed fetching STX total supply:', error);
    throw error;
  }
}

/**
 * Fetches the interface for a specified smart contract.
 * @param contractAddress The Stacks address of the contract.
 * @param contractName The name of the contract.
 * @param tip Optional Stacks chain tip to query from.
 * @returns A promise that resolves to the contract interface.
 */
export async function getContractInterface(
  contractAddress: string,
  contractName: string,
  tip?: string
): Promise<any> {
  try {
    // https://api.mainnet.hiro.so/v2/contracts/interface/{contract_address}/{contract_name}
    const response = await apiClient.GET(`/v2/contracts/interface/${contractAddress}/${contractName}` as any, {
      params: {
        query: tip ? { tip } : {}
      }
    });

    if (!response.data) {
      throw new Error(`Contract interface API error: ${response.error}`);
    }

    return response.data;
  } catch (error) {
    console.error("Error fetching contract interface:", error);
    throw new Error("Failed to fetch contract interface.");
  }
}

/**
 * Parses the ABI string from contract info into a typed ContractAbi object
 * @param abiString The JSON string from the contract info's abi field
 * @returns Parsed ContractAbi object or null if parsing fails
 */
export function parseContractAbi(abiString: string): any | null {
  try {
    return JSON.parse(abiString);
  } catch (error) {
    console.error("Failed to parse contract ABI:", error);
    return null;
  }
}

/**
 * Fetches the information for a specified smart contract.
 * @param contract_id The Stacks address and name of the contract (e.g., SP6P4EJF0VG8V0RB3TQQKJBHDQKEF6NVRD1KZE3C.satoshibles).
 * @param unanchored Optional boolean to include transaction data from unanchored microblocks.
 * @returns A promise that resolves to the contract information.
 */
export async function getContractInfo(
  contract_id: string,
  unanchored: boolean = false
): Promise<any | null> {
  try {
    const response = await apiClient.GET(`/extended/v1/contract/${contract_id}` as any, {
      params: {
        query: {
          unanchored,
        },
      },
    });

    if (!response.data) {
      const errorMsg = response.error ? JSON.stringify(response.error) : 'Unknown API error';
      throw new Error(`Contract info API error: ${errorMsg}`);
    }

    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      console.warn(`Contract not found: ${contract_id}`);
      return null;
    }
    if (error?.response?.status === 429) {
      console.warn(`Rate limited for contract: ${contract_id}`);
      return null;
    }
    if (error?.response?.status >= 500) {
      console.warn(`Server error for contract: ${contract_id}`);
      return null;
    }
    console.error("Error fetching contract info:", error);
    return null; // Return null instead of throwing to continue processing other contracts
  }
}

/**
 * Fetches contract information with parsed ABI for easier type-safe access
 * @param contract_id The Stacks address and name of the contract
 * @param unanchored Optional boolean to include transaction data from unanchored microblocks
 * @returns A promise that resolves to contract information with parsed ABI
 */
export async function getContractInfoWithParsedAbi(
  contract_id: string,
  unanchored: boolean = false
): Promise<any | null> {
  const contractInfo = await getContractInfo(contract_id, unanchored);
  if (!contractInfo) {
    return null;
  }

  const parsed_abi = parseContractAbi(contractInfo.abi);

  return {
    ...contractInfo,
    parsed_abi,
  };
}