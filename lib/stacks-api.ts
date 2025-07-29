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

/**
 * Extract SIP-010 fungible token identifier from contract ABI
 * @param abi Parsed contract ABI
 * @returns Token identifier or null if not found
 */
export function extractSip010Identifier(abi: any): string | null {
  if (!abi?.fungible_tokens || abi.fungible_tokens.length === 0) {
    return null;
  }
  return abi.fungible_tokens[0].name;
}

/**
 * Check if contract implements SIP-010 standard by verifying required functions
 * @param abi Parsed contract ABI
 * @returns Boolean indicating if contract is SIP-010 compliant
 */
export function isSip010Contract(abi: any): boolean {
  if (!abi?.functions) return false;
  
  const requiredFunctions = [
    'transfer', 'get-name', 'get-symbol', 'get-decimals', 
    'get-balance', 'get-total-supply'
  ];
  
  return requiredFunctions.every(funcName =>
    abi.functions.some((f: any) => f.name === funcName)
  );
}

/**
 * Get complete SIP-010 token metadata using on-chain calls
 * @param contractId Contract identifier (address.name)
 * @returns Promise resolving to complete SIP-010 metadata
 */
export async function getSip010Metadata(contractId: string): Promise<any | null> {
  try {
    console.log(`Fetching SIP-010 metadata for: ${contractId}`);
    
    // Get contract info and verify it's SIP-010
    const contractInfo = await getContractInfoWithParsedAbi(contractId);
    if (!contractInfo?.parsed_abi || !isSip010Contract(contractInfo.parsed_abi)) {
      console.log(`Contract ${contractId} is not SIP-010 compliant`);
      return null;
    }

    // Extract identifier from ABI
    const identifier = extractSip010Identifier(contractInfo.parsed_abi);
    if (!identifier) {
      console.log(`No fungible token identifier found for ${contractId}`);
      return null;
    }

    // Make parallel on-chain calls for metadata
    const [name, symbol, decimals, tokenUri, totalSupply] = await Promise.allSettled([
      callReadOnly(contractId, 'get-name'),
      callReadOnly(contractId, 'get-symbol'),
      callReadOnly(contractId, 'get-decimals'),
      callReadOnly(contractId, 'get-token-uri'),
      callReadOnly(contractId, 'get-total-supply')
    ]);

    // Extract values from settled promises
    const metadata: any = {
      identifier,
      contract_id: contractId
    };

    if (name.status === 'fulfilled' && name.value) {
      metadata.name = name.value;
    }

    if (symbol.status === 'fulfilled' && symbol.value) {
      metadata.symbol = symbol.value;
    }

    if (decimals.status === 'fulfilled' && decimals.value !== null) {
      metadata.decimals = Number(decimals.value);
    }

    if (tokenUri.status === 'fulfilled' && tokenUri.value) {
      // Handle optional token-uri (some return none, others return (some uri))
      let uriString = null;
      if (typeof tokenUri.value === 'object' && tokenUri.value !== null && tokenUri.value.value) {
        uriString = tokenUri.value.value;
      } else if (typeof tokenUri.value === 'string') {
        uriString = tokenUri.value;
      }
      
      if (uriString) {
        metadata.token_uri = uriString;
        
        // Fetch and parse token URI metadata
        const uriMetadata = await fetchTokenUriMetadata(uriString);
        if (uriMetadata) {
          // Merge URI metadata with existing metadata
          if (uriMetadata.image) {
            const normalizedImage = normalizeImageUrl(uriMetadata.image, uriString);
            if (normalizedImage) {
              metadata.image = normalizedImage;
              metadata.image_source = 'token_uri_metadata';
            }
          }
          
          if (uriMetadata.description) metadata.description = uriMetadata.description;
          if (uriMetadata.external_url) metadata.external_url = uriMetadata.external_url;
          if (uriMetadata.attributes) metadata.attributes = uriMetadata.attributes;
          if (uriMetadata.animation_url) {
            const normalizedAnimation = normalizeImageUrl(uriMetadata.animation_url, uriString);
            if (normalizedAnimation) metadata.animation_url = normalizedAnimation;
          }
          if (uriMetadata.background_color) metadata.background_color = uriMetadata.background_color;
          
          // Override name/symbol if provided in URI metadata (usually more accurate)
          if (uriMetadata.name && !metadata.name) metadata.name = uriMetadata.name;
          if (uriMetadata.symbol && !metadata.symbol) metadata.symbol = uriMetadata.symbol;
          
          metadata.uri_metadata_fetched = true;
        }
      }
    }

    if (totalSupply.status === 'fulfilled' && totalSupply.value !== null) {
      metadata.total_supply = totalSupply.value.toString();
    }

    // Generate description
    if (metadata.name && metadata.symbol) {
      metadata.description = `${metadata.name} (${metadata.symbol}) is a fungible token on the Stacks blockchain.`;
    } else if (metadata.symbol) {
      metadata.description = `${metadata.symbol} is a fungible token on the Stacks blockchain.`;
    } else {
      metadata.description = `Token ${identifier} is a fungible token on the Stacks blockchain.`;
    }

    // Generate image if not provided by token URI
    if (!metadata.image && metadata.symbol) {
      metadata.image = `https://ui-avatars.com/api/?name=${encodeURIComponent(metadata.symbol)}&size=200&background=6366f1&color=ffffff&format=png&bold=true`;
      metadata.image_source = 'generated';
    }

    console.log(`✓ Successfully extracted SIP-010 metadata for ${contractId}:`, {
      identifier: metadata.identifier,
      name: metadata.name,
      symbol: metadata.symbol,
      decimals: metadata.decimals
    });

    return metadata;

  } catch (error) {
    console.error(`Error getting SIP-010 metadata for ${contractId}:`, error);
    return null;
  }
}

