import { addLogEntry } from './aiLogService';
import { type User } from '../types';
import { supabase } from './supabaseClient';

// Default fallback servers if session is empty
const FALLBACK_SERVERS = [
    'https://s1.monoklix.com', 'https://s2.monoklix.com', 'https://s3.monoklix.com',
    'https://s4.monoklix.com', 'https://s5.monoklix.com', 'https://s6.monoklix.com',
    'https://s7.monoklix.com', 'https://s8.monoklix.com', 'https://s9.monoklix.com',
    'https://s10.monoklix.com'
];

export const getVeoProxyUrl = (): string => {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3001';
  }
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      return userSelectedProxy;
  }
  // Default if nothing selected
  return 'https://veox.monoklix.com';
};

export const getImagenProxyUrl = (): string => {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3001';
  }
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      return userSelectedProxy;
  }
  return 'https://gemx.monoklix.com';
};

const getPersonalToken = (): { token: string; createdAt: string; } | null => {
    try {
        const userJson = localStorage.getItem('currentUser');
        if (userJson) {
            const user = JSON.parse(userJson);
            if (user && user.personalAuthToken) {
                return { token: user.personalAuthToken, createdAt: 'personal' };
            }
        }
    } catch (e) {
        console.error("Could not parse user from localStorage to get personal token", e);
    }
    return null;
};

// Helper to get tokens from the shared pool
const getSharedTokensFromSession = (): { token: string; createdAt: string }[] => {
    try {
        const tokensJSON = sessionStorage.getItem('veoAuthTokens');
        if (tokensJSON) {
            const parsed = JSON.parse(tokensJSON);
            if (Array.isArray(parsed)) {
                // Sort by newest first
                return parsed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            }
        }
    } catch (e) {
        console.warn("Failed to parse shared tokens from session:", e);
    }
    return [];
};

const getCurrentUserInternal = (): User | null => {
    try {
        const savedUserJson = localStorage.getItem('currentUser');
        if (savedUserJson) {
            const user = JSON.parse(savedUserJson) as User;
            if (user && user.id) {
                return user;
            }
        }
    } catch (error) {
        console.error("Failed to parse user from localStorage for activity log.", error);
    }
    return null;
};

// --- EXECUTE REQUEST WITH ROBUST FAILOVER ---

interface RequestAttempt {
    token: string;
    serverUrl: string;
    source: 'Specific' | 'Personal' | 'Pool';
}

