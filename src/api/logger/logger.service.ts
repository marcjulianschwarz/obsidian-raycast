export class Logger {
  private readonly name: string;

  // ANSI escape codes for colors
  private static readonly COLORS = {
    reset: "\x1b[0m",
    info: "\x1b[34m", // Blue
    success: "\x1b[32m", // Green
    warning: "\x1b[33m", // Yellow
    error: "\x1b[31m", // Red
    debug: "\x1b[35m", // Magenta
    trace: "\x1b[90m", // Gray
    timestamp: "\x1b[90m", // Gray for timestamp
    name: "\x1b[36m", // Cyan for logger name
  };

  // Enabled log levels - modify this array to control what gets logged
  private static enabledLevels: string[] = ["info", "success", "warning", "error", "trace"];

  constructor(name?: string) {
    this.name = name || "Logger";
  }

  private timestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(message: unknown): string {
    if (typeof message === "string") {
      return message;
    }

    if (message instanceof Error) {
      return `${message.message}\n${message.stack}`;
    }

    if (typeof message === "object" && message !== null) {
      try {
        return JSON.stringify(message, null, 2);
      } catch (e) {
        return String(message);
      }
    }

    return String(message);
  }

  private log(level: string, color: string, message: unknown, data?: Record<string, unknown>): void {
    if (!Logger.enabledLevels.includes(level)) {
      return;
    }

    const formattedTimestamp = `${Logger.COLORS.timestamp}[${this.timestamp()}]${Logger.COLORS.reset}`;
    const formattedName = `${Logger.COLORS.name}[${this.name}]${Logger.COLORS.reset}`;
    const formattedLevel = `${color}[${level.toUpperCase()}]${Logger.COLORS.reset}`;
    const formattedMessage = this.formatMessage(message);

    let output = `${formattedTimestamp} ${formattedName} ${formattedLevel} ${formattedMessage}`;

    if (data) {
      try {
        const formattedData = JSON.stringify(data, null, 2);
        output += `\n${Logger.COLORS.trace}${formattedData}${Logger.COLORS.reset}`;
      } catch (e) {
        output += `\n${Logger.COLORS.trace}[Invalid JSON data]${Logger.COLORS.reset}`;
      }
    }

    console.log(output);
  }

  info(message: unknown, data?: Record<string, unknown>): void {
    this.log("info", Logger.COLORS.info, message, data);
  }

  success(message: unknown, data?: Record<string, unknown>): void {
    this.log("success", Logger.COLORS.success, message, data);
  }

  warning(message: unknown, data?: Record<string, unknown>): void {
    this.log("warning", Logger.COLORS.warning, message, data);
  }

  error(message: unknown, data?: Record<string, unknown>): void {
    this.log("error", Logger.COLORS.error, message, data);
  }

  debug(message: unknown, data?: Record<string, unknown>): void {
    this.log("debug", Logger.COLORS.debug, message, data);
  }

  trace(message: unknown, data?: Record<string, unknown>): void {
    this.log("trace", Logger.COLORS.trace, message, data);
  }
}
