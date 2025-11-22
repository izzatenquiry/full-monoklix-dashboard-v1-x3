import React, { useState } from 'react';
import { LogoIcon } from './components/Icons';
import { loginUser } from './services/userService';
import Spinner from './components/common/Spinner';
import { type User } from './types';
import { APP_VERSION } from './services/appConfig';
import { getTranslations } from './services/translations';

interface LoginPageProps {
    onLoginSuccess: (user: User) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const T = getTranslations().loginPage;
    const commonT = getTranslations().common;
    
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        
        const result = await loginUser(email);
        
        if (result.success === true) {
            onLoginSuccess(result.user);
        } else {
            const errorKey = result.message as keyof typeof commonT.errors;
            setError(commonT.errors[errorKey] || result.message);
        }
        setIsLoading(false);
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-neutral-100 dark:bg-neutral-900 p-4">
            <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-neutral-950 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800">
                <div className="text-center">
                    <LogoIcon className="w-48 mx-auto mb-4 text-neutral-800 dark:text-neutral-200" />
                    <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
                        {T.title}
                    </h1>
                     <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                        {T.subtitle}
                    </p>
                </div>

                <>
                    {error && <p className="text-center text-sm text-red-500 dark:text-red-400 p-3 bg-red-500/10 rounded-md">{error}</p>}
                    
                    <form className="mt-6 space-y-4" onSubmit={handleLogin}>
                         <div>
                            <label htmlFor="email-input" className="sr-only">{T.emailPlaceholder}</label>
                            <input
                                id="email-input"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="appearance-none rounded-md relative block w-full px-3 py-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 placeholder-neutral-500 text-neutral-900 dark:text-neutral-200 focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                                placeholder={T.emailPlaceholder}
                                disabled={isLoading}
                             />
                        </div>
                       
                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                            >
                                {isLoading ? <Spinner /> : T.loginButton}
                            </button>
                        </div>
                    </form>

                    <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800 text-center">
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">{T.noAccount}</p>
                        <a
                            href="https://monoklix.com/step/checkout/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full inline-block py-3 px-4 border border-primary-500 text-sm font-medium rounded-md text-primary-600 dark:text-primary-400 hover:bg-primary-500/10 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:ring-offset-neutral-950 focus:ring-primary-500 transition-colors"
                        >
                            {T.registerButton}
                        </a>
                    </div>
                </>
                 <p className="text-center text-xs text-neutral-500 dark:text-neutral-400 !mt-8">
                    © 2025 MONOklix.com ({APP_VERSION})
                </p>
            </div>
        </div>
    );
};

export default LoginPage;