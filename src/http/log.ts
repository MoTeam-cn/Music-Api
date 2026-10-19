// 单行 JSON 日志；IP 只落哈希，不存明文。

import { createHash } from 'node:crypto';
import type { LogLevel } from '../config.ts';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 8);
}

export function createLogger(level: LogLevel): Logger {
  const min = ORDER[level];
  function write(lvl: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (ORDER[lvl] < min) return;
    const line = { ts: new Date().toISOString(), level: lvl, msg: message, ...(fields ?? {}) };
    process.stdout.write(JSON.stringify(line) + '\n');
  }
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
  };
}
