/**
 * Watchdog-style Logger for Egg Shen Bot
 * 
 * Provides persistent, structured logging similar to Drupal's watchdog system.
 * Logs are written to files, rotated daily, and categorized by severity.
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = join(__dirname, '../../logs');

// Ensure logs directory exists
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

/**
 * Log severity levels (following syslog standard)
 */
export const LogLevel = {
  EMERGENCY: 0, // System is unusable
  ALERT: 1,     // Action must be taken immediately
  CRITICAL: 2,  // Critical conditions
  ERROR: 3,     // Error conditions
  WARNING: 4,   // Warning conditions
  NOTICE: 5,    // Normal but significant condition
  INFO: 6,      // Informational messages
  DEBUG: 7      // Debug-level messages
};

const LogLevelNames = {
  0: 'EMERGENCY',
  1: 'ALERT',
  2: 'CRITICAL',
  3: 'ERROR',
  4: 'WARNING',
  5: 'NOTICE',
  6: 'INFO',
  7: 'DEBUG'
};

/**
 * Log categories for organizing logs
 */
export const LogCategory = {
  SYSTEM: 'system',
  COMMAND: 'command',
  BUTTON: 'button',
  SELECT: 'select',
  MODAL: 'modal',
  SCHEDULER: 'scheduler',
  BRACKET: 'bracket',
  TIMER: 'timer',
  SURVEY: 'survey',
  API: 'api',
  DATABASE: 'database',
  PERFORMANCE: 'performance',
  SECURITY: 'security'
};

/**
 * Configuration
 */
const config = {
  // Minimum log level to record (set to DEBUG to log everything)
  minLevel: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  
  // Maximum log file size before rotation (10MB)
  maxFileSize: 10 * 1024 * 1024,
  
  // Maximum age of log files in days (30 days)
  maxAge: 30,
  
  // Whether to also log to console
  consoleOutput: true
};

/**
 * Get current log file path
 */
function getLogFilePath(category) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return join(logsDir, `${category}-${today}.log`);
}

/**
 * Format log entry as JSON line
 */
function formatLogEntry(level, category, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: LogLevelNames[level],
    levelNum: level,
    category,
    message,
    context: {
      ...context,
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    }
  };
  
  return JSON.stringify(entry) + '\n';
}

/**
 * Write log entry to file
 */
