import { NextRequest, NextResponse } from 'next/server';

/**
 * Validates API key authorization
 * Returns null if authorized, otherwise returns an error response
 */
export function validateApiKey(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get('x-api-key');
  const expectedApiKey = process.env.API_KEY || process.env.DEBUG_API_KEY;
  
  if (!expectedApiKey) {
    return NextResponse.json({
      error: 'API key validation is not configured on server'
    }, { status: 500 });
  }
  
  if (!apiKey) {
    return NextResponse.json({
      error: 'Missing x-api-key header'
    }, { status: 401 });
  }
  
  if (apiKey !== expectedApiKey) {
    return NextResponse.json({
      error: 'Invalid API key'
    }, { status: 403 });
  }
  
  return null; // Authorized
}