/**
 * Debug Logger Utility with Performance Tracking
 * 
 * Provides logging functions that respect the DEBUG environment variable.
 * When DEBUG is false, logs are suppressed to reduce console noise in production.
 * 
 * Performance tracking can be enabled separately via ENABLE_PERFORMANCE_TRACKING.
 * 
 * Usage:
 *   import { logger, perf } from '@/utils/logger';
 *   logger.info('User logged in', { userId: 123 });
 *   
 *   // Performance tracking
 *   const timer = perf.start('database', 'fetch-users');
 *   await fetchUsers();
 *   perf.end(timer);
 */

/**
 * Log levels for categorizing messages
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Performance tracking entry
 */
interface PerformanceEntry {
  operation: string;
  duration: number;
  timestamp: number;
  metadata?: any;
}

/**
 * Performance tracker for measuring operation timings
 */
class PerformanceTracker {
  private entries: Map<string, PerformanceEntry[]> = new Map();
  private timers: Map<string, number> = new Map();
  private enabled: boolean;

  constructor() {
    this.enabled = import.meta.env.ENABLE_PERFORMANCE_TRACKING === 'true';
  }

  /**
   * Check if performance tracking is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start timing an operation
   * @returns A unique key to pass to end() method
   */
  start(category: string, operation: string): string {
    if (!this.enabled) return '';
    
    const key = `${category}:${operation}:${Date.now()}`;
    this.timers.set(key, performance.now());
    return key;
  }

  /**
   * End timing an operation
   * @param key The key returned from start()
   * @param metadata Optional metadata to attach to this timing
   */
  end(key: string, metadata?: any): void {
    if (!this.enabled || !key) return;
    
    const startTime = this.timers.get(key);
    if (!startTime) return;

    const duration = performance.now() - startTime;
    const [category, operation] = key.split(':');
    
    if (!this.entries.has(category)) {
      this.entries.set(category, []);
    }

    this.entries.get(category)!.push({
      operation,
      duration,
      timestamp: Date.now(),
      metadata
    });

    this.timers.delete(key);
  }

