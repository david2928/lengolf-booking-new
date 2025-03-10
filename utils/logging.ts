import { createServerClient } from './supabase/server';
import { v4 as uuidv4 } from 'uuid';

// Store a unique identifier for each request
const requestIdStorage = {
  id: '',
  generateNewId: () => {
    requestIdStorage.id = uuidv4();
    return requestIdStorage.id;
  },
  getId: () => requestIdStorage.id || requestIdStorage.generateNewId()
};

/**
 * Log a message to the Supabase CRM matching logs table
 * 
 * @param message Message to log
 * @param context Additional context data (will be stored as JSON)
 * @param options Additional logging options
 */
export async function logToCrm(
  message: string, 
  context: any = {}, 
  options: {
    level?: 'info' | 'warn' | 'error' | 'debug',
    profileId?: string,
    stableHashId?: string,
    crmCustomerId?: string | number,
    source?: string,
    requestId?: string
  } = {}
) {
  try {
    const {
      level = 'info',
      profileId = null,
      stableHashId = null,
      crmCustomerId = null,
      source = 'api',
      requestId = requestIdStorage.getId()
    } = options;
    
    const supabase = createServerClient();
    
    const { error } = await supabase
      .from('crm_matching_logs')
      .insert({
        level,
        message,
        context: typeof context === 'object' ? context : { data: context },
        request_id: requestId,
        profile_id: profileId?.toString(),
        stable_hash_id: stableHashId?.toString(),
        crm_customer_id: crmCustomerId?.toString(),
        source
      });
      
    if (error) {
      console.error('Error writing to CRM matching logs:', error);
    }
    
    // Also log to console for immediate visibility
    const consoleMsg = `[${level.toUpperCase()}][CRM][${source}] ${message}`;
    switch (level) {
      case 'error':
        console.error(consoleMsg, context);
        break;
      case 'warn':
        console.warn(consoleMsg, context);
        break;
      case 'debug':
        console.debug(consoleMsg, context);
        break;
      case 'info':
      default:
        console.log(consoleMsg, context);
    }
    
  } catch (error) {
    // Fallback to console if the DB logging fails
    console.error('Failed to log to CRM matching logs table:', error);
    console.log(`[FALLBACK LOG] ${message}`, context);
  }
}

// Convenience methods
export const crmLogger = {
  info: (message: string, context: any = {}, options = {}) => 
    logToCrm(message, context, { ...options, level: 'info' }),
    
  warn: (message: string, context: any = {}, options = {}) => 
    logToCrm(message, context, { ...options, level: 'warn' }),
    
  error: (message: string, context: any = {}, options = {}) => 
    logToCrm(message, context, { ...options, level: 'error' }),
    
  debug: (message: string, context: any = {}, options = {}) => 
    logToCrm(message, context, { ...options, level: 'debug' }),
    
  // Generate a new request ID
  newRequest: () => requestIdStorage.generateNewId()
}; 