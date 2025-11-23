import React, { useState, useEffect, useCallback, useRef } from 'react';
// FIX: Explicitly import UserStatus as a type to prevent runtime import errors if it's only a type definition.
import { type View, type User, type BatchProcessorPreset, type Language, type UserStatus } from './types';
import Sidebar from './components/Sidebar';
import AiTextSuiteView from './components/views/AiTextSuiteView';
import AiImageSuiteView from './components/views/AiImageSuiteView';
import AiVideoSuiteView from './components/views/AiVideoSuiteView';
import ECourseView from './components/views/ECourseView';
import SettingsView from './components/views/SettingsView';
import LoginPage from './LoginPage';
import GalleryView from './components/views/GalleryView';
import WelcomeAnimation from './components/WelcomeAnimation';
import LibraryView from './components/views/LibraryView';
import { MenuIcon, LogoIcon, XIcon, SunIcon, MoonIcon, CheckCircleIcon, AlertTriangleIcon, PartyPopperIcon, RefreshCwIcon, UsersIcon, ServerIcon, ShieldCheckIcon, TerminalIcon, SparklesIcon, ChevronRightIcon, AppleIcon } from './components/Icons';
// FIX: Moved getAvailableServersForUser to userService.ts to fix circular dependency and added it to imports here.
import { signOutUser, logActivity, getVeoAuthTokens, getSharedMasterApiKey, updateUserLastSeen, assignPersonalTokenAndIncrementUsage, saveUserPersonalAuthToken, getServerUsageCounts, updateUserProxyServer, updateTokenStatusToExpired, getAvailableServersForUser } from './services/userService';
import { createChatSession, streamChatResponse } from './services/geminiService';
import Spinner from './components/common/Spinner';
import { loadData, saveData } from './services/indexedDBService';
import { type Chat } from '@google/genai';
import { getSupportPrompt } from './services/promptManager';
import { triggerUserWebhook } from './services/webhookService';
// FIX: Changed to a named import to resolve the "no default export" error.
import { GetStartedView } from './components/views/GetStartedView';
import AiPromptLibrarySuiteView from './components/views/AiPromptLibrarySuiteView';
import eventBus from './services/eventBus';
import ApiKeyStatus from './components/ApiKeyStatus';
import { clearLogs } from './services/aiLogService';
import { clearVideoCache } from './services/videoCacheService';
import localforage from 'localforage';
import { supabase, type Database } from './services/supabaseClient';
import { handleApiError } from './services/errorHandler';
import { runComprehensiveTokenTest } from './services/imagenV3Service';
import ConsoleLogSidebar from './components/ConsoleLogSidebar';
import { getTranslations } from './services/translations';
import { getProxyServers } from './services/contentService';
import ApiGeneratorView from './components/views/ApiGeneratorView';
import MasterDashboardView from './components/views/MasterDashboardView';
import UgcGenView from './components/views/UgcGenView';


interface VideoGenPreset {
  prompt: string;
  image: { base64: string; mimeType: string; };
}

interface ImageEditPreset {
  base64: string;
  mimeType: string;
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

const ThemeSwitcher: React.FC<{ theme: string; setTheme: (theme: string) => void }> = ({ theme, setTheme }) => {
    // FIX: Correctly access translations via `common` key.
    const T = getTranslations().common;
    return (
    <button
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        aria-label={T.switchTheme}
    >
        {theme === 'light' ? (
            <MoonIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
        ) : (
            <SunIcon className="w-5 h-5 text-yellow-500" />
        )}
    </button>
)};

const NotificationBanner: React.FC<{ message: string; onDismiss: () => void }> = ({ message, onDismiss }) => {
    // FIX: Correctly access translations via `common` key.
    const T = getTranslations().common;
    return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 w-full max-w-md z-50 p-4">
        <div className="bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-200 p-4 rounded-r-lg shadow-lg flex items-start gap-3 animate-zoomIn">
            <AlertTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
                <p className="font-bold">{T.attention}</p>
                <p className="text-sm">{message}</p>
            </div>
            <button onClick={onDismiss} className="p-1 rounded-full hover:bg-yellow-200 dark:hover:bg-yellow-800">
                <XIcon className="w-4 h-4" />
            </button>
        </div>
    </div>
)};

// Removed AssigningTokenModal component as per request to disable auto-assignment popup

interface ServerSelectionModalProps {
  isOpen: boolean;
  servers: string[];
  serverUsage: Record<string, number>;
  onSelect: (serverUrl: string) => void;
  onClose: () => void;
}

