import React from 'react';

export interface Tab<T extends string> {
  id: T;
  label: string;
  adminOnly?: boolean;
  count?: number;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  activeTab: T;
  // FIX: Correctly typed the `setActiveTab` prop to be compatible with React's `useState` dispatcher (`React.Dispatch<React.SetStateAction<T>>`).
  setActiveTab: React.Dispatch<React.SetStateAction<T>>;
  isAdmin?: boolean;
}

const Tabs = <T extends string>({ tabs, activeTab, setActiveTab, isAdmin = false }: TabsProps<T>) => {
  const visibleTabs = tabs.filter(tab => !tab.adminOnly || isAdmin);
  
  return (
    <div className="p-1 bg-neutral-200 dark:bg-neutral-800 rounded-full flex items-center gap-1 overflow-x-auto">
        {visibleTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm sm:px-6 sm:py-2.5 sm:text-base font-semibold rounded-full transition-colors duration-300 whitespace-nowrap ${
                    activeTab === tab.id
                        ? 'bg-white dark:bg-neutral-900 text-primary-600 dark:text-primary-400 shadow-md'
                        : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
                }`}>
                {tab.label}
                {tab.count !== undefined && (
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-primary-500/10' : 'bg-neutral-300 dark:bg-neutral-700'}`}>{tab.count}</span>
                )}
            </button>
        ))}
    </div>
  );
};

export default Tabs;