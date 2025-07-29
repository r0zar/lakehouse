import NetworkChartClient from "@/components/NetworkChartClient";

interface HomeProps {
  searchParams: Promise<{
    limit?: string;
    minValue?: string;
    asset?: string;
    hideIsolated?: string;
    address?: string;
    showParticles?: string;
    focusMode?: string;
  }>;
}

export default async function Home({ searchParams }: HomeProps) {
  // Await search parameters in Next.js 15
  const params = await searchParams;
  
  // Parse search parameters with defaults and validation
  const limit = Math.max(10, Math.min(100000, parseInt(params.limit || '500')));
  const minValue = Math.max(0, parseFloat(params.minValue || '0'));
  const asset = params.asset || '';
  const hideIsolated = params.hideIsolated !== 'false'; // Default to true unless explicitly 'false'
  const address = params.address || '';
  
  // Default particles based on limit and explicit URL param
  let showParticles: boolean | undefined;
  if (params.showParticles !== undefined) {
    showParticles = params.showParticles === 'true';
  } else {
    // Auto-default: true for < 10k transactions, false for >= 10k
    showParticles = limit < 10000;
  }

  // Parse focus mode parameter (default to false)
  const focusMode = params.focusMode === 'true';

  return (
    <NetworkChartClient
      initialLimit={limit}
      initialMinValue={minValue}
      initialAsset={asset}
      initialHideIsolated={hideIsolated}
      initialAddress={address}
      initialShowParticles={showParticles}
      initialFocusMode={focusMode}
    />
  );
}