const ServerSelectionModal: React.FC<ServerSelectionModalProps> = ({ isOpen, servers, serverUsage, onSelect, onClose }) => {
    const T = getTranslations().serverSelectionModal;

    const getUsageColor = (count: number) => {
        if (count < 10) return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
        if (count < 20) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
        return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
    };

    const handleAutoSelect = () => {
        if (servers.length === 0) return;

        // Find the server with the minimum usage
        const leastBusyServer = servers.reduce((leastBusy, currentServer) => {
            const leastBusyUsage = serverUsage[leastBusy] || 0;
            const currentUsage = serverUsage[currentServer] || 0;
            return currentUsage < leastBusyUsage ? currentServer : leastBusy;
        }, servers[0]);

        onSelect(leastBusyServer);
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-zoomIn" onClick={onClose}>
            <div className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl p-6 relative border border-neutral-200 dark:border-neutral-800 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <button 
                    onClick={onClose} 
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition-colors"
                >
                    <XIcon className="w-5 h-5" />
                </button>

                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold mb-2">{T.title}</h1>
                    <p className="text-neutral-500 dark:text-neutral-400 text-sm">{T.subtitle}</p>
                </div>

                 {/* Auto Select Button (Prominent) */}
                 <button
                    onClick={handleAutoSelect}
                    className="w-full flex items-center justify-center gap-3 p-4 mb-6 bg-gradient-to-r from-primary-600 to-blue-600 text-white rounded-xl shadow-lg hover:shadow-primary-500/25 hover:scale-[1.01] transition-all group"
                >
                    <SparklesIcon className="w-6 h-6" />
                    <div className="text-left">
                        <p className="font-bold text-base">Auto-Connect Best Server</p>
                        <p className="text-xs opacity-80 font-normal">Automatically picks the fastest server.</p>
                    </div>
                </button>

                <div className="border-b border-neutral-200 dark:border-neutral-800 mb-4 shrink-0"></div>
                <h3 className="text-sm font-bold text-neutral-600 dark:text-neutral-400 mb-3 shrink-0 px-1">Manual Selection ({servers.length})</h3>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 min-h-0">
                    {servers.map(serverUrl => {
                        const usage = serverUsage[serverUrl] || 0;
                        const serverName = serverUrl.replace('https://', '').replace('.monoklix.com', '');
                        const isAppleFriendly = serverName === 's1' || serverName === 's6';
                        const currentServer = sessionStorage.getItem('selectedProxyServer');
                        const isSelected = currentServer === serverUrl;

                        return (
                            <button
                                key={serverUrl}
                                onClick={() => onSelect(serverUrl)}
                                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all group text-left ${isSelected ? 'bg-primary-50 dark:bg-primary-900/10 border-primary-500 ring-1 ring-primary-500' : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-primary-400 dark:hover:border-primary-500'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary-100 text-primary-600' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500'}`}>
                                        <ServerIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-sm capitalize">{T.server} {serverName.toUpperCase()}</p>
                                            {isAppleFriendly && <AppleIcon className="w-3 h-3 text-neutral-400" title="Apple Optimized" />}
                                        </div>
                                        <p className="text-[10px] text-neutral-500 font-mono">{serverUrl.replace('https://', '')}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold ${getUsageColor(usage)}`}>
                                        <UsersIcon className="w-3 h-3" />
                                        <span>{usage}</span>
                                    </div>
                                    {isSelected && <CheckCircleIcon className="w-5 h-5 text-primary-600" />}
                                    {!isSelected && <ChevronRightIcon className="w-5 h-5 text-neutral-300 group-hover:text-neutral-500" />}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeApiKey, setActiveApiKey] = useState<string | null>(null);
  const [isApiKeyLoading, setIsApiKeyLoading] = useState(true);
  const [activeView, setActiveView] = useState<View>('home');
  const [theme, setTheme] = useState('light'); // Default to light, load async
  // FIX: Add language state management
  const [language, setLanguage] = useState<Language>('en');
  const [videoGenPreset, setVideoGenPreset] = useState<VideoGenPreset | null>(null);
  const [imageToReEdit, setImageToReEdit] = useState<ImageEditPreset | null>(null);
  const [imageGenPresetPrompt, setImageGenPresetPrompt] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLogSidebarOpen, setIsLogSidebarOpen] = useState(false);
  const [isShowingWelcome, setIsShowingWelcome] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  // Removed needsTokenAssignment as we no longer force the modal
  const [veoTokenRefreshedAt, setVeoTokenRefreshedAt] = useState<string | null>(null);
  
  // State for manual token assignment (used by ApiKeyStatus)
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const isAssigningTokenRef = useRef(false);
  
  const [needsSilentTokenAssignment, setNeedsSilentTokenAssignment] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverOptions, setServerOptions] = useState<{ servers: string[], usage: Record<string, number> }>({ servers: [], usage: {} });
  const [serverModalPurpose, setServerModalPurpose] = useState<'login' | 'change'>('login');
  const [notification, setNotification] = useState<string | null>(null);
  
  // FIX: Correctly access translations via `app` key.
  const T = getTranslations().app;

  const handleUserUpdate = useCallback((updatedUser: User) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
  }, []);

  const handleLogout = useCallback(async () => {
    if (currentUser) {
      // Clear the proxy server selection from the database on manual logout.
      // This is a fire-and-forget call; we don't need to wait for it.
      updateUserProxyServer(currentUser.id, null);
    }
    await signOutUser();
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('monoklix_session_api_key'); // Clean up session key
    sessionStorage.removeItem('session_started_at'); // Clean up session start time
    sessionStorage.removeItem('selectedProxyServer'); // Clean up proxy selection
    setCurrentUser(null);
    setActiveApiKey(null);
    setActiveView('home');
  }, [currentUser]);

  const handleClearCacheAndRefresh = () => {
    if (window.confirm(T.clearCacheConfirm)) {
        try {
            console.log("Clearing session and refreshing app...");

            // 1. Clear session-level storage to force re-authentication of keys.
            sessionStorage.clear();

            // 2. Clear local storage to log the user out and reset app state.
            localStorage.clear();
            
            // 3. Reload the page. This forces a fresh start.
            window.location.reload();

        } catch (error) {
            console.error("Failed to refresh session:", error);
            alert(T.clearCacheError);
        }
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
        const savedTheme = await loadData<string>('theme');
        if (savedTheme) setTheme(savedTheme);
        // FIX: Load language from storage
        const savedLang = await loadData<Language>('language');
        if (savedLang) setLanguage(savedLang);
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveData('theme', theme);
  }, [theme]);
  
  // FIX: Add effect to save language changes
  useEffect(() => {
    saveData('language', language);
  }, [language]);
  
  // Effect to listen for events that require user updates
  useEffect(() => {
    const handleUserUsageUpdate = (updatedUser: User) => {
      console.log('App: User usage stats updated via event bus. Refreshing state.');
      handleUserUpdate(updatedUser);
    };

    eventBus.on('userUsageUpdated', handleUserUsageUpdate);

    return () => {
      eventBus.remove('userUsageUpdated', handleUserUsageUpdate);
    };
  }, [handleUserUpdate]);
  
  // Effect to check for an active session in localStorage on initial load.
  useEffect(() => {
    try {
        const savedUserJson = localStorage.getItem('currentUser');
        if (savedUserJson) {
            const user = JSON.parse(savedUserJson);
            setCurrentUser(user);
            sessionStorage.setItem('session_started_at', new Date().toISOString());
        }
    } catch (error) {
        console.error("Failed to parse user from localStorage", error);
        localStorage.removeItem('currentUser');
    }
    setSessionChecked(true);
  }, []);

  // Logic to assign token, kept for manual claiming via ApiKeyStatus component
  const assignTokenProcess = useCallback(async (): Promise<{ success: boolean; error: string | null; }> => {
        if (!currentUser || isAssigningTokenRef.current) {
            return { success: false, error: "Process is already running or user is not available." };
        }
        
        isAssigningTokenRef.current = true;
        
        console.log('Starting auto-assignment process...');

        const tokensJSON = sessionStorage.getItem('veoAuthTokens');
        if (!tokensJSON) {
            // Updated error message to be more user-friendly and actionable
            const errorMsg = "Connection setup incomplete. Please click 'Try Again' to update your access token.";
            isAssigningTokenRef.current = false;
            return { success: false, error: errorMsg };
        }
        
        let tokenAssigned = false;
        let finalError: string | null = "All connection slots are currently full. Please try again in a moment or contact the admin.";

        try {
            const sharedTokens: { token: string; createdAt: string }[] = JSON.parse(tokensJSON);
            setScanProgress({ current: 0, total: sharedTokens.length });
            
            // Randomize for load distribution
            for (let i = sharedTokens.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [sharedTokens[i], sharedTokens[j]] = [sharedTokens[j], sharedTokens[i]];
            }

            for (const [index, tokenData] of sharedTokens.entries()) {
                setScanProgress({ current: index + 1, total: sharedTokens.length });
                console.log(`[Auto-Assign] Testing shared token... ${tokenData.token.slice(-6)}`);
                const results = await runComprehensiveTokenTest(tokenData.token);
                const isImagenOk = results.find(r => r.service === 'Imagen')?.success;
                const isVeoOk = results.find(r => r.service === 'Veo')?.success;

                if (isImagenOk && isVeoOk) {
                    console.log(`[Auto-Assign] Found valid token: ...${tokenData.token.slice(-6)}. Assigning to user.`);
                    const assignResult = await assignPersonalTokenAndIncrementUsage(currentUser.id, tokenData.token);

                    if (assignResult.success === false) {
                        console.warn(`[Auto-Assign] Could not assign token ...${tokenData.token.slice(-6)}: ${assignResult.message}. Trying next.`);
                        if (assignResult.message === 'DB_SCHEMA_MISSING_COLUMN_personal_auth_token' && currentUser.role === 'admin') {
                            finalError = "Database schema is outdated.";
                            alert("Database schema is outdated.\n\nPlease go to your Supabase dashboard and run the following SQL command to add the required column:\n\nALTER TABLE public.users ADD COLUMN personal_auth_token TEXT;");
                            break;
                        }
                    } else {
                        handleUserUpdate(assignResult.user);
                        console.log('[Auto-Assign] Successfully assigned personal token.');
                        tokenAssigned = true;
                        finalError = null;
                        break;
                    }
                } else {
                    console.warn(`[Auto-Assign] Token ...${tokenData.token.slice(-6)} failed health check. Skipping token.`);
                    // The functionality to mark tokens as expired is currently disabled per user request.
                    // updateTokenStatusToExpired(tokenData.token);
                }
            }

            if (!tokenAssigned) {
                console.log('[Auto-Assign] No valid shared tokens found after testing all available ones.');
            }

        } catch (error) {
            console.error('[Auto-Assign] An error occurred during the token assignment process:', error);
            finalError = "An unexpected error occurred during assignment. Please try again.";
        } finally {
            isAssigningTokenRef.current = false;
        }
        
        return { success: tokenAssigned, error: finalError };
    }, [currentUser, handleUserUpdate]);

    // Effect for handling personal token failure with automatic fallback
    const handlePersonalTokenFailure = useCallback(async () => {
        if (isAssigningTokenRef.current || !currentUser || !currentUser.personalAuthToken) {
            return;
        }

        console.warn('[Token Fallback] Personal token failed. Initiating silent auto-fallback process.');

        const clearResult = await saveUserPersonalAuthToken(currentUser.id, null);
        
        // FIX: Inverted the if/else block to check for the failure case first.
        // This explicitly narrows the type for the 'else' branch, resolving the type error where `clearResult.message` was not accessible.
        if (clearResult.success === false) {
            console.error("[Token Fallback] Failed to clear the invalid token.", clearResult.message);
        } else {
            handleUserUpdate(clearResult.user);
            // This will trigger the silent assignment effect after re-render
            setNeedsSilentTokenAssignment(true);
        }
    }, [currentUser, handleUserUpdate]);

    // Effect to handle silent, background token assignment on failure.
    useEffect(() => {
        if (!needsSilentTokenAssignment || !currentUser) return;
        
        const runSilentAssignment = async () => {
            console.log('[Token Fallback] Running silent token assignment process in background.');
            const result = await assignTokenProcess();
            if (result.success) {
                console.log('[Token Fallback] Silently assigned new token successfully.');
            } else {
                console.error('[Token Fallback] Silent token assignment failed:', result.error);
            }
            setNeedsSilentTokenAssignment(false); // Reset trigger
        }
        
        runSilentAssignment();

    }, [needsSilentTokenAssignment, currentUser, assignTokenProcess]);


    useEffect(() => {
        eventBus.on('personalTokenFailed', handlePersonalTokenFailure);
        return () => {
            eventBus.remove('personalTokenFailed', handlePersonalTokenFailure);
        };
    }, [handlePersonalTokenFailure]);

  const initializeSessionData = useCallback(async (userId: string) => {
    if (!userId) return;
    
    setIsApiKeyLoading(true);
    try {
      // Fetch master key and VEO tokens in parallel for efficiency
      const [masterKey, tokensData] = await Promise.all([
        getSharedMasterApiKey(),
        getVeoAuthTokens(),
      ]);

      // Handle Master API Key
      if (masterKey) {
        sessionStorage.setItem('monoklix_session_api_key', masterKey);
        setActiveApiKey(masterKey);
        console.log(`[Session] Shared master API key (...${masterKey.slice(-4)}) loaded.`);
      } else {
        console.error("CRITICAL: Could not fetch master API key from Supabase.");
        setActiveApiKey(null);
      }

      // Handle VEO Auth Tokens
      if (tokensData && tokensData.length > 0) {
        sessionStorage.setItem('veoAuthTokens', JSON.stringify(tokensData));
        sessionStorage.setItem('veoAuthToken', tokensData[0].token);
        sessionStorage.setItem('veoAuthTokenCreatedAt', tokensData[0].createdAt);
        setVeoTokenRefreshedAt(new Date().toISOString());
        console.log(`[Session] ${tokensData.length} VEO Auth Tokens loaded.`);
      } else {
        sessionStorage.removeItem('veoAuthTokens');
        sessionStorage.removeItem('veoAuthToken');
        sessionStorage.removeItem('veoAuthTokenCreatedAt');
        console.warn("[Session] Could not fetch any VEO Auth Tokens from Supabase.");
      }
    } catch (error) {
      console.error("[Session] Error initializing session data (API key & VEO tokens):", error);
      setActiveApiKey(null); // Ensure we're in a clean error state
    } finally {
      setIsApiKeyLoading(false);
    }
  }, []);

  // Effect to fetch session data (API keys, tokens) on app load/refresh if user exists.
  useEffect(() => {
    if (currentUser?.id) {
      initializeSessionData(currentUser.id);
    } else {
      // Clear all session-specific data on logout or if no user
      setActiveApiKey(null);
      sessionStorage.removeItem('monoklix_session_api_key');
      sessionStorage.removeItem('veoAuthTokens');
      sessionStorage.removeItem('veoAuthToken');
      sessionStorage.removeItem('veoAuthTokenCreatedAt');
      setIsApiKeyLoading(false);
    }
  }, [currentUser?.id, initializeSessionData]);


  useEffect(() => {
    if (justLoggedIn) {
        setIsShowingWelcome(true);
        setJustLoggedIn(false); // Reset the flag
    }
  }, [justLoggedIn]);
  
   // Effect for user heartbeat (active status)
    useEffect(() => {
        if (currentUser?.id) {
            // Initial update on login
            updateUserLastSeen(currentUser.id);

            const heartbeatInterval = setInterval(() => {
                updateUserLastSeen(currentUser!.id);
            }, 30000); // Send a heartbeat every 30 seconds

            return () => clearInterval(heartbeatInterval);
        }
    }, [currentUser?.id]);

    // Effect for real-time remote logout listener
    useEffect(() => {
        if (!currentUser?.id) return;

        const channel = supabase
            .channel(`user-session-channel-${currentUser.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'users',
                    filter: `id=eq.${currentUser.id}`,
                },
                (payload) => {
                    const newUserData = payload.new as Database['public']['Tables']['users']['Row'];
                    const forceLogoutAt = newUserData.force_logout_at;
                    
                    if (forceLogoutAt) {
                        const sessionStartedAt = sessionStorage.getItem('session_started_at');
                        if (sessionStartedAt && new Date(forceLogoutAt) > new Date(sessionStartedAt)) {
                            alert(T.sessionTerminated);
                            handleLogout();
                        }
                    }
                }
            )
            .subscribe();
        
        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser?.id, handleLogout, T.sessionTerminated]);
    
    // Effect for 1-hour session timeout
    useEffect(() => {
        let sessionTimeoutId: number;

        if (currentUser) {
            const ONE_HOUR_IN_MS = 60 * 60 * 1000;
            console.log(`[Session] Starting 1-hour auto-logout timer.`);
            
            sessionTimeoutId = window.setTimeout(() => {
                console.log('[Session] 1-hour session expired. Forcing logout.');
                handleLogout();
            }, ONE_HOUR_IN_MS);
        }

        // Cleanup function to clear the timer if the user logs out manually or component unmounts
        return () => {
            if (sessionTimeoutId) {
                clearTimeout(sessionTimeoutId);
                console.log('[Session] Auto-logout timer cleared.');
            }
        };
    }, [currentUser, handleLogout]);

  const proceedWithPostLoginFlow = (user: User) => {
    // Directly let user in without blocking modal.
    // If user has no token, they can claim manually via Settings or ApiKeyStatus.
    setJustLoggedIn(true);
  };

    // FIX: Removed local definition of getAvailableServersForUser. It's now imported from userService.
    
    // Effect to auto-select a server if none is present in the session (e.g., after clearing session storage)
    useEffect(() => {
        const autoSelectServerIfNeeded = async () => {
            const serverInSession = sessionStorage.getItem('selectedProxyServer');
            const sessionStartTime = sessionStorage.getItem('session_started_at');
            // Only run if it's NOT a recent login/load (give other logic 3 seconds to run)
            const isRecentSessionStart = sessionStartTime && (new Date().getTime() - new Date(sessionStartTime).getTime()) < 3000;

            if (currentUser && !serverInSession && !isRecentSessionStart && window.location.hostname !== 'localhost') {
                console.log("[Auto-Select Server] No server found in session. Attempting to auto-connect to the least busy server.");
                try {
                    const [serverCounts, serversForUser] = await Promise.all([
                        getServerUsageCounts(),
                        getAvailableServersForUser(currentUser),
                    ]);

                    if (serversForUser.length === 0) throw new Error("No available servers found for this user account.");

                    const leastBusyServer = serversForUser.reduce((leastBusy, currentServer) => {
                        const leastBusyUsage = serverCounts[leastBusy] || 0;
                        const currentUsage = serverCounts[currentServer] || 0;
                        return currentUsage < leastBusyUsage ? currentServer : leastBusy;
                    }, serversForUser[0]);

                    sessionStorage.setItem('selectedProxyServer', leastBusyServer);
                    await updateUserProxyServer(currentUser.id, leastBusyServer);

                    const serverName = leastBusyServer.replace('https://', '').replace('.monoklix.com', '');
                    console.log(`[Auto-Select Server] Silently connected to server ${serverName.toUpperCase()} with ${serverCounts[leastBusyServer] || 0} users.`);
                } catch (error) {
                    console.warn('[Auto-Select Server] Failed to find least busy server, connecting to a random fallback.', error);
                    let fallbackServers = ['https://s1.monoklix.com', 'https://s2.monoklix.com', 'https://s3.monoklix.com', 'https://s4.monoklix.com', 'https://s5.monoklix.com'];
                    if (currentUser.batch_02 === 'batch_02') {
                        fallbackServers = ['https://s6.monoklix.com', 'https://s7.monoklix.com', 'https://s8.monoklix.com', 'https://s9.monoklix.com'];
                    }
                    const fallback = fallbackServers[Math.floor(Math.random() * fallbackServers.length)];
                    
                    sessionStorage.setItem('selectedProxyServer', fallback);
                    await updateUserProxyServer(currentUser.id, fallback);
                    const serverName = fallback.replace('https://', '').replace('.monoklix.com', '');
                    console.log(`[Auto-Select Server] Silently connected to fallback server ${serverName.toUpperCase()}.`);
                }
            }
        };
        autoSelectServerIfNeeded();
    // FIX: Removed getAvailableServersForUser from dependency array as it's now a stable import.
    }, [currentUser]);
  
    const handleServerSelected = async (serverUrl: string) => {
        if (!currentUser) return;
        console.log(`[Session] User selected server: ${serverUrl}`);
        sessionStorage.setItem('selectedProxyServer', serverUrl);

        if (serverModalPurpose === 'change') {
            // Persist changes before reloading for robustness
            const updatedUser = { ...currentUser, proxyServer: serverUrl };
            handleUserUpdate(updatedUser); // This updates localStorage
            await updateUserProxyServer(currentUser.id, serverUrl); // This updates DB

            alert('Server changed successfully! The application will now reload.');
            window.location.reload();
        } else { // 'login'
            await updateUserProxyServer(currentUser.id, serverUrl);
            setShowServerModal(false);
            proceedWithPostLoginFlow(currentUser);
        }
    };

    const handleOpenChangeServerModal = async () => {
        if (!currentUser) return;
        setServerModalPurpose('change');
        try {
            const [serverCounts, serversToShow] = await Promise.all([
                getServerUsageCounts(),
                getAvailableServersForUser(currentUser),
            ]);
            setServerOptions({ servers: serversToShow, usage: serverCounts });
            setShowServerModal(true);
        } catch (error) {
            console.error('[Server Selection] Error opening server modal:', error);
            alert('Could not fetch server list. Please try again.');
        }
    };

  const handleLoginSuccess = async (user: User) => {
    handleUserUpdate(user);
    logActivity('login');
    sessionStorage.setItem('session_started_at', new Date().toISOString());
    setServerModalPurpose('login');
    
    // The useEffect listening to currentUser.id will now handle initializing session data.
    // This prevents a double-call on login.
    
    // Server selection logic
    if (user.role === 'admin') {
        console.log("[Session] Admin user detected. Assigning to dedicated admin server.");
        const adminServer = 'https://s10.monoklix.com';
        sessionStorage.setItem('selectedProxyServer', adminServer);
        await updateUserProxyServer(user.id, adminServer);
        proceedWithPostLoginFlow(user);
    } else if (window.location.hostname === 'localhost') {
        console.log("[Session] Local Development: Skipping server selection.");
        proceedWithPostLoginFlow(user);
    } else {
        console.log("[Session] Waiting for user to select server...");
        try {
            const [serverCounts, serversToShow] = await Promise.all([
                getServerUsageCounts(),
                getAvailableServersForUser(user),
            ]);
            setServerOptions({ servers: serversToShow, usage: serverCounts });
            setShowServerModal(true);
        } catch (error) {
            console.error('[Session] Error during server selection setup. Using a random fallback server.', error);
            let fallbackServers = ['https://s1.monoklix.com', 'https://s2.monoklix.com', 'https://s3.monoklix.com', 'https://s4.monoklix.com', 'https://s5.monoklix.com'];
            if (user.batch_02 === 'batch_02') {
                fallbackServers = ['https://s6.monoklix.com', 'https://s7.monoklix.com', 'https://s8.monoklix.com', 'https://s9.monoklix.com'];
            }
            const fallbackServer = fallbackServers[Math.floor(Math.random() * fallbackServers.length)];

            sessionStorage.setItem('selectedProxyServer', fallbackServer);
            await updateUserProxyServer(user.id, fallbackServer);
            proceedWithPostLoginFlow(user);
        }
    }
  };

  const handleCreateVideoFromImage = (preset: VideoGenPreset) => {
    setVideoGenPreset(preset);
    setActiveView('ai-video-suite');
  };

  const handleReEditImage = (preset: ImageEditPreset) => {
    setImageToReEdit(preset);
    setActiveView('ai-image-suite');
  };

  const handleUsePromptInGenerator = (prompt: string) => {
    setImageGenPresetPrompt(prompt);
    setActiveView('ai-image-suite');
  };

  const renderView = () => {
    switch (activeView) {
      case 'home':
        // FIX: Add missing 'language' prop
        return <ECourseView currentUser={currentUser!} language={language} />;
      case 'get-started':
        // FIX: Add missing 'language' prop
        return <GetStartedView language={language} />;
      case 'ai-text-suite':
        // FIX: Add missing 'language' prop
        return <AiTextSuiteView currentUser={currentUser!} language={language} />;
      case 'ai-image-suite':
        // FIX: Add missing 'language' prop
        return <AiImageSuiteView 
                  onCreateVideo={handleCreateVideoFromImage} 
                  onReEdit={handleReEditImage}
                  imageToReEdit={imageToReEdit}
                  clearReEdit={() => setImageToReEdit(null)}
                  presetPrompt={imageGenPresetPrompt}
                  clearPresetPrompt={() => setImageGenPresetPrompt(null)}
                  currentUser={currentUser!}
                  onUserUpdate={handleUserUpdate}
                  language={language}
                />;
      case 'ugc-gen':
          return <UgcGenView currentUser={currentUser!} language={language} onUserUpdate={handleUserUpdate} />;
      case 'ai-video-suite':
        // FIX: Add missing 'language' prop
        return <AiVideoSuiteView 
                  currentUser={currentUser!}
                  preset={videoGenPreset} 
                  clearPreset={() => setVideoGenPreset(null)}
                  onCreateVideo={handleCreateVideoFromImage}
                  onReEdit={handleReEditImage}
                  onUserUpdate={handleUserUpdate}
                  language={language}
                />;
      case 'ai-prompt-library-suite':
          // FIX: Add missing 'language' prop
          return <AiPromptLibrarySuiteView onUsePrompt={handleUsePromptInGenerator} language={language} />;
      case 'gallery':
        // FIX: Add missing 'language' prop
        return <GalleryView onCreateVideo={handleCreateVideoFromImage} onReEdit={handleReEditImage} language={language} />;
      case 'api-generator':
          // FIX: Add missing 'language' prop
          return <ApiGeneratorView language={language} currentUser={currentUser!} onUserUpdate={handleUserUpdate} />;
      case 'master-dashboard':
          return <MasterDashboardView currentUser={currentUser!} language={language} />;
      case 'settings':
          // FIX: Add missing 'language' and 'setLanguage' props
          return <SettingsView 
                    currentUser={currentUser!} 
                    // This prop is now obsolete, but kept for compatibility.
                    tempApiKey={null}
                    onUserUpdate={handleUserUpdate} 
                    veoTokenRefreshedAt={veoTokenRefreshedAt}
                    assignTokenProcess={assignTokenProcess}
                    language={language}
                    setLanguage={setLanguage}
                 />;
      default:
        // FIX: Add missing 'language' prop
        return <ECourseView currentUser={currentUser!} language={language} />;
    }
  };
  
  if (!sessionChecked || (currentUser && isApiKeyLoading)) {
      return (
          <div className="flex items-center justify-center min-h-screen bg-neutral-100 dark:bg-neutral-900">
              <Spinner />
          </div>
      );
  }

  if (isShowingWelcome) {
    return <WelcomeAnimation onAnimationEnd={() => {
        setIsShowingWelcome(false);
        setActiveView('home');
    }} />;
  }
  
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (showServerModal) {
    return <ServerSelectionModal
        isOpen={true}
        servers={serverOptions.servers}
        serverUsage={serverOptions.usage}
        onSelect={handleServerSelected}
        onClose={() => setShowServerModal(false)}
    />;
  }

  // --- Access Control Logic for Full Version ---
  let isBlocked = false;
  let blockMessage = { title: T.accessDenied, body: "" };

  const adminOnlyViews: View[] = ['api-generator', 'master-dashboard'];

  if (adminOnlyViews.includes(activeView) && currentUser.role !== 'admin') {
      isBlocked = true;
      blockMessage = { title: T.accessDenied, body: T.adminOnlyFeature };
  } 
  else if (currentUser.status === 'admin' || currentUser.status === 'lifetime') {
      isBlocked = false;
  } 
  else if (currentUser.status === 'subscription') {
      // Strictly check expiry for subscription users
      const hasExpired = !currentUser.subscriptionExpiry || Date.now() > currentUser.subscriptionExpiry;
      if (hasExpired) {
          isBlocked = true;
          blockMessage = { title: T.subscriptionExpired, body: T.subscriptionExpiredMessage };
      } else {
          isBlocked = false;
      }
  }
  // Block any other status (e.g., inactive, pending_payment, trial)
  else {
      isBlocked = true;
      blockMessage = { title: T.accessDenied, body: T.accountStatusBlocked.replace('{status}', currentUser.status) };
  }


  const renderBlockMessageBody = (body: string) => {
        if (!body.includes('[BUTTON]')) {
            return <p className="mt-2 text-neutral-600 dark:text-neutral-300 whitespace-pre-line">{body}</p>;
        }

        const buttonRegex = /\[BUTTON\](.*?)\[URL\](.*)/;
        const buttonMatch = body.match(buttonRegex);

        if (!buttonMatch || typeof buttonMatch.index === 'undefined') {
            return <p className="mt-2 text-neutral-600 dark:text-neutral-300 whitespace-pre-line">{body}</p>;
        }
        
        const beforeText = body.substring(0, buttonMatch.index);
        const buttonText = buttonMatch[1];
        const buttonUrl = buttonMatch[2];
        const afterText = body.substring(buttonMatch.index + buttonMatch[0].length);

        return (
            <div className="mt-4 text-neutral-600 dark:text-neutral-300 space-y-4">
                <p className="whitespace-pre-line text-sm">{beforeText.trim()}</p>
                <a
                    href={buttonUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block bg-primary-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-primary-700 transition-colors shadow-md text-base"
                >
                    {buttonText}
                </a>
                <p className="whitespace-pre-line text-sm">{afterText.trim()}</p>
            </div>
        );
    };

  const PageContent = isBlocked ? (
    <div className="flex items-center justify-center h-full p-4">
      <div className="text-center p-8 sm:p-12 max-w-lg bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/50">
          <XIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-neutral-800 dark:text-white sm:text-2xl">{blockMessage.title}</h2>
        {renderBlockMessageBody(blockMessage.body)}
      </div>
    </div>
  ) : renderView();

  return (
    <div className="flex h-screen bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 font-sans">
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView} 
        onLogout={handleLogout} 
        currentUser={currentUser}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        language={language}
      />
      <main className="flex-1 flex flex-col overflow-y-auto min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between p-2 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 lg:hidden" aria-label={T.openMenu}>
              <MenuIcon className="w-6 h-6" />
            </button>
             <LogoIcon className="w-28 text-neutral-800 dark:text-neutral-200" />
          </div>
          <div className="flex items-center gap-2 pr-2">
              <ThemeSwitcher theme={theme} setTheme={setTheme} />
               <button
                  onClick={() => setIsLogSidebarOpen(!isLogSidebarOpen)}
                  className={`p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${isLogSidebarOpen ? 'bg-neutral-200 dark:bg-neutral-800' : ''}`}
                  aria-label={isLogSidebarOpen ? 'Close Console' : T.openConsole}
                  title={isLogSidebarOpen ? 'Close Console' : T.openConsole}
              >
                  <TerminalIcon className={`w-5 h-5 ${isLogSidebarOpen ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-600 dark:text-neutral-400'}`} />
              </button>
              <button
                  onClick={handleClearCacheAndRefresh}
                  className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  aria-label={T.refreshSession}
                  title={T.refreshSessionTooltip}
              >
                  <RefreshCwIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              </button>
              <ApiKeyStatus 
                activeApiKey={activeApiKey} 
                veoTokenRefreshedAt={veoTokenRefreshedAt} 
                currentUser={currentUser}
                assignTokenProcess={assignTokenProcess}
                onUserUpdate={handleUserUpdate}
                onOpenChangeServerModal={handleOpenChangeServerModal}
                language={language}
              />
          </div>
        </header>
        {notification && <NotificationBanner message={notification} onDismiss={() => setNotification(null)} />}
        <div className="flex-1 p-4 md:p-8">
          {PageContent}
        </div>
      </main>
      <ConsoleLogSidebar 
        isOpen={isLogSidebarOpen}
        onClose={() => setIsLogSidebarOpen(false)}
      />
    </div>
  );
};

export default App;
