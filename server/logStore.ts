import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

export interface LogEntry {
    id: string;
    userId: string;
    username: string;
    timestamp: string;
    success: boolean;
    ip?: string;
}

let logs: LogEntry[] = [];

function loadLogs() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (fs.existsSync(LOGS_FILE)) {
            const data = fs.readFileSync(LOGS_FILE, 'utf-8');
            logs = JSON.parse(data);
        } else {
            logs = [];
        }
    } catch (error) {
        console.error('Failed to load logs:', error);
        logs = [];
    }
}

function saveLogs() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (error) {
        console.error('Failed to save logs:', error);
    }
}

// Load logs on startup
loadLogs();

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

    saveLogs();
    return entry;
}

export function listLogs(): LogEntry[] {
    return logs;
}