/**
 * Batch fetch SIP-010 metadata for multiple contracts
 * @param contractIds Array of contract identifiers
 * @param batchSize Number of contracts to process in parallel
 * @param delayMs Delay between batches in milliseconds
 * @returns Promise resolving to array of metadata results
 */
export async function batchGetSip010Metadata(
  contractIds: string[],
  batchSize: number = 5,
  delayMs: number = 200
): Promise<Array<{ contractId: string; metadata: any | null; error?: string }>> {
  const results: Array<{ contractId: string; metadata: any | null; error?: string }> = [];
  
  for (let i = 0; i < contractIds.length; i += batchSize) {
    const batch = contractIds.slice(i, i + batchSize);
    
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contractIds.length / batchSize)} (${batch.length} contracts)`);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (contractId) => {
        try {
          const metadata = await getSip010Metadata(contractId);
          return { contractId, metadata };
        } catch (error) {
          return { 
            contractId, 
            metadata: null, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      })
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          contractId: 'unknown',
          metadata: null,
          error: result.reason?.message || 'Unknown error'
        });
      }
    }

    // Rate limiting delay between batches
    if (i + batchSize < contractIds.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Fetch and parse JSON metadata from a token URI
 * @param uri Token URI to fetch
 * @returns Parsed metadata object or null if fetch/parse fails
 */
export async function fetchTokenUriMetadata(uri: string): Promise<any | null> {
  try {
    console.log(`Fetching token URI metadata: ${uri}`);
    
    // Validate URI format
    if (!uri || typeof uri !== 'string') {
      console.log('Invalid URI provided');
      return null;
    }
    
    // Handle common URI formats
    let fetchUrl = uri;
    
    // Handle IPFS URIs
    if (uri.startsWith('ipfs://')) {
      fetchUrl = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
    
    // Handle data URIs (base64 encoded JSON)
    if (uri.startsWith('data:application/json;base64,')) {
      try {
        const base64Data = uri.replace('data:application/json;base64,', '');
        const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');
        return JSON.parse(jsonString);
      } catch (error) {
        console.error('Error parsing base64 data URI:', error);
        return null;
      }
    }
    
    // Handle data URIs (plain JSON)
    if (uri.startsWith('data:application/json,')) {
      try {
        const jsonString = decodeURIComponent(uri.replace('data:application/json,', ''));
        return JSON.parse(jsonString);
      } catch (error) {
        console.error('Error parsing plain data URI:', error);
        return null;
      }
    }
    
    // Fetch from HTTP/HTTPS URLs
    if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
      console.log(`Unsupported URI scheme: ${uri}`);
      return null;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Stacks-Analytics/1.0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`HTTP error fetching URI: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.log(`Non-JSON content type: ${contentType}`);
      // Try to parse anyway, some servers don't set correct content-type
    }
    
    const jsonData = await response.json();
    
    console.log(`✓ Successfully fetched URI metadata:`, {
      name: jsonData.name,
      image: jsonData.image ? 'present' : 'missing',
      description: jsonData.description ? 'present' : 'missing',
      attributes: jsonData.attributes ? `${jsonData.attributes.length} items` : 'missing'
    });
    
    return jsonData;
    
  } catch (error) {
    console.error(`Error fetching token URI metadata from ${uri}:`, error);
    return null;
  }
}

/**
 * Validate and normalize image URL from token metadata
 * @param imageUrl Raw image URL from metadata
 * @param baseUri Base URI for relative URLs
 * @returns Normalized image URL or null
 */
export function normalizeImageUrl(imageUrl: string, baseUri?: string): string | null {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return null;
  }
  
  // Handle IPFS URLs
  if (imageUrl.startsWith('ipfs://')) {
    return imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  
  // Handle relative URLs
  if (imageUrl.startsWith('./') || imageUrl.startsWith('../')) {
    if (baseUri) {
      try {
        return new URL(imageUrl, baseUri).toString();
      } catch (error) {
        console.error('Error resolving relative image URL:', error);
        return null;
      }
    }
    return null;
  }
  
  // Handle absolute URLs
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // Handle protocol-relative URLs
  if (imageUrl.startsWith('//')) {
    return `https:${imageUrl}`;
  }
  
  return imageUrl;
}