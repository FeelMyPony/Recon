import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Base logger instance. In production, outputs structured JSON for CloudWatch.
 * In development, uses pino-pretty for human-readable output.
 */
const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

/**
 * Create a child logger with workspace and user context.
 * Every log line includes workspaceId and userId for traceability.
 *
 * Usage:
 *   const log = createLogger({ workspaceId: "...", userId: "..." });
 *   log.info({ leadId: "..." }, "Lead scored as hot");
 */
export function createLogger(context?: {
  workspaceId?: string;
  userId?: string;
  module?: string;
}) {
  return baseLogger.child({
    ...(context?.workspaceId && { workspaceId: context.workspaceId }),
    ...(context?.userId && { userId: context.userId }),
    ...(context?.module && { module: context.module }),
  });
}

/** Default logger for startup/shutdown and module-level logging */
export const logger = baseLogger;

export default logger;
