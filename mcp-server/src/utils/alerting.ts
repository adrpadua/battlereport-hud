/**
 * Alerting utilities for integrity checks and monitoring.
 *
 * Supports multiple alert channels:
 * - Console output (always enabled)
 * - Discord webhooks (optional, via DISCORD_WEBHOOK_URL)
 * - JSON output for machine parsing
 */

export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';

export interface Alert {
  level: AlertLevel;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface AlertConfig {
  discordWebhookUrl?: string;
  jsonOutput?: boolean;
  silent?: boolean;
}

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  critical: '🚨',
};

const LEVEL_COLORS: Record<AlertLevel, number> = {
  info: 0x3498db, // Blue
  warning: 0xf39c12, // Orange
  error: 0xe74c3c, // Red
  critical: 0x9b59b6, // Purple
};

export class Alerter {
  private alerts: Alert[] = [];
  private config: AlertConfig;

  constructor(config: AlertConfig = {}) {
    this.config = {
      discordWebhookUrl: config.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL,
      jsonOutput: config.jsonOutput ?? false,
      silent: config.silent ?? false,
    };
  }

  /**
   * Add an alert
   */
  add(level: AlertLevel, title: string, message: string, details?: Record<string, unknown>): void {
    const alert: Alert = {
      level,
      title,
      message,
      details,
      timestamp: new Date().toISOString(),
    };

    this.alerts.push(alert);

    if (!this.config.silent) {
      this.logToConsole(alert);
    }
  }

  info(title: string, message: string, details?: Record<string, unknown>): void {
    this.add('info', title, message, details);
  }

  warning(title: string, message: string, details?: Record<string, unknown>): void {
    this.add('warning', title, message, details);
  }

  error(title: string, message: string, details?: Record<string, unknown>): void {
    this.add('error', title, message, details);
  }

  critical(title: string, message: string, details?: Record<string, unknown>): void {
    this.add('critical', title, message, details);
  }

  /**
   * Log alert to console
   */
  private logToConsole(alert: Alert): void {
    const emoji = LEVEL_EMOJI[alert.level];
    const prefix = `${emoji} [${alert.level.toUpperCase()}]`;

    console.log(`\n${prefix} ${alert.title}`);
    console.log(`  ${alert.message}`);

    if (alert.details) {
      for (const [key, value] of Object.entries(alert.details)) {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  /**
   * Send all alerts to Discord webhook
   */
  async sendToDiscord(): Promise<boolean> {
    if (!this.config.discordWebhookUrl) {
      return false;
    }

    const alertsToSend = this.alerts.filter(a => a.level !== 'info');

    if (alertsToSend.length === 0) {
      return true;
    }

    // Group alerts by level
    const embeds = alertsToSend.slice(0, 10).map(alert => ({
      title: `${LEVEL_EMOJI[alert.level]} ${alert.title}`,
      description: alert.message,
      color: LEVEL_COLORS[alert.level],
      fields: alert.details
        ? Object.entries(alert.details).slice(0, 5).map(([name, value]) => ({
            name,
            value: String(value).slice(0, 200),
            inline: true,
          }))
        : undefined,
      timestamp: alert.timestamp,
    }));

    try {
      const response = await fetch(this.config.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds }),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to send Discord alert:', error);
      return false;
    }
  }

  /**
   * Get alerts as JSON
   */
  toJSON(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: this.getSummary(),
      alerts: this.alerts,
    }, null, 2);
  }

  /**
   * Get summary of alerts by level
   */
  getSummary(): Record<AlertLevel, number> {
    const summary: Record<AlertLevel, number> = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };

    for (const alert of this.alerts) {
      summary[alert.level]++;
    }

    return summary;
  }

  /**
   * Check if there are any errors or critical alerts
   */
  hasErrors(): boolean {
    return this.alerts.some(a => a.level === 'error' || a.level === 'critical');
  }

  /**
   * Check if there are any warnings
   */
  hasWarnings(): boolean {
    return this.alerts.some(a => a.level === 'warning');
  }

  /**
   * Get exit code based on alert levels
   */
  getExitCode(): number {
    if (this.alerts.some(a => a.level === 'critical')) return 2;
    if (this.alerts.some(a => a.level === 'error')) return 1;
    return 0;
  }

  /**
   * Get all alerts
   */
  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  /**
   * Clear all alerts
   */
  clear(): void {
    this.alerts = [];
  }

  /**
   * Print summary and optionally send to Discord
   */
  async finalize(): Promise<number> {
    const summary = this.getSummary();

    console.log('\n' + '='.repeat(50));
    console.log('ALERT SUMMARY');
    console.log('='.repeat(50));
    console.log(`  Info:     ${summary.info}`);
    console.log(`  Warnings: ${summary.warning}`);
    console.log(`  Errors:   ${summary.error}`);
    console.log(`  Critical: ${summary.critical}`);

    if (this.config.jsonOutput) {
      console.log('\n--- JSON Output ---');
      console.log(this.toJSON());
    }

    if (this.config.discordWebhookUrl && (this.hasErrors() || this.hasWarnings())) {
      console.log('\nSending alerts to Discord...');
      const sent = await this.sendToDiscord();
      console.log(sent ? '  Discord notification sent.' : '  Failed to send Discord notification.');
    }

    return this.getExitCode();
  }
}

/**
 * Create a default alerter instance
 */
export function createAlerter(config?: AlertConfig): Alerter {
  return new Alerter(config);
}
