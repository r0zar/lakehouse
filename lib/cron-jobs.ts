import { bigquery } from './bigquery';

interface CronJobConfig {
  name: string;
  interval: number; // milliseconds
  apiEndpoint: string;
  description: string;
}

// Cron job configurations based on requirements
export const CRON_JOBS: CronJobConfig[] = [
  // 1-minute jobs (high-frequency trading data)
  {
    name: 'defi-flows-refresh',
    interval: 60000, // 1 minute
    apiEndpoint: '/api/analytics/defi-flows',
    description: 'Refresh DeFi flows data for real-time trading insights'
  },
  {
    name: 'token-activity-refresh', 
    interval: 60000, // 1 minute
    apiEndpoint: '/api/analytics/token-activity',
    description: 'Refresh token buy/sell activity data'
  },

  // 5-minute jobs (regular analytics)
  {
    name: 'contract-activity-refresh',
    interval: 300000, // 5 minutes
    apiEndpoint: '/api/analytics/contract-activity',
    description: 'Refresh smart contract activity patterns'
  },
  {
    name: 'daily-analytics-refresh',
    interval: 300000, // 5 minutes  
    apiEndpoint: '/api/analytics/daily',
    description: 'Refresh daily activity summaries'
  },

  // 15-minute jobs (slower analytics)
  {
    name: 'block-analytics-refresh',
    interval: 900000, // 15 minutes
    apiEndpoint: '/api/analytics/block-analytics',
    description: 'Refresh block-level statistics'
  },
  {
    name: 'transaction-analytics-refresh',
    interval: 900000, // 15 minutes
    apiEndpoint: '/api/analytics/transaction-analytics', 
    description: 'Refresh transaction pattern analysis'
  },
  {
    name: 'smart-contract-analytics-refresh',
    interval: 900000, // 15 minutes
    apiEndpoint: '/api/analytics/smart-contract-analytics',
    description: 'Refresh smart contract performance metrics'
  },

  // 4-hour jobs (reference data)
  {
    name: 'contracts-refresh',
    interval: 14400000, // 4 hours
    apiEndpoint: '/api/contracts',
    description: 'Refresh contract discovery data'
  },
  {
    name: 'tokens-refresh',
    interval: 14400000, // 4 hours
    apiEndpoint: '/api/tokens',
    description: 'Refresh token discovery data'
  }
];

class CronScheduler {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  async start() {
    if (this.isRunning) {
      console.log('Cron scheduler already running');
      return;
    }

    console.log('Starting cron scheduler...');
    this.isRunning = true;

    for (const job of CRON_JOBS) {
      await this.scheduleJob(job);
    }

    console.log(`Started ${CRON_JOBS.length} cron jobs`);
  }

  stop() {
    console.log('Stopping cron scheduler...');
    
    for (const [name, interval] of this.intervals) {
      clearInterval(interval);
      console.log(`Stopped job: ${name}`);
    }
    
    this.intervals.clear();
    this.isRunning = false;
  }

  private async scheduleJob(job: CronJobConfig) {
    console.log(`Scheduling ${job.name}: ${job.description} (every ${job.interval/1000}s)`);

    // Run immediately on startup
    await this.executeJob(job);

    // Schedule recurring execution
    const interval = setInterval(async () => {
      await this.executeJob(job);
    }, job.interval);

    this.intervals.set(job.name, interval);
  }

  private async executeJob(job: CronJobConfig) {
    try {
      console.log(`[${new Date().toISOString()}] Executing ${job.name}`);
      
      // For BigQuery-based jobs, we can pre-warm the cache
      const startTime = Date.now();
      
      // Make an internal API call to refresh the data
      const response = await fetch(`http://localhost:3000${job.apiEndpoint}?limit=10`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Internal-Cron-Job',
        },
      });

      const duration = Date.now() - startTime;
      
      if (response.ok) {
        console.log(`[${new Date().toISOString()}] ✅ ${job.name} completed in ${duration}ms`);
      } else {
        console.error(`[${new Date().toISOString()}] ❌ ${job.name} failed: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ ${job.name} error:`, error);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.intervals.keys()),
      totalJobs: CRON_JOBS.length
    };
  }
}

export const cronScheduler = new CronScheduler();

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  cronScheduler.start();
}