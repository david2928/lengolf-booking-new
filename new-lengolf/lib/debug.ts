const DEBUG = true;

interface DebugLog {
  timestamp: string;
  type: string;
  args: string;
}

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Force logs to persist in localStorage
const persistLog = (type: string, ...args: any[]) => {
  const timestamp = new Date().toISOString();
  const log: DebugLog = {
    timestamp,
    type,
    args: JSON.stringify(args, null, 2)
  };

  try {
    if (isBrowser) {
      // Browser-side logging
      // Get existing logs
      const logs: DebugLog[] = JSON.parse(localStorage.getItem('debug_logs') || '[]');
      logs.push(log);
      // Keep only last 100 logs
      if (logs.length > 100) logs.shift();
      localStorage.setItem('debug_logs', JSON.stringify(logs));

      // Also log to console
      console.group(`[${type}] ${timestamp}`);
      console.info('Arguments:', ...args);
      console.groupEnd();

      // Create or update debug overlay
      let overlay = document.getElementById('debug-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'debug-overlay';
        overlay.style.cssText = `
          position: fixed;
          bottom: 0;
          right: 0;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 10px;
          font-family: monospace;
          font-size: 12px;
          max-height: 200px;
          max-width: 400px;
          overflow: auto;
          z-index: 9999;
        `;
        document.body.appendChild(overlay);
      }

      // Update overlay content
      const logEntry = document.createElement('div');
      logEntry.style.borderBottom = '1px solid rgba(255,255,255,0.2)';
      logEntry.style.padding = '5px 0';
      logEntry.innerHTML = `
        <div style="color: ${type === 'ERROR' ? '#ff6b6b' : type === 'WARN' ? '#ffd93d' : '#4cd137'}">
          [${type}] ${new Date().toLocaleTimeString()}
        </div>
        <div>${JSON.stringify(args)}</div>
      `;
      overlay.appendChild(logEntry);
      overlay.scrollTop = overlay.scrollHeight;
    } else {
      // Server-side logging
      console.log(`[${type}] ${timestamp}:`, ...args);
    }
  } catch (e) {
    console.error('Failed to persist log:', e);
  }
};

export const debug = {
  log: (...args: any[]) => {
    if (DEBUG) {
      persistLog('DEBUG', ...args);
    }
  },
  error: (...args: any[]) => {
    if (DEBUG) {
      persistLog('ERROR', ...args);
    }
  },
  warn: (...args: any[]) => {
    if (DEBUG) {
      persistLog('WARN', ...args);
    }
  },
  // Get all logs (client-side only)
  getLogs: (): DebugLog[] => {
    if (isBrowser) {
      try {
        return JSON.parse(localStorage.getItem('debug_logs') || '[]');
      } catch (e) {
        return [];
      }
    }
    return [];
  },
  // Clear logs (client-side only)
  clearLogs: () => {
    if (isBrowser) {
      localStorage.removeItem('debug_logs');
      const overlay = document.getElementById('debug-overlay');
      if (overlay) {
        overlay.innerHTML = '';
      }
    }
  },
  // Show logs in UI (client-side only)
  showLogs: () => {
    if (isBrowser) {
      const logs = debug.getLogs();
      const overlay = document.getElementById('debug-overlay');
      if (overlay) {
        overlay.innerHTML = logs.map((log: DebugLog) => `
          <div style="border-bottom: 1px solid rgba(255,255,255,0.2); padding: 5px 0;">
            <div style="color: ${log.type === 'ERROR' ? '#ff6b6b' : log.type === 'WARN' ? '#ffd93d' : '#4cd137'}">
              [${log.type}] ${new Date(log.timestamp).toLocaleTimeString()}
            </div>
            <div>${log.args}</div>
          </div>
        `).join('');
      }
    }
  }
}; 