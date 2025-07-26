export interface ChainhookEvent {
    event_id: string;
    received_at: string;
    webhook_path: string;
    body_json: any;
    headers?: string; // JSON string for BigQuery JSON column
    url?: string;
    method?: string;
}

export interface WebhookResponse {
    ok: boolean;
    event_id: string;
    error?: string;
    note?: string;
}