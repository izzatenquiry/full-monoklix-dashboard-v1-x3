import React, { useState, useEffect, useCallback, useRef } from 'react';
import { type User, type AiLogItem, type Language } from '../../types';
import { updateUserProfile, updateUserWebhookUrl, saveUserPersonalAuthToken, assignPersonalTokenAndIncrementUsage } from '../../services/userService';
import {
    CreditCardIcon, CheckCircleIcon, XIcon, WebhookIcon, EyeIcon, EyeOffIcon, ChatIcon,
    AlertTriangleIcon, DatabaseIcon, TrashIcon, RefreshCwIcon, WhatsAppIcon, InformationCircleIcon, SparklesIcon
} from '../Icons';
import Spinner from '../common/Spinner';
import { sendTestUserWebhook } from '../../services/webhookService';
import AdminDashboardView from './AdminDashboardView';
import ETutorialAdminView from './ETutorialAdminView';
import Tabs, { type Tab } from '../common/Tabs';
import { runApiHealthCheck, type HealthCheckResult } from '../../services/geminiService';
import { getTranslations } from '../../services/translations';
import { getFormattedCacheStats, clearVideoCache } from '../../services/videoCacheService';
import { runComprehensiveTokenTest, type TokenTestResult } from '../../services/imagenV3Service';

// Define the types for the tabs in the settings view
type SettingsTabId = 'profile' | 'api' | 'content-admin' | 'user-db';

