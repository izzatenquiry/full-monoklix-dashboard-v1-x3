import React, { useState } from 'react';
import ChatInterface from '../common/ChatInterface';
import { ChatIcon } from '../Icons';
import { getSupportPrompt } from '../../services/promptManager';
import { type Language } from '../../types';

interface Message {
    role: 'user' | 'model';
    text: string;
}

interface AiSupportViewProps {
  language: Language;
}

const AiSupportView: React.FC<AiSupportViewProps> = ({ language }) => {
  const systemInstruction = getSupportPrompt();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const onSendMessage = async (prompt: string) => {
    // This is a no-op as the component is not wired to any state management.
    console.log('Dummy onSendMessage called with:', prompt);
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col">
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-2xl font-bold sm:text-3xl flex items-center gap-3">
          <ChatIcon className="w-8 h-8 text-primary-500"/>
          AI Support Assistant
        </h1>
        <p className="text-neutral-500 dark:text-neutral-400 mt-1">Get instant help and answers about using the platform.</p>
      </div>
       {/* This wrapper ensures the ChatInterface correctly fills the remaining vertical space */}
      <div className="flex-1 flex flex-col min-h-0">
        <ChatInterface
          systemInstruction={systemInstruction}
          placeholder='Ask a question, e.g., "How do I create a video?"'
          messages={messages}
          isLoading={isLoading}
          onSendMessage={onSendMessage}
          language={language}
        />
      </div>
    </div>
  );
};

export default AiSupportView;