export const executeProxiedRequest = async (
  relativePath: string,
  serviceType: 'veo' | 'imagen',
  requestBody: any,
  logContext: string,
  specificToken?: string,
  onStatusUpdate?: (status: string) => void
): Promise<{ data: any; successfulToken: string }> => {
  console.log(`[API Client] Starting process for: ${logContext}`);
  
  // 1. Acquire Server Slot (Rate Limiting at Server Level)
  const isGenerationRequest = logContext.includes('GENERATE') || logContext.includes('RECIPE');
  const currentServerUrl = serviceType === 'veo' ? getVeoProxyUrl() : getImagenProxyUrl();

  if (isGenerationRequest) {
    if (onStatusUpdate) onStatusUpdate('Queueing...');
    
    // Simple slot check - we don't want to block robust failover logic too much
    // so we just try to acquire once on the primary server.
    await supabase.rpc('request_generation_slot', { 
        cooldown_seconds: 10,
        server_url: currentServerUrl
    });
    
    if (onStatusUpdate) onStatusUpdate('Processing...');
  }
  
  // 2. Build Attempt Strategy List
  let attempts: RequestAttempt[] = [];

  if (specificToken) {
      // SCENARIO A: Specific Token (e.g. Health Check, Master Dashboard, or continuing a flow)
      // Strict mode: Only try exactly what was requested. No failover.
      attempts.push({ token: specificToken, serverUrl: currentServerUrl, source: 'Specific' });
  } else {
      // SCENARIO B: Robust User Generation (The "Bulletproof" Logic)
      
      const personal = getPersonalToken();
      const poolTokens = getSharedTokensFromSession();
      // Pick top 5 newest tokens for pool attempts
      const activePool = poolTokens.slice(0, 5); 

      // --- PHASE 1: Try on Current Server ---
      
      // 1.1 Personal Token (Priority)
      if (personal) {
          attempts.push({ token: personal.token, serverUrl: currentServerUrl, source: 'Personal' });
      }

      // 1.2 Shared Pool (Hybrid Fallback)
      // Shuffle the top 5 to distribute load
      const shuffledPool = [...activePool].sort(() => 0.5 - Math.random());
      shuffledPool.forEach(t => {
          // Don't add if same as personal
          if (personal?.token !== t.token) {
              attempts.push({ token: t.token, serverUrl: currentServerUrl, source: 'Pool' });
          }
      });

      // --- PHASE 2: Try on Backup Server (If Phase 1 fails due to IP/Server issues) ---
      // Pick a random server that is NOT the current one
      const otherServers = FALLBACK_SERVERS.filter(s => !currentServerUrl.includes(s));
      if (otherServers.length > 0) {
          const backupServer = otherServers[Math.floor(Math.random() * otherServers.length)];
          
          // 2.1 Retry Personal on Backup Server
          if (personal) {
              attempts.push({ token: personal.token, serverUrl: backupServer, source: 'Personal' });
          }
          
          // 2.2 Retry Pool on Backup Server (Pick just 2 random ones to save time)
          shuffledPool.slice(0, 2).forEach(t => {
               if (personal?.token !== t.token) {
                  attempts.push({ token: t.token, serverUrl: backupServer, source: 'Pool' });
               }
          });
      }
  }

  if (attempts.length === 0) {
      throw new Error(`No authentication tokens found. Please claim a token in Settings.`);
  }

  const currentUser = getCurrentUserInternal();
  let lastError: any = new Error("Unknown error");

  // 3. Execute the Strategy Loop
  for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      const isLastAttempt = i === attempts.length - 1;
      
      try {
          // Construct endpoint based on the specific server in this attempt
          const endpoint = `${attempt.serverUrl}/api/${serviceType}${relativePath}`;
          
          if (onStatusUpdate) {
             // User-friendly status update
             if (attempt.source === 'Personal') onStatusUpdate('Trying Personal Key...');
             else if (attempt.source === 'Pool') onStatusUpdate('Optimizing connection...'); // "Smart Hybrid" disguise
          }

          console.log(`[API Client] Attempt ${i + 1}/${attempts.length} | ${attempt.source} Token | Server: ${attempt.serverUrl}`);

          const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${attempt.token}`,
                  'x-user-username': currentUser?.username || 'unknown',
              },
              body: JSON.stringify(requestBody),
          });

          let data;
          const textResponse = await response.text();
          try {
              data = JSON.parse(textResponse);
          } catch {
              data = { error: { message: `Proxy returned non-JSON (${response.status})` } };
          }

          if (!response.ok) {
              const status = response.status;
              const errorMessage = data.error?.message || data.message || `API call failed (${status})`;
              const lowerMsg = errorMessage.toLowerCase();

              // CRITICAL STOP CONDITIONS (Don't Retry)
              // 1. 400 Bad Request (Safety Filters, Invalid Prompts)
              if (status === 400 || lowerMsg.includes('safety') || lowerMsg.includes('blocked')) {
                  console.warn(`[API Client] 🛑 Non-retriable error (${status}). Prompt issue.`);
                  throw new Error(errorMessage);
              }

              // RETRY CONDITIONS
              // 429 (Quota), 401 (Expired Token), 5xx (Server Error), Fetch Error
              console.warn(`[API Client] ⚠️ Attempt ${i + 1} failed (${status}). trying next...`);
              
              if (isLastAttempt) {
                  throw new Error(errorMessage);
              }
              continue; // Try next strategy
          }

          // SUCCESS
          console.log(`✅ [API Client] Success using ${attempt.source} token on ${attempt.serverUrl}`);
          
          // If we successfully used a backup server, maybe we should silently update the user's preference?
          // For now, let's just return the success.
          return { data, successfulToken: attempt.token };

      } catch (error) {
          lastError = error;
          
          // Re-throw safety/400 errors immediately
          const errMsg = error instanceof Error ? error.message : String(error);
          if (errMsg.includes('400') || errMsg.toLowerCase().includes('safety')) {
              throw error;
          }

          if (isLastAttempt) {
              console.error(`❌ [API Client] All ${attempts.length} attempts exhausted.`);
              
              // Only log to history if it's a real user generation attempt
              if (!specificToken) {
                  addLogEntry({ 
                      model: logContext, 
                      prompt: `Failed after ${attempts.length} attempts`, 
                      output: errMsg, 
                      tokenCount: 0, 
                      status: 'Error', 
                      error: errMsg 
                  });
              }
              throw lastError;
          }
      }
  }

  throw lastError;
};