  /**
   * Track a synchronous operation
   */
  track<T>(category: string, operation: string, fn: () => T, metadata?: any): T {
    if (!this.enabled) return fn();

    const key = this.start(category, operation);
    try {
      const result = fn();
      this.end(key, metadata);
      return result;
    } catch (error) {
      this.end(key, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Track an asynchronous operation
   */
  async trackAsync<T>(
    category: string, 
    operation: string, 
    fn: () => Promise<T>,
    metadata?: any
  ): Promise<T> {
    if (!this.enabled) return fn();

    const key = this.start(category, operation);
    try {
      const result = await fn();
      this.end(key, metadata);
      return result;
    } catch (error) {
      this.end(key, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Get all entries for a category
   */
  getEntries(category: string): PerformanceEntry[] {
    return this.entries.get(category) || [];
  }

  /**
   * Get total time for a category
   */
  getTotalTime(category: string): number {
    const entries = this.entries.get(category) || [];
    return entries.reduce((sum, entry) => sum + entry.duration, 0);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Generate a formatted performance report
   */
  generateReport(tag: string): string {
    if (!this.enabled || this.entries.size === 0) return '';

    const lines: string[] = [];
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push(`  PERFORMANCE REPORT - ${tag.toUpperCase()}`);
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');

    let grandTotal = 0;

    for (const category of this.getCategories()) {
      const entries = this.getEntries(category);
      const categoryTotal = this.getTotalTime(category);
      grandTotal += categoryTotal;

      lines.push(`┌─ ${category.toUpperCase()}`);
      lines.push(`├─ Total: ${categoryTotal.toFixed(2)}ms`);
      lines.push(`├─ Operations: ${entries.length}`);
      lines.push('│');

      entries.forEach((entry, index) => {
        const isLast = index === entries.length - 1;
        const prefix = isLast ? '└─' : '├─';
        const metaStr = entry.metadata ? ` [${JSON.stringify(entry.metadata)}]` : '';
        lines.push(`${prefix} ${entry.operation}: ${entry.duration.toFixed(2)}ms${metaStr}`);
      });

      lines.push('');
    }

    lines.push('───────────────────────────────────────────────────────────');
    lines.push(`  GRAND TOTAL: ${grandTotal.toFixed(2)}ms`);
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Print performance report to console
   */
  printReport(tag: string): void {
    const report = this.generateReport(tag);
    if (report) {
      console.log(report);
    }
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.entries.clear();
    this.timers.clear();
  }
}

/**
 * Format log message with timestamp and level
 */
function formatMessage(level: LogLevel, tag: string, message: string): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${hours}:${minutes}:${seconds}`;
  return `[${timestamp}] [${level}] [${tag}] ${message}`;
}

/**
 * Logger class with conditional logging based on DEBUG flag
 */
class Logger {
  /**
   * Log debug information (only in debug mode)
   * Use for detailed debugging information
   */
  debug(tag: string, message: string, data?: any) {
    if (import.meta.env.DEBUG === 'false') return;
    
    const formatted = formatMessage(LogLevel.DEBUG, tag, message);
    if (data !== undefined) {
      console.debug(formatted, data);
    } else {
      console.debug(formatted);
    }
  }

  /**
   * Log general information (only in debug mode)
   * Use for routine operational messages
   */
  info(tag: string, message: string, data?: any) {
    if (import.meta.env.DEBUG === 'false') return;
    
    const formatted = formatMessage(LogLevel.INFO, tag, message);
    if (data !== undefined) {
      console.log(formatted, data);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Log warnings (always shown, even in production)
   * Use for potentially problematic situations
   */
  warn(tag: string, message: string, data?: any) {
    const formatted = formatMessage(LogLevel.WARN, tag, message);
    if (data !== undefined) {
      console.warn(formatted, data);
    } else {
      console.warn(formatted);
    }
  }

  /**
   * Log errors (always shown, even in production)
   * Use for error conditions that need attention
   */
  error(tag: string, message: string, error?: any) {
    const formatted = formatMessage(LogLevel.ERROR, tag, message);
    if (error !== undefined) {
      console.error(formatted, error);
    } else {
      console.error(formatted);
    }
  }

  /**
   * Performance timing helper (deprecated - use perf.trackAsync instead)
   */
  async time<T>(
    tag: string,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    if (import.meta.env.DEBUG === 'false') {
      return fn();
    }

    const start = performance.now();
    this.debug(tag, `Starting: ${operation}`);
    
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.info(tag, `Completed: ${operation} (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(tag, `Failed: ${operation} (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Sync performance timing helper (deprecated - use perf.track instead)
   */
  timeSync<T>(tag: string, operation: string, fn: () => T): T {
    if (import.meta.env.DEBUG === 'false') {
      return fn();
    }

    const start = performance.now();
    this.debug(tag, `Starting: ${operation}`);
    
    try {
      const result = fn();
      const duration = Math.round(performance.now() - start);
      this.info(tag, `Completed: ${operation} (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(tag, `Failed: ${operation} (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * Group related logs together
   */
  group(tag: string, label: string) {
    if (import.meta.env.DEBUG === 'false') return;
    console.group(`[${tag}] ${label}`);
  }

  /**
   * End log group
   */
  groupEnd() {
    if (import.meta.env.DEBUG === 'false') return;
    console.groupEnd();
  }

  /**
   * Create a scoped logger with a fixed tag
   * Useful for creating module-specific loggers
   */
  createScoped(tag: string) {
    return {
      debug: (message: string, data?: any) => this.debug(tag, message, data),
      info: (message: string, data?: any) => this.info(tag, message, data),
      warn: (message: string, data?: any) => this.warn(tag, message, data),
      error: (message: string, error?: any) => this.error(tag, message, error),
      time: <T>(operation: string, fn: () => Promise<T>) => 
        this.time(tag, operation, fn),
      timeSync: <T>(operation: string, fn: () => T) => 
        this.timeSync(tag, operation, fn),
    };
  }
}

/**
 * Shared logger instance
 * Import and use this throughout your application
 */
export const logger = new Logger();

/**
 * Shared performance tracker instance
 * Use this for detailed performance tracking
 */
export const perf = new PerformanceTracker();

/**
 * Convenience function to create page-specific loggers
 * 
 * Usage:
 *   const log = createPageLogger('customer-ticket');
 *   log.info('Page loaded');
 */
export function createPageLogger(pageName: string) {
  return logger.createScoped(pageName);
}