import NetworkChartClient from "@/components/NetworkChartClient";

interface HomeProps {
  searchParams: Promise<{
    limit?: string;
    minValue?: string;
    asset?: string;
    hideIsolated?: string;
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

  return (
    <NetworkChartClient
      initialLimit={limit}
      initialMinValue={minValue}
      initialAsset={asset}
      initialHideIsolated={hideIsolated}
    />
  );
}
