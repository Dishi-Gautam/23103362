const DEFAULT_ENDPOINT = null;

const STACK_VALUES = ['backend', 'frontend'];
const LEVEL_VALUES = ['debug', 'info', 'warn', 'error', 'fatal'];
const PACKAGE_VALUES = [
  'cache',
  'controller',
  'cron_job',
  'db',
  'domain',
  'handler',
  'repository',
  'route',
  'service',
];

function normalizeValue(value, allowedValues, fieldName) {
  if (typeof value !== 'string') {
    throw new TypeError(`${fieldName} must be a string`);
  }

  const cleanValue = value.trim();

  if (!cleanValue || cleanValue !== cleanValue.toLowerCase() || !allowedValues.includes(cleanValue)) {
    throw new RangeError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }

  return cleanValue;
}

function parseMessage(message) {
  const cleanMessage = typeof message === 'string' ? message.trim() : String(message ?? '').trim();

  if (!cleanMessage) {
    throw new RangeError('message must not be empty');
  }

  return cleanMessage;
}

function resolveEndpoint() {
  return process.env.LOGGING_API_URL || process.env.LOG_API_URL || DEFAULT_ENDPOINT;
}

function resolveHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = process.env.LOGGING_API_TOKEN || process.env.LOG_API_TOKEN || process.env.EVALUATION_SERVICE_TOKEN;

  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  return headers;
}

export async function Log(stack, level, packageName, message) {
  const endpoint = resolveEndpoint();
  if (!endpoint) {
    return null;
  }
  const payload = {
    stack: normalizeValue(stack, STACK_VALUES, 'stack'),
    level: normalizeValue(level, LEVEL_VALUES, 'level'),
    package: normalizeValue(packageName, PACKAGE_VALUES, 'package'),
    message: parseMessage(message),
  };

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutMs = Number.parseInt(process.env.LOGGING_TIMEOUT_MS || '5000', 10);
  const timer = controller && Number.isFinite(timeoutMs) && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    if (typeof fetch !== 'function') {
      throw new Error('fetch is not available in this runtime');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: resolveHeaders(),
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    });

    const responseText = await response.text();
    let data;

    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      data = responseText;
    }

    if (!response.ok) {
      const error = new Error(`log request failed with status ${response.status}`);
      error.status = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function createLoggingMiddleware(defaultPackage = 'controller') {
  const normalizedPackage = normalizeValue(defaultPackage, PACKAGE_VALUES, 'defaultPackage');

  return function loggingMiddleware(req, res, next) {
    const startedAt = Date.now();

    res.once('finish', () => {
      const statusCode = res.statusCode || 0;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      const message = `${req.method} ${req.originalUrl || req.url} -> ${statusCode} in ${Date.now() - startedAt}ms`;

      Log('backend', level, normalizedPackage, message).catch(() => {});
    });

    next();
  };
}

export {
  DEFAULT_ENDPOINT,
  STACK_VALUES,
  LEVEL_VALUES,
  PACKAGE_VALUES,
};