function writeLog(level, category, message, context = {}) {
  // Check if we should log this level
  if (level > config.minLevel) {
    return;
  }
  
  const logFile = getLogFilePath(category);
  const logEntry = formatLogEntry(level, category, message, context);
  
  try {
    // Check if file exists and its size
    if (existsSync(logFile)) {
      const stats = statSync(logFile);
      
      // Rotate if file is too large
      if (stats.size >= config.maxFileSize) {
        const timestamp = Date.now();
        const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
        
        // Rename current file
        try {
          renameSync(logFile, rotatedFile);
        } catch (err) {
          console.error('Failed to rotate log file:', err);
        }
      }
    }
    
    // Append to log file
    appendFileSync(logFile, logEntry, 'utf8');
    
    // Also output to console if configured
    if (config.consoleOutput) {
      const emoji = {
        0: '🚨', // EMERGENCY
        1: '🔴', // ALERT
        2: '💥', // CRITICAL
        3: '❌', // ERROR
        4: '⚠️', // WARNING
        5: '📢', // NOTICE
        6: 'ℹ️', // INFO
        7: '🐛'  // DEBUG
      };
      
      console.log(`${emoji[level]} [${LogLevelNames[level]}] [${category}] ${message}`);
      
      if (Object.keys(context).length > 0 && level <= LogLevel.ERROR) {
        console.log('Context:', JSON.stringify(context, null, 2));
      }
    }
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

/**
 * Clean up old log files
 */
export function cleanOldLogs() {
  try {
    const now = Date.now();
    const maxAgeMs = config.maxAge * 24 * 60 * 60 * 1000;
    
    const files = readdirSync(logsDir);
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      
      const filePath = join(logsDir, file);
      const stats = statSync(filePath);
      const age = now - stats.mtimeMs;
      
      if (age > maxAgeMs) {
        unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      log(LogLevel.INFO, LogCategory.SYSTEM, `Cleaned ${deletedCount} old log file(s)`);
    }
  } catch (error) {
    console.error('Failed to clean old logs:', error);
  }
}

/**
 * Main logging function
 */
export function log(level, category, message, context = {}) {
  writeLog(level, category, message, context);
}

// Convenience methods for each log level
export function emergency(category, message, context = {}) {
  log(LogLevel.EMERGENCY, category, message, context);
}

export function alert(category, message, context = {}) {
  log(LogLevel.ALERT, category, message, context);
}

export function critical(category, message, context = {}) {
  log(LogLevel.CRITICAL, category, message, context);
}

export function error(category, message, context = {}) {
  log(LogLevel.ERROR, category, message, context);
}

export function warning(category, message, context = {}) {
  log(LogLevel.WARNING, category, message, context);
}

export function notice(category, message, context = {}) {
  log(LogLevel.NOTICE, category, message, context);
}

export function info(category, message, context = {}) {
  log(LogLevel.INFO, category, message, context);
}

export function debug(category, message, context = {}) {
  log(LogLevel.DEBUG, category, message, context);
}

/**
 * Log command execution
 */
export function logCommand(commandName, user, guild, options = {}, success = true, error = null) {
  const level = success ? LogLevel.INFO : LogLevel.ERROR;
  const message = success 
    ? `Command executed: /${commandName}`
    : `Command failed: /${commandName}`;
  
  const context = {
    command: commandName,
    userId: user?.id,
    username: user?.username,
    guildId: guild?.id,
    guildName: guild?.name,
    options,
    success,
    error: error?.message,
    stack: error?.stack
  };
  
  log(level, LogCategory.COMMAND, message, context);
}

/**
 * Log button interaction
 */
export function logButton(customId, user, guild, success = true, error = null) {
  const level = success ? LogLevel.DEBUG : LogLevel.ERROR;
  const message = success 
    ? `Button clicked: ${customId}`
    : `Button interaction failed: ${customId}`;
  
  const context = {
    customId,
    userId: user?.id,
    username: user?.username,
    guildId: guild?.id,
    guildName: guild?.name,
    success,
    error: error?.message,
    stack: error?.stack
  };
  
  log(level, LogCategory.BUTTON, message, context);
}

/**
 * Log API call
 */
export function logAPI(service, endpoint, success = true, duration = null, error = null) {
  const level = success ? LogLevel.DEBUG : LogLevel.WARNING;
  const message = success 
    ? `API call: ${service} - ${endpoint}`
    : `API call failed: ${service} - ${endpoint}`;
  
  const context = {
    service,
    endpoint,
    success,
    duration,
    error: error?.message
  };
  
  log(level, LogCategory.API, message, context);
}

/**
 * Log performance metrics
 */
export function logPerformance(operation, duration, context = {}) {
  const level = duration > 5000 ? LogLevel.WARNING : LogLevel.DEBUG;
  const message = `Performance: ${operation} took ${duration}ms`;
  
  log(level, LogCategory.PERFORMANCE, message, {
    operation,
    duration,
    ...context
  });
}

/**
 * Log system event
 */
export function logSystem(message, context = {}) {
  log(LogLevel.INFO, LogCategory.SYSTEM, message, context);
}

/**
 * Get log statistics
 */
export function getLogStats() {
  try {
    const files = readdirSync(logsDir).filter(f => f.endsWith('.log'));
    
    let totalSize = 0;
    let oldestFile = null;
    let newestFile = null;
    
    for (const file of files) {
      const filePath = join(logsDir, file);
      const stats = statSync(filePath);
      totalSize += stats.size;
      
      if (!oldestFile || stats.mtimeMs < oldestFile.time) {
        oldestFile = { name: file, time: stats.mtimeMs };
      }
      
      if (!newestFile || stats.mtimeMs > newestFile.time) {
        newestFile = { name: file, time: stats.mtimeMs };
      }
    }
    
    return {
      fileCount: files.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      oldestFile: oldestFile?.name,
      newestFile: newestFile?.name,
      logsDir
    };
  } catch (error) {
    console.error('Failed to get log stats:', error);
    return null;
  }
}

// Clean old logs on startup
cleanOldLogs();

// Schedule daily cleanup (24 hours)
setInterval(cleanOldLogs, 24 * 60 * 60 * 1000);

// Log system startup
logSystem('Logger initialized', {
  minLevel: LogLevelNames[config.minLevel],
  logsDir,
  maxFileSize: `${(config.maxFileSize / (1024 * 1024)).toFixed(2)}MB`,
  maxAge: `${config.maxAge} days`
});
