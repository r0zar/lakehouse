import React from 'react';
import NetworkChartServer from '@/components/NetworkChartServer';

export default function SankeyPage() {
  return (
    <NetworkChartServer 
      limit={50}
    />
  );
}