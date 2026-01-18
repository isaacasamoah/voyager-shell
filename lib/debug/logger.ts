/**
 * Voyager Debug Logger
 *
 * Structured, toggleable logging for development.
 *
 * Enable in browser:
 *   localStorage.setItem('voyager:debug', '*')           // all domains
 *   localStorage.setItem('voyager:debug', 'intent,ui')   // specific domains
 *   localStorage.removeItem('voyager:debug')             // disable
 *
 * Enable on server:
 *   VOYAGER_DEBUG=*              // all domains
 *   VOYAGER_DEBUG=message,voyage // specific domains
 */

const DOMAINS = {
  message: '💬',
  voyage: '🚀',
  memory: '🧠',
  ui: '🎨',
  intent: '🎯',
  auth: '🔐',
  api: '📡',
  agent: '🤖',
} as const;

export type LogDomain = keyof typeof DOMAINS;
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function getEnabledDomains(): Set<string> {
  // Client-side
  if (typeof window !== 'undefined') {
    const setting = localStorage.getItem('voyager:debug');
    if (!setting) return new Set();
    if (setting === '*') return new Set(Object.keys(DOMAINS));
    return new Set(setting.split(',').map(s => s.trim()));
  }
  // Server-side
  const setting = process.env.VOYAGER_DEBUG;
  if (!setting) return new Set();
  if (setting === '*') return new Set(Object.keys(DOMAINS));
  return new Set(setting.split(',').map(s => s.trim()));
}

function isEnabled(domain: LogDomain): boolean {
  return getEnabledDomains().has(domain);
}

export function voyagerLog(
  domain: LogDomain,
  message: string,
  data?: Record<string, unknown>,
  level: LogLevel = 'debug'
): void {
  if (!isEnabled(domain)) return;

  const emoji = DOMAINS[domain];
  const prefix = `[${emoji} ${domain}]`;
  const output = data
    ? `${prefix} ${message} ${JSON.stringify(data)}`
    : `${prefix} ${message}`;

  switch (level) {
    case 'error': console.error(output); break;
    case 'warn': console.warn(output); break;
    default: console.log(output);
  }
}

// Convenience helpers (support optional level parameter)
export const log = {
  message: (msg: string, data?: Record<string, unknown>, level?: LogLevel) => voyagerLog('message', msg, data, level),
  voyage: (msg: string, data?: Record<string, unknown>, level?: LogLevel) => voyagerLog('voyage', msg, data, level),
  memory: (msg: string, data?: Record<string, unknown>, level?: LogLevel) => voyagerLog('memory', msg, data, level),
  ui: (msg: string, data?: Record<string, unknown>, level?: LogLevel) => voyagerLog('ui', msg, data, level),
  intent: (msg: string, data?: Record<string, unknown>, level?: LogLevel) => voyagerLog('intent', msg, data, level),
  auth: (msg: string, data?: Record<string, unknown>, level?: LogLevel) => voyagerLog('auth', msg, data, level),
  api: (msg: string, data?: Record<string, unknown>, level?: LogLevel) => voyagerLog('api', msg, data, level),
  agent: (msg: string, data?: Record<string, unknown>, level?: LogLevel) => voyagerLog('agent', msg, data, level),
};
