type LogContext = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', event: string, ctx?: LogContext, err?: unknown) {
  const payload: LogContext = { event, ...ctx };
  if (err !== undefined) payload.error = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;
  const line = `[${level}] ${event}`;
  if (level === 'error') console.error(line, payload);
  else if (level === 'warn') console.warn(line, payload);
  else console.info(line, payload);
}

export const logger = {
  info: (event: string, ctx?: LogContext) => emit('info', event, ctx),
  warn: (event: string, ctx?: LogContext) => emit('warn', event, ctx),
  error: (event: string, err?: unknown, ctx?: LogContext) => emit('error', event, ctx, err),
};
