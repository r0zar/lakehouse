import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

export async function GET(request: NextRequest) {
  try {
    // Get cached popular tokens
    const popularTokensQuery = `
      SELECT 
        contract_address,
        token_symbol,
        token_name,
        image_url,
        decimals,
        transaction_count,
        rank,
        updated_at
      FROM crypto_data.cache_popular_tokens
      ORDER BY rank ASC
    `;

    const [rows] = await bigquery.query({
      query: popularTokensQuery,
      jobTimeoutMs: 30000,
    });

    // If no cached data, return fallback tokens
    if (rows.length === 0) {
      return NextResponse.json({
        popular_tokens: [
          {
            contract_address: 'STX',
            token_symbol: 'STX',
            token_name: 'Stacks',
            image_url: 'https://charisma.rocks/stx-logo.png',
            decimals: 6,
            transaction_count: 0,
            rank: 1
          }
        ],
        cached: false,
        message: 'No cached data available, returning fallback tokens'
      });
    }

    // Always include STX as the first token
    const tokensWithSTX = [
      {
        contract_address: 'STX',
        token_symbol: 'STX',
        token_name: 'Stacks',
        image_url: 'https://charisma.rocks/stx-logo.png',
        decimals: 6,
        transaction_count: 999999, // High count to keep STX first
        rank: 0
      },
      ...rows.map(row => ({
        contract_address: row.contract_address,
        token_symbol: row.token_symbol,
        token_name: row.token_name,
        image_url: row.image_url,
        decimals: row.decimals,
        transaction_count: row.transaction_count,
        rank: row.rank + 1 // Shift ranks to accommodate STX
      }))
    ].slice(0, 6); // Limit to 6 total tokens

    return NextResponse.json({
      popular_tokens: tokensWithSTX,
      cached: true,
      cache_updated_at: rows[0]?.updated_at,
      total_tokens: tokensWithSTX.length
    });

  } catch (error: any) {
    console.error('Failed to fetch popular tokens:', error);
    
    // Return fallback tokens on error
    return NextResponse.json({
      popular_tokens: [
        {
          contract_address: 'STX',
          token_symbol: 'STX',
          token_name: 'Stacks',
          image_url: 'https://charisma.rocks/stx-logo.png',
          decimals: 6,
          transaction_count: 0,
          rank: 1
        }
      ],
      cached: false,
      error: error.message
    }, { status: 500 });
  }
}