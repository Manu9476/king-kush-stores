// frontend/src/context/ChatbotContext.tsx
"use client";

import React, { createContext, useState, useContext, ReactNode, useCallback, useMemo } from 'react';

export interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
}

interface ChatbotContextType {
  isOpen: boolean;
  messages: ChatMessage[];
  toggleChatbot: () => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

export const ChatbotProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const toggleChatbot = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);
  
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const value = useMemo(() => ({
    isOpen,
    messages,
    toggleChatbot,
    addMessage,
    clearMessages,
  }), [isOpen, messages, toggleChatbot, addMessage, clearMessages]);

  return (
    <ChatbotContext.Provider value={value}>
      {children}
    </ChatbotContext.Provider>
  );
};

export const useChatbot = () => {
  const context = useContext(ChatbotContext);
  if (context === undefined) {
    throw new Error('useChatbot must be used within a ChatbotProvider');
  }
  return context;
};
