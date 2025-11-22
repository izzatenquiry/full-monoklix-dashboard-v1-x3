import { addLogEntry } from './aiLogService';
import { type User } from '../types';
import { supabase } from './supabaseClient';

export const getVeoProxyUrl = (): string => {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3001';
  }
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      return userSelectedProxy;
  }
  const fallbackUrl = 'https://veox.monoklix.com';
  return fallbackUrl;
};

export const getImagenProxyUrl = (): string => {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3001';
  }
  const userSelectedProxy = sessionStorage.getItem('selectedProxyServer');
  if (userSelectedProxy) {
      return userSelectedProxy;
  }
  const fallbackUrl = 'https://gemx.monoklix.com';
  return fallbackUrl;
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

// Helper to get tokens from the shared pool without importing userService (to avoid circular dependency)
const getSharedTokensFromSession = (): { token: string; createdAt: string }[] => {
    try {
        const tokensJSON = sessionStorage.getItem('veoAuthTokens');
        if (tokensJSON) {
            const parsed = JSON.parse(tokensJSON);
            if (Array.isArray(parsed)) {
                // Sort by createdAt descending (newest first) to prioritize fresh tokens
                // Note: createdAt is expected to be an ISO string
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

interface TokenCandidate {
    token: string;
    source: 'Specific' | 'Pool' | 'Personal';
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
  
  // Determine if this is a strict health check or a robust generation request
  const isHealthCheck = logContext.includes('HEALTH CHECK');

  // 1. Acquire Server Slot (Rate Limiting at Server Level)
  // Skip slot acquisition for simple health checks to avoid clogging the queue with tests
  const isGenerationRequest = logContext.includes('GENERATE') || logContext.includes('RECIPE');
  
  if (isGenerationRequest) {
    if (onStatusUpdate) onStatusUpdate('All slots are in use. You are in the queue...');
    
    const serverUrl = serviceType === 'veo' ? getVeoProxyUrl() : getImagenProxyUrl();

    let slotAcquired = false;
    // Try up to 3 times to get a slot to avoid infinite hangs
    for (let i = 0; i < 3; i++) {
        const { data: acquired, error } = await supabase.rpc('request_generation_slot', { 
            cooldown_seconds: 10,
            server_url: serverUrl
        });

        if (error) {
            console.error('Error requesting generation slot:', error);
            // Continue anyway, don't block user for DB stats error
            slotAcquired = true; 
            break;
        }
        if (acquired) {
            slotAcquired = true;
            break;
        } else {
            if (onStatusUpdate) onStatusUpdate(`Queue position ${i+1}... waiting...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    if (onStatusUpdate) onStatusUpdate('Processing...');
  }
  
  // 2. Prepare Token Candidates List
  let candidates: TokenCandidate[] = [];
  const usedTokens = new Set<string>();

  // Priority 1: Specific Token (e.g. from Upload step or Health Check)
  if (specificToken) {
      candidates.push({ token: specificToken, source: 'Specific' });
      usedTokens.add(specificToken);
  }

  // Priority 2: Shared Pool & Personal Token (Failover)
  // CRITICAL LOGIC: We ONLY add backup tokens if this is NOT a health check.
  // If it IS a health check, we want to fail accurately if the specific token is bad.
  if (!isHealthCheck) {
      const allSharedTokens = getSharedTokensFromSession();
      
      if (allSharedTokens.length > 0) {
          // Step 1: Take only the top 10 NEWEST tokens (Pool Freshness)
          const freshPool = allSharedTokens.slice(0, 10);
          
          // Step 2: Randomize selection from this fresh pool (Load Balancing)
          const shuffledFreshPool = [...freshPool].sort(() => 0.5 - Math.random());
          
          // Step 3: Take top 5 random ones for this specific request
          const selectedCandidates = shuffledFreshPool.slice(0, 5);
          
          selectedCandidates.forEach(t => {
              if (!usedTokens.has(t.token)) {
                  candidates.push({ token: t.token, source: 'Pool' });
                  usedTokens.add(t.token);
              }
          });
      }

      const personal = getPersonalToken();
      if (personal && !usedTokens.has(personal.token)) {
          candidates.push({ token: personal.token, source: 'Personal' });
      }
  }

  if (candidates.length === 0) {
      throw new Error(`No authentication tokens available. Please refresh the page or contact admin.`);
  }

  const currentUser = getCurrentUserInternal();
  let lastError: any = new Error("Unknown error");

  // 3. Execute Retry Loop
  for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const isLastAttempt = i === candidates.length - 1;
      
      try {
          const baseUrl = serviceType === 'veo' ? getVeoProxyUrl() : getImagenProxyUrl();
          const endpoint = `${baseUrl}/api/${serviceType}${relativePath}`;
          
          if (onStatusUpdate) {
              console.log(`[API Client] Attempt ${i + 1}/${candidates.length} using ${candidate.source} token (...${candidate.token.slice(-6)})`);
          }

          const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${candidate.token}`,
                  'x-user-username': currentUser?.username || 'unknown',
              },
              body: JSON.stringify(requestBody),
          });

          // Handle JSON parsing separately to catch non-JSON proxy errors
          let data;
          const textResponse = await response.text();
          try {
              data = JSON.parse(textResponse);
          } catch {
              data = { error: { message: `Proxy returned non-JSON (${response.status}): ${textResponse.substring(0, 100)}` } };
          }

          if (!response.ok) {
              const status = response.status;
              const errorMessage = data.error?.message || data.message || `API call failed (${status})`;

              // CRITICAL: If it's a 400 error (Bad Request), it's likely a prompt issue (Safety Filter).
              // Retrying with a different token WON'T fix this. Fail immediately to tell user.
              if (status === 400) {
                  console.warn(`[API Client] 400 Bad Request (likely Safety). Not retrying.`);
                  throw new Error(errorMessage);
              }

              console.warn(`[API Client] Attempt ${i + 1} failed (${status}): ${errorMessage}`);
              
              if (isLastAttempt) {
                  throw new Error(errorMessage); // No more tokens, throw the error up
              }
              
              // Continue to next loop iteration (Silent Retry)
              continue;
          }

          // Success!
          console.log(`✅ [API Client] Success with ${candidate.source} token.`);
          return { data, successfulToken: candidate.token };

      } catch (error) {
          lastError = error;
          
          // If it was a Safety Error (400) explicitly thrown above, stop retrying.
          if (error instanceof Error && (error.message.includes('400') || error.message.toLowerCase().includes('safety'))) {
              throw error;
          }

          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Network errors (fetch failed) - Try next token/server logic
          if (isLastAttempt) {
              console.error(`❌ [API Client] All ${candidates.length} attempts failed.`);
              
              // Only log generic errors to history if it's NOT a health check (avoid spam)
              if (!isHealthCheck) {
                  addLogEntry({ 
                      model: logContext, 
                      prompt: `Request failed after ${candidates.length} attempts`, 
                      output: errorMessage, 
                      tokenCount: 0, 
                      status: 'Error', 
                      error: errorMessage 
                  });
              }
              throw lastError;
          } else {
              console.warn(`[API Client] Exception on attempt ${i + 1}: ${errorMessage}. Retrying...`);
          }
      }
  }

  throw lastError;
};