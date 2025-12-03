import { randomUUID } from 'node:crypto';

export interface LogEntry {
    id: string;
    userId: string;
    username: string;
    timestamp: string;
    success: boolean;
    ip?: string;
}

const logs: LogEntry[] = [];

export function logLogin(userId: string, username: string, success: boolean, ip?: string): LogEntry {
    const entry: LogEntry = {
        id: randomUUID(),
        userId,
        username,
        timestamp: new Date().toISOString(),
        success,
        ip
    };
    logs.unshift(entry); // Add to beginning

    // Keep only last 1000 logs
    if (logs.length > 1000) {
        logs.pop();
    }

    return entry;
}

export function listLogs(): LogEntry[] {
    return logs;
}
