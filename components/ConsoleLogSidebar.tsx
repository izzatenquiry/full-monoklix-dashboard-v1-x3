import React, { useState, useEffect, useRef } from 'react';
import eventBus from '../services/eventBus';
import { XIcon, TrashIcon, TerminalIcon } from './Icons';
import { getTranslations } from '../services/translations';

interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: Date;
}

interface ConsoleLogSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConsoleLogSidebar: React.FC<ConsoleLogSidebarProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const T = getTranslations().consoleLogSidebar;

  useEffect(() => {
    const handleLog = (data: LogEntry) => {
      // Append new logs to the end, and keep max 200 logs by slicing from the end
      setLogs(prevLogs => [...prevLogs, data].slice(-200));
    };

    eventBus.on('consoleLog', handleLog);

    return () => {
      eventBus.remove('consoleLog', handleLog);
    };
  }, []);

  useEffect(() => {
    // Scroll to bottom when new logs are added
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const clearLogs = () => {
    setLogs([]);
  };

  const getLevelClasses = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'bg-red-500/10 border-red-500/50 text-red-700 dark:text-red-300';
      case 'warn':
        return 'bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-300';
      case 'debug':
        return 'bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-300';
      default: // 'log'
        return 'bg-transparent border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400';
    }
  };

  return (
    <>
      {/* Overlay for mobile */}
      <div
        className={`fixed inset-0 bg-black/60 z-30 lg:hidden transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      ></div>
      <aside
        className={`bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 flex flex-col 
                   transition-all duration-300 ease-custom-ease overflow-hidden
                   
                   fixed inset-y-0 right-0 z-40 w-80 
                   ${isOpen ? 'translate-x-0' : 'translate-x-full'}
                   
                   lg:relative lg:inset-auto lg:right-auto lg:z-auto lg:translate-x-0 lg:flex-shrink-0
                   ${isOpen ? 'lg:w-96' : 'lg:w-0'}`}
      >
        <div className="w-full lg:w-96 h-full flex flex-col p-4">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
                <TerminalIcon className="w-5 h-5" />
                {T.title}
            </h2>
            <div className="flex items-center gap-2">
                <button onClick={clearLogs} className="p-2 text-neutral-500 hover:text-neutral-800 dark:hover:text-white" aria-label={T.clearLogs} title={T.clearLogs}>
                <TrashIcon className="w-5 h-5" />
                </button>
                <button onClick={onClose} className="p-2" aria-label={T.closeConsole}>
                <XIcon className="w-6 h-6" />
                </button>
            </div>
            </div>
            
            <div ref={logContainerRef} className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2 space-y-2">
                {logs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-neutral-400">
                        <p>{T.placeholder}</p>
                    </div>
                ) : (
                    logs.map((log, index) => (
                        <div key={index} className={`p-2 rounded-md border-l-4 text-xs font-mono break-words ${getLevelClasses(log.level)}`}>
                            <div className="flex justify-between items-center text-neutral-400 dark:text-neutral-500 mb-1">
                                <span className="font-semibold uppercase">{log.level}</span>
                                <span>{log.timestamp.toLocaleTimeString()}</span>
                            </div>
                            <pre className="whitespace-pre-wrap">{log.message}</pre>
                        </div>
                    ))
                )}
            </div>
        </div>
      </aside>
    </>
  );
};

export default ConsoleLogSidebar;