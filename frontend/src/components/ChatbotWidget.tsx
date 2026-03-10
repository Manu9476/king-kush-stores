// frontend/src/components/ChatbotWidget.tsx
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChatbot, ChatMessage } from '../context/ChatbotContext';
import { sendMessageToBot, ChatHistoryMessage } from '../services/api';
import { FaCommentDots, FaTimes, FaPaperPlane } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';

const ChatbotWidget: React.FC = () => {
    const { token, userEmail } = useAuth();
    const { isOpen, messages, toggleChatbot, addMessage } = useChatbot();
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const hasWelcomedRef = useRef(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);
    
    useEffect(() => {
        const storageKey = "chatbotSessionId";
        const storedSessionId = localStorage.getItem(storageKey);
        if (storedSessionId) {
            setSessionId(storedSessionId);
            return;
        }

        const generatedId =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(storageKey, generatedId);
        setSessionId(generatedId);
    }, []);

    useEffect(() => {
        if (isOpen && !hasWelcomedRef.current) {
            const hour = new Date().getHours();
            const dayGreeting =
                hour >= 5 && hour < 12
                    ? "Good morning"
                    : hour >= 12 && hour < 17
                    ? "Good afternoon"
                    : hour >= 17 && hour < 23
                    ? "Good evening"
                    : "Hello";

            let displayName = "";
            if (userEmail && userEmail.includes("@")) {
                displayName = userEmail.split("@")[0].replace(/[._-]+/g, " ").trim();
                displayName = displayName ? displayName.charAt(0).toUpperCase() + displayName.slice(1) : "";
            }

            addMessage({
                sender: 'bot',
                text: displayName
                    ? `${dayGreeting}, ${displayName}. Welcome back to King-Kush Stores. How may I assist you today?`
                    : `${dayGreeting}. Welcome to King-Kush Stores support. How may I assist you today?`
            });
            hasWelcomedRef.current = true;
        }
    }, [isOpen, addMessage, userEmail]);


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const userMessage: ChatMessage = { sender: 'user', text: inputValue };
        const historyPayload: ChatHistoryMessage[] = [...messages.slice(-7), userMessage].map((msg) => ({
            sender: msg.sender,
            text: msg.text,
        }));

        addMessage(userMessage);
        setInputValue('');
        setIsLoading(true);

        try {
            const botResponse = await sendMessageToBot(userMessage.text, historyPayload, sessionId, token);
            if (botResponse.session_id && botResponse.session_id !== sessionId) {
                localStorage.setItem("chatbotSessionId", botResponse.session_id);
                setSessionId(botResponse.session_id);
            }
            addMessage({ sender: 'bot', text: botResponse.reply });
        } catch (error) {
            addMessage({ sender: 'bot', text: 'Sorry, I seem to be having trouble connecting. Please try again later.' });
            console.error("Chatbot API error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* The floating chat button */}
            {!isOpen && (
                <button
                    onClick={toggleChatbot}
                    className="fixed bottom-8 right-8 bg-accent hover:bg-accent-hover text-white rounded-full p-4 shadow-lg z-50 transition-transform transform hover:scale-110"
                    aria-label="Open chat"
                >
                    <FaCommentDots size={24} />
                </button>
            )}

            {/* The chat window */}
            <div className={`fixed bottom-8 right-8 w-full max-w-sm h-3/4 bg-white rounded-lg shadow-2xl flex flex-col z-50 transition-all duration-300 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
                {/* Header */}
                <div className="bg-primary text-white p-4 flex justify-between items-center rounded-t-lg">
                    <h3 className="font-heading text-lg">King-Kush Support</h3>
                    <button onClick={toggleChatbot} aria-label="Close chat">
                        <FaTimes size={20} />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex mb-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`rounded-lg px-4 py-2 max-w-xs lg:max-w-md ${msg.sender === 'user' ? 'bg-accent text-white' : 'bg-gray-200 text-gray-800'}`}>
                                <ReactMarkdown
                                  components={{
                                    a: ({node: _node, ...props}) => {
                                        void _node;
                                        return <a className="text-blue-500 hover:underline" {...props} />;
                                    }
                                  }}
                                >
                                  {msg.text}
                                </ReactMarkdown>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start mb-3">
                             <div className="rounded-lg px-4 py-2 bg-gray-200 text-gray-800">
                                ...
                             </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t border-gray-200">
                    <form onSubmit={handleSubmit} className="flex items-center">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Type your message..."
                            className="w-full px-4 py-2 border rounded-l-md focus:outline-none focus:ring-2 focus:ring-accent"
                            disabled={isLoading}
                        />
                        <button type="submit" className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-r-md disabled:bg-gray-400" disabled={isLoading}>
                            <FaPaperPlane />
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
};

export default ChatbotWidget;