const getTabs = (): Tab<SettingsTabId>[] => {
    const T = getTranslations().settingsView;
    return [
        { id: 'profile', label: T.tabs.profile },
        { id: 'api', label: T.tabs.api },
        { id: 'content-admin', label: T.tabs.contentAdmin, adminOnly: true },
        { id: 'user-db', label: T.tabs.userDb, adminOnly: true },
    ];
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface SettingsViewProps {
  currentUser: User;
  tempApiKey: string | null;
  onUserUpdate: (user: User) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  veoTokenRefreshedAt: string | null;
  assignTokenProcess: () => Promise<{ success: boolean; error: string | null; }>;
}

// --- PANELS ---

interface ProfilePanelProps extends Pick<SettingsViewProps, 'currentUser' | 'onUserUpdate'> {
    language: Language;
    setLanguage: (lang: Language) => void;
}

const ProfilePanel: React.FC<ProfilePanelProps> = ({ currentUser, onUserUpdate, language, setLanguage }) => {
    const T = getTranslations().settingsView.profile;
    const [fullName, setFullName] = useState(currentUser.fullName || currentUser.username);
    const [email, setEmail] = useState(currentUser.email);
    const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error' | 'loading'; message: string }>({ type: 'idle', message: '' });
    const statusTimeoutRef = useRef<number | null>(null);

     useEffect(() => {
        return () => {
            if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        };
    }, []);

    const getAccountStatus = (user: User): { text: string; colorClass: string } => {
        switch (user.status) {
            case 'admin': return { text: T.status.admin, colorClass: 'text-green-500' };
            case 'lifetime': return { text: T.status.lifetime, colorClass: 'text-green-500' };
            case 'subscription': return { text: T.status.subscription, colorClass: 'text-green-500' };
            case 'trial': return { text: T.status.trial, colorClass: 'text-yellow-500' };
            case 'inactive': return { text: T.status.inactive, colorClass: 'text-red-500' };
            case 'pending_payment': return { text: T.status.pending, colorClass: 'text-yellow-500' };
            default: return { text: T.status.unknown, colorClass: 'text-neutral-500' };
        }
    };

    const handleSave = async () => {
        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        setStatus({ type: 'loading', message: T.saving });
        const result = await updateUserProfile(currentUser.id, { fullName, email });
        if (result.success === false) {
            setStatus({ type: 'error', message: T.fail.replace('{message}', result.message) });
        } else {
            onUserUpdate(result.user);
            setStatus({ type: 'success', message: T.success });
        }
        statusTimeoutRef.current = window.setTimeout(() => setStatus({ type: 'idle', message: '' }), 4000);
    };

    const accountStatus = getAccountStatus(currentUser);
    let expiryInfo = null;
    if (currentUser.status === 'subscription' && currentUser.subscriptionExpiry) {
        const expiryDate = new Date(currentUser.subscriptionExpiry);
        const isExpired = Date.now() > expiryDate.getTime();
        expiryInfo = (
            <span className={isExpired ? 'text-red-500 font-bold' : ''}>
                {T.expiresOn} {expiryDate.toLocaleDateString()} {isExpired && `(${T.expired})`}
            </span>
        );
    }


    return (
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold mb-6">{T.title}</h2>
            <div className="mb-6 p-4 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">{T.accountStatus} <span className={`font-bold ${accountStatus.colorClass}`}>{accountStatus.text}</span></p>
                {expiryInfo && <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">{expiryInfo}</p>}
            </div>
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">{T.fullName}</label>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={status.type === 'loading'} className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 focus:ring-2 focus:ring-primary-500 focus:outline-none transition disabled:opacity-50" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">{T.email}</label>
                    <input type="email" value={email} readOnly disabled className="w-full bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 cursor-not-allowed" />
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={handleSave} disabled={status.type === 'loading'} className="bg-primary-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-700 transition-colors w-48 flex justify-center disabled:opacity-50">
                        {status.type === 'loading' ? <Spinner /> : T.save}
                    </button>
                    {status.type !== 'idle' && (
                        <div className={`flex items-center gap-3 text-sm ${status.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                            {status.type === 'success' && <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />}
                            {status.type === 'error' && <XIcon className="w-5 h-5 flex-shrink-0" />}
                            <span>{status.message}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const CacheManagerPanel: React.FC = () => {
    const T = getTranslations().settingsView.cache;
  const [stats, setStats] = useState<{
    size: string;
    count: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const formattedStats = await getFormattedCacheStats();
      setStats(formattedStats);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleClearCache = async () => {
    if (!confirm(T.confirmClear)) {
      return;
    }

    setIsClearing(true);
    try {
      await clearVideoCache();
      await loadStats();
      alert(T.clearSuccess);
    } catch (error) {
      console.error('Failed to clear cache:', error);
      alert(T.clearFail);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <DatabaseIcon className="w-8 h-8 text-primary-500" />
          <div>
            <h2 className="text-xl font-semibold">{T.title}</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {T.subtitle}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : stats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">{T.storageUsed}</p>
                <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{stats.size}</p>
              </div>
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-1">{T.videosCached}</p>
                <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{stats.count}</p>
              </div>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                {T.howItWorks}
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>{T.l1}</li>
                <li>{T.l2}</li>
                <li>{T.l3}</li>
                <li>{T.l4}</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button onClick={loadStats} disabled={isLoading} className="flex items-center justify-center gap-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50">
                <RefreshCwIcon className="w-4 h-4" /> {T.refresh}
              </button>
              <button onClick={handleClearCache} disabled={isClearing || stats.count === 0} className="flex items-center justify-center gap-2 bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {isClearing ? (<><Spinner /> {T.clearing}</>) : (<><TrashIcon className="w-4 h-4" /> {T.clear}</>)}
              </button>
            </div>

            <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
              <h3 className="font-semibold mb-2">💡 {T.tips}</h3>
              <ul className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
                <li>{T.tip1}</li>
                <li>{T.tip2}</li>
                <li>{T.tip3}</li>
                <li>{T.tip4}</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-neutral-500">{T.failLoad}</div>
        )}
      </div>
  );
};

const ClaimTokenModal: React.FC<{
  status: 'searching' | 'success' | 'error';
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}> = ({ status, error, onRetry, onClose }) => {
    const T = getTranslations().claimTokenModal;
    return (
    <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50 p-4 animate-zoomIn" aria-modal="true" role="dialog">
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl p-8 text-center max-w-sm w-full">
        {status === 'searching' && (
            <>
            <Spinner />
            <h2 className="text-xl font-bold mt-4">{T.searchingTitle}</h2>
            <p className="text-neutral-500 dark:text-neutral-400 mt-2 text-sm">
                {T.searchingMessage}
            </p>
            </>
        )}
        {status === 'success' && (
            <>
            <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold mt-4">{T.successTitle}</h2>
            <p className="text-neutral-500 dark:text-neutral-400 mt-2 text-sm">
                {T.successMessage}
            </p>
            </>
        )}
        {status === 'error' && (
            <>
            <AlertTriangleIcon className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold mt-4">{T.errorTitle}</h2>
            <p className="text-neutral-500 dark:text-neutral-400 mt-2 text-sm">
                {error || T.errorMessageDefault}
            </p>
            <div className="mt-6 flex gap-4">
                <button onClick={onClose} className="w-full bg-neutral-200 dark:bg-neutral-700 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors">
                {T.closeButton}
                </button>
                <button onClick={onRetry} className="w-full bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors">
                {T.retryButton}
                </button>
            </div>
            </>
        )}
        </div>
    </div>
)};

interface ApiIntegrationsPanelProps {
  currentUser: User;
  onUserUpdate: (user: User) => void;
  language: Language;
  veoTokenRefreshedAt: string | null;
  assignTokenProcess: () => Promise<{ success: boolean; error: string | null; }>;
}

const ApiIntegrationsPanel: React.FC<ApiIntegrationsPanelProps> = ({ currentUser, onUserUpdate, language, veoTokenRefreshedAt, assignTokenProcess }) => {
    const T = getTranslations().settingsView.api;
    const commonT_errors = getTranslations().common.errors;
    const [webhookUrl, setWebhookUrl] = useState(currentUser.webhookUrl || '');
    const [webhookStatus, setWebhookStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

    const [isCheckingHealth, setIsCheckingHealth] = useState(false);
    const [healthCheckResults, setHealthCheckResults] = useState<HealthCheckResult[] | null>(null);
    const [veoTokens, setVeoTokens] = useState<{ token: string; createdAt: string }[]>([]);

    const [personalAuthToken, setPersonalAuthToken] = useState(currentUser.personalAuthToken || '');
    const [showPersonalToken, setShowPersonalToken] = useState(false);
    const [personalTokenSaveStatus, setPersonalTokenSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    
    const [testStatus, setTestStatus] = useState<'idle' | 'testing'>('idle');
    const [testResults, setTestResults] = useState<TokenTestResult[] | null>(null);

    const [claimStatus, setClaimStatus] = useState<'idle' | 'searching' | 'success' | 'error'>('idle');
    const [claimError, setClaimError] = useState<string | null>(null);

    const [testingToken, setTestingToken] = useState<string | null>(null);
    const [testResultsMap, setTestResultsMap] = useState<Map<string, TokenTestResult[]>>(new Map());
    const [claimingToken, setClaimingToken] = useState<string | null>(null);
    const [tokenStatusMessage, setTokenStatusMessage] = useState<{ type: 'success' | 'error' | 'loading'; message: string } | null>(null);

    const handleTestSharedToken = useCallback(async (token: string) => {
        setTestingToken(token);
        const results = await runComprehensiveTokenTest(token);
        setTestResultsMap(prev => new Map(prev).set(token, results));
        setTestingToken(null);
    }, []);

    const handleClaimSharedToken = useCallback(async (token: string) => {
        if (!confirm(T.confirmClaim.replace('{token}', token.slice(-6)))) {
            return;
        }
        setClaimingToken(token);
        setTokenStatusMessage({ type: 'loading', message: T.claiming.replace('{token}', token.slice(-6)) });

        const result = await assignPersonalTokenAndIncrementUsage(currentUser.id, token);

        if (result.success === false) {
            setTokenStatusMessage({ type: 'error', message: result.message || T.claimFail });
        } else {
            onUserUpdate(result.user);
            setTokenStatusMessage({ type: 'success', message: T.claimSuccess });
        }
        
        setClaimingToken(null);
        setTimeout(() => setTokenStatusMessage(null), 5000);
    }, [currentUser.id, onUserUpdate, T]);


    const handleClaimNewToken = useCallback(async () => {
        setClaimStatus('searching');
        setClaimError(null);

        const clearResult = await saveUserPersonalAuthToken(currentUser.id, null);
        
        if (clearResult.success === false) {
            setClaimError(clearResult.message || 'Failed to clear previous token.');
            setClaimStatus('error');
        } else {
            onUserUpdate(clearResult.user);
            
            const assignResult = await assignTokenProcess();
            if (assignResult.success) {
                setClaimStatus('success');
                setTimeout(() => {
                    setClaimStatus('idle');
                }, 2000);
            } else {
                setClaimError(assignResult.error || 'Failed to assign token.');
                setClaimStatus('error');
            }
        }
    }, [currentUser.id, onUserUpdate, assignTokenProcess]);

    const handleTestToken = useCallback(async () => {
        setTestStatus('testing');
        setTestResults(null);
        const results = await runComprehensiveTokenTest(personalAuthToken);
        setTestResults(results);
        setTestStatus('idle');
    }, [personalAuthToken]);

    useEffect(() => {
        const tokensJSON = sessionStorage.getItem('veoAuthTokens');
        if (tokensJSON) {
            try {
                const parsedTokens = JSON.parse(tokensJSON);
                if (Array.isArray(parsedTokens)) {
                    setVeoTokens(parsedTokens);
                }
            } catch (e) {
                console.error("Failed to parse VEO auth from session storage", e);
                setVeoTokens([]);
            }
        } else {
            setVeoTokens([]);
        }
    }, [veoTokenRefreshedAt]);
    
    useEffect(() => {
        const tokenFromProp = currentUser.personalAuthToken || '';
        setPersonalAuthToken(tokenFromProp);
        setTestResults(null);
    }, [currentUser.personalAuthToken]);
    
    const handleSaveWebhook = async () => {
        setWebhookStatus({ type: 'loading', message: T.savingWebhook });
        try {
            const urlToSave = webhookUrl.trim();
            if (urlToSave) new URL(urlToSave);
            const result = await updateUserWebhookUrl(currentUser.id, urlToSave || null);
            if (result.success === false) {
                setWebhookStatus({ type: 'error', message: result.message });
            } else {
                onUserUpdate(result.user);
                setWebhookStatus({ type: 'success', message: T.webhookSaved });
            }
        } catch (_) {
            setWebhookStatus({ type: 'error', message: T.invalidUrl });
        }
        setTimeout(() => setWebhookStatus({ type: 'idle', message: '' }), 3000);
    };
    
    const handleTestWebhook = async () => {
        if (!currentUser.webhookUrl) return;
        setWebhookStatus({ type: 'loading', message: T.testingWebhook });
        const result = await sendTestUserWebhook();
        const errorKey = result.message as keyof typeof commonT_errors;
        const message = commonT_errors[errorKey] || result.message;
        setWebhookStatus({ type: result.success ? 'success' : 'error', message: message });
        setTimeout(() => setWebhookStatus({ type: 'idle', message: '' }), 5000);
    };

    const handleHealthCheck = async () => {
        setIsCheckingHealth(true);
        setHealthCheckResults(null);
        try {
            const activeApiKey = sessionStorage.getItem('monoklix_session_api_key');
            const results = await runApiHealthCheck({
                textKey: activeApiKey || undefined,
            });
            setHealthCheckResults(results);
        } catch (error: any) {
            setHealthCheckResults([{ service: T.fail, model: 'N/A', status: 'error', message: error.message }]);
        } finally {
            setIsCheckingHealth(false);
        }
    };

    const getStatusClasses = (status: HealthCheckResult['status']) => {
        switch (status) {
            case 'operational': return { border: 'border-green-500', icon: <CheckCircleIcon className="w-5 h-5 text-green-500"/>, text: 'text-green-700 dark:text-green-300' };
            case 'error': return { border: 'border-red-500', icon: <XIcon className="w-5 h-5 text-red-500"/>, text: 'text-red-700 dark:text-red-300' };
            case 'degraded': return { border: 'border-yellow-500', icon: <AlertTriangleIcon className="w-5 h-5 text-yellow-500"/>, text: 'text-yellow-700 dark:text-yellow-300' };
            default: return { border: 'border-neutral-500', icon: null, text: '' };
        }
    };
    
    const locale = language === 'ms' ? 'ms-MY' : 'en-US';
    const activeApiKey = sessionStorage.getItem('monoklix_session_api_key');

    const handleSavePersonalToken = async () => {
        setPersonalTokenSaveStatus('saving');
        const result = await saveUserPersonalAuthToken(currentUser.id, personalAuthToken.trim() || null);

        if (result.success === false) {
            setPersonalTokenSaveStatus('error');
            if (result.message === 'DB_SCHEMA_MISSING_COLUMN_personal_auth_token' && currentUser.role === 'admin') {
                alert("Database schema is outdated.\n\nPlease go to your Supabase dashboard and run the following SQL command to add the required column:\n\nALTER TABLE public.users ADD COLUMN personal_auth_token TEXT;");
            }
        } else {
            onUserUpdate(result.user);
            setPersonalTokenSaveStatus('saved');
        }
        setTimeout(() => setPersonalTokenSaveStatus('idle'), 3000);
    };

    const getStatusButtonStyles = (result: TokenTestResult | undefined) => {
        if (!result) return { text: 'Not Tested', className: 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300' };
        if (result.success) return { text: 'OK', className: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' };
        return { text: 'Failed', className: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' };
    };


    return (
        <>
            {claimStatus !== 'idle' && (
                <ClaimTokenModal
                    status={claimStatus}
                    error={claimError}
                    onClose={() => setClaimStatus('idle')}
                    onRetry={handleClaimNewToken}
                />
            )}
            <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow-sm space-y-8">
                <div>
                    <h2 className="text-xl font-semibold mb-2">{T.title}</h2>
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700 flex items-start gap-3">
                        <InformationCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                           {T.description}
                        </p>
                    </div>
                    <div className="mt-4 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex justify-between items-center">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-200">{T.sharedStatus}</span>
                        {activeApiKey ? (
                            <span className="flex items-center gap-2 font-semibold text-green-600 dark:text-green-400">
                                <CheckCircleIcon className="w-5 h-5" />
                                {T.connected}
                            </span>
                        ) : (
                             <span className="flex items-center gap-2 font-semibold text-red-500">
                                <XIcon className="w-5 h-5" />
                                {T.notLoaded}
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-8">
                    <h2 className="text-xl font-semibold mb-2">{T.authTokenTitle}</h2>
                    <div className="relative">
                        <input
                            type={showPersonalToken ? 'text' : 'password'}
                            value={personalAuthToken}
                            onChange={(e) => {
                                setPersonalAuthToken(e.target.value);
                                setTestResults(null); // Reset test status on change
                            }}
                            placeholder={T.authTokenPlaceholder}
                            className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 pr-10 focus:ring-2 focus:ring-primary-500"
                        />
                        <button onClick={() => setShowPersonalToken(!showPersonalToken)} className="absolute inset-y-0 right-0 px-3 flex items-center text-neutral-500">
                            {showPersonalToken ? <EyeOffIcon className="w-5 h-5"/> : <EyeIcon className="w-5 h-5"/>}
                        </button>
                    </div>
                    
                    {/* Token Status Feedback */}
                    <div className="mt-2 min-h-[24px]">
                        {testStatus === 'testing' && <div className="flex items-center gap-2 text-sm text-neutral-500"><Spinner /> {T.testing}</div>}
                        {testResults && (
                            <div className="space-y-2 mt-2">
                                {testResults.map(result => (
                                    <div key={result.service} className={`flex items-start gap-2 text-sm p-2 rounded-md ${result.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                                        {result.success ? <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"/> : <XIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"/>}
                                        <div>
                                            <span className={`font-semibold ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-700 dark:text-red-300'}`}>{result.service} Service</span>
                                            <p className={`text-xs ${result.success ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-400'}`}>{result.message}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                        <button onClick={handleSavePersonalToken} disabled={personalTokenSaveStatus === 'saving'} className="bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 w-24 flex justify-center">
                            {personalTokenSaveStatus === 'saving' ? <Spinner/> : T.save}
                        </button>
                        <button onClick={handleTestToken} disabled={!personalAuthToken || testStatus === 'testing'} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2 disabled:opacity-50">
                             {testStatus === 'testing' ? <Spinner /> : <SparklesIcon className="w-4 h-4" />}
                            {T.runTest}
                        </button>
                        <button onClick={handleClaimNewToken} disabled={personalTokenSaveStatus === 'saving' || claimStatus !== 'idle'} className="bg-neutral-200 dark:bg-neutral-700 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors">
                            {T.claimNew}
                        </button>
                         {personalTokenSaveStatus === 'saved' && (
                            <span className="flex items-center gap-2 text-sm text-green-600">
                                <CheckCircleIcon className="w-5 h-5" />
                                {T.updated}
                            </span>
                        )}
                         {personalTokenSaveStatus === 'error' && (
                            <span className="flex items-center gap-2 text-sm text-red-600">
                                <XIcon className="w-5 h-5" />
                                {T.saveFail}
                            </span>
                        )}
                    </div>
                </div>

                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-8">
                     <div className="border-2 border-indigo-400 dark:border-indigo-600 rounded-lg p-4 bg-indigo-50 dark:bg-indigo-900/30">
                        <h3 className="text-lg font-semibold text-indigo-800 dark:text-indigo-200 mb-2">
                            {T.tokenGroupTitle}
                        </h3>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-3" dangerouslySetInnerHTML={{ __html: T.tokenGroupDesc }} />
                        
                        {tokenStatusMessage && (
                            <div className={`p-2 rounded text-xs mb-2 ${tokenStatusMessage.type === 'loading' ? 'bg-blue-100 text-blue-800' : tokenStatusMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {tokenStatusMessage.message}
                            </div>
                        )}

                        {veoTokens.length > 0 ? (
                            <div className="mt-4 space-y-2">
                                {veoTokens.map((tokenData, index) => {
                                    const results = testResultsMap.get(tokenData.token);
                                    const imagenResult = results?.find(r => r.service === 'Imagen');
                                    const veoResult = results?.find(r => r.service === 'Veo');
                                    const imagenStatus = getStatusButtonStyles(imagenResult);
                                    const veoStatus = getStatusButtonStyles(veoResult);
                                    return (
                                        <div key={index} className={`p-3 rounded-md border bg-neutral-100 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700`}>
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                                <div className="flex-1 text-sm">
                                                    <p className={`font-semibold text-neutral-800 dark:text-neutral-200`}>
                                                        {`${T.sharedToken} #${index + 1}`}
                                                        <span className="font-mono text-xs ml-2">...{tokenData.token.slice(-6)}</span>
                                                    </p>
                                                    <p className={`text-xs text-neutral-500 dark:text-neutral-400`}>
                                                        {T.created}: {new Date(tokenData.createdAt).toLocaleString(locale)}
                                                    </p>
                                                </div>
                                                <div className="grid grid-cols-2 sm:flex sm:items-center sm:flex-shrink-0 gap-2">
                                                    <div title={imagenResult?.message || 'Status test for Imagen'} className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-full ${imagenStatus.className}`}>
                                                        <span className="font-medium">IMAGEN</span>
                                                        <span className="font-bold">{imagenStatus.text}</span>
                                                    </div>
                                                    <div title={veoResult?.message || 'Status test for Veo3'} className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-full ${veoStatus.className}`}>
                                                        <span className="font-medium">VEO3</span>
                                                        <span className="font-bold">{veoStatus.text}</span>
                                                    </div>
                                                     <button onClick={() => handleTestSharedToken(tokenData.token)} disabled={testingToken !== null} className="sm:w-20 flex justify-center text-xs font-semibold py-1.5 px-3 rounded-full bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50">
                                                        {testingToken === tokenData.token ? <Spinner /> : T.test}
                                                    </button>
                                                    <button onClick={() => handleClaimSharedToken(tokenData.token)} disabled={claimingToken !== null || currentUser.personalAuthToken === tokenData.token} className="sm:w-20 flex justify-center text-xs font-semibold py-1.5 px-3 rounded-full bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:bg-primary-800">
                                                        {claimingToken === tokenData.token ? <Spinner /> : currentUser.personalAuthToken === tokenData.token ? T.claimed : T.claim}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mt-4 p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-md flex items-center gap-2 border border-yellow-200 dark:border-yellow-800">
                                <AlertTriangleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                                    {T.noTokens}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-8">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <CheckCircleIcon className="w-6 h-6"/> {T.healthCheckTitle}
                    </h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 my-4">
                        {T.healthCheckDesc}
                    </p>
                    <button 
                        onClick={handleHealthCheck} 
                        disabled={isCheckingHealth}
                        className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700 w-64 flex justify-center disabled:opacity-50"
                    >
                        {isCheckingHealth ? <Spinner /> : T.runCheck}
                    </button>

                    {isCheckingHealth && <p className="text-sm mt-4 text-neutral-500">{T.runningCheck}</p>}

                    {healthCheckResults && (
                        <div className="mt-6 space-y-3">
                            {healthCheckResults.map((result, index) => {
                                const { border, icon, text } = getStatusClasses(result.status);
                                const statusText = result.status === 'error' 
                                    ? 'Unavailable' 
                                    : result.status.charAt(0).toUpperCase() + result.status.slice(1);

                                return (
                                    <div key={index} className={`p-3 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg border-l-4 ${border} animate-zoomIn`}>
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex-1">
                                                <p className="font-semibold text-neutral-800 dark:text-white">{result.service}</p>
                                                <p className="text-xs font-mono text-neutral-500 break-all">{result.model}</p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {icon}
                                                <span className={`font-semibold text-sm ${text}`}>{statusText}</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 whitespace-pre-wrap">{result.message}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-8">
                    <h2 className="text-xl font-semibold flex items-center gap-2"><WebhookIcon className="w-6 h-6"/> {T.webhookTitle}</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 my-4">{T.webhookDesc}</p>
                    <input id="user-webhook-url" type="text" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder={T.webhookPlaceholder} className="w-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg p-2 focus:ring-2 focus:ring-primary-500" />
                    <div className="flex items-center gap-2 mt-4">
                        <button onClick={handleSaveWebhook} disabled={webhookStatus.type === 'loading'} className="bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700 w-24 flex justify-center">
                            {webhookStatus.type === 'loading' && webhookStatus.message.includes('Saving') ? <Spinner /> : T.saveWebhook}
                        </button>
                        <button onClick={handleTestWebhook} disabled={!currentUser.webhookUrl || webhookStatus.type === 'loading'} className="bg-neutral-200 dark:bg-neutral-700 font-semibold py-2 px-4 rounded-lg hover:bg-neutral-300 disabled:opacity-50 w-40 flex justify-center">
                            {webhookStatus.type === 'loading' && webhookStatus.message.includes('Sending') ? <Spinner /> : T.testWebhook}
                        </button>
                    </div>
                    {webhookStatus.message && <p className={`text-sm mt-2 ${webhookStatus.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>{webhookStatus.message}</p>}
                </div>
            </div>
        </>
    );
};

// --- MAIN VIEW ---

const SettingsView: React.FC<SettingsViewProps> = (props) => {
    const T = getTranslations().settingsView;
    const TABS = getTabs();
    const [activeTab, setActiveTab] = useState<SettingsTabId>('profile');
    const { currentUser, language, setLanguage } = props;

    const renderActiveTabContent = () => {
        switch (activeTab) {
            case 'profile': 
                return (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        <ProfilePanel currentUser={currentUser} onUserUpdate={props.onUserUpdate} language={language} setLanguage={setLanguage} />
                        <CacheManagerPanel />
                    </div>
                );
            case 'api': 
                return <ApiIntegrationsPanel 
                            currentUser={currentUser} 
                            onUserUpdate={props.onUserUpdate} 
                            language={language}
                            veoTokenRefreshedAt={props.veoTokenRefreshedAt}
                            assignTokenProcess={props.assignTokenProcess}
                        />;
            case 'content-admin': return <ETutorialAdminView />;
            case 'user-db': return <AdminDashboardView language={language} />;
            default: return <ProfilePanel currentUser={currentUser} onUserUpdate={props.onUserUpdate} language={language} setLanguage={setLanguage} />;
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold sm:text-3xl">{T.title}</h1>
            <div className="flex justify-center">
                <Tabs 
                    tabs={TABS}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    isAdmin={currentUser.role === 'admin'}
                />
            </div>
            <div className="mt-6">
                {renderActiveTabContent()}
            </div>
        </div>
    );
};

export default SettingsView;