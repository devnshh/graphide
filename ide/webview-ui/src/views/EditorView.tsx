import { useState, useEffect, useRef } from 'react';
import { Play, Trash2, User, Bot, AlertTriangle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
    role: 'user' | 'system';
    content: string;
    type: 'normal' | 'error' | 'warning';
    timestamp: number;
}

// VS Code API type definition
declare global {
    interface Window {
        vscode: any;
    }
}

export function EditorView() {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'system', content: 'Welcome to Graphide 2.0. Select a file to analyze.', type: 'normal', timestamp: Date.now() }
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // VS Code API Wrapper
    const vscode = window.vscode || {
        postMessage: (msg: any) => console.log('Mock VSCode PostMessage:', msg),
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'analysisStart':
                    setIsLoading(true);
                    setMessages(prev => [...prev, { role: 'system', content: `Creating analysis task for ${message.file}...`, type: 'normal', timestamp: Date.now() }]);
                    break;
                case 'analysisLog':
                    setMessages(prev => [...prev, { role: 'system', content: message.message, type: message.severity || 'normal', timestamp: Date.now() }]);
                    break;
                case 'analysisComplete':
                    setIsLoading(false);
                    setMessages(prev => [...prev, { role: 'system', content: 'Analysis completed.', type: 'normal', timestamp: Date.now() }]);
                    break;
                case 'analysisError':
                    setIsLoading(false);
                    setMessages(prev => [...prev, { role: 'system', content: `Error: ${message.message}`, type: 'error', timestamp: Date.now() }]);
                    break;
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleAnalyze = () => {
        vscode.postMessage({ command: 'analyze' });
    };

    const handleClear = () => {
        setMessages([]);
        vscode.postMessage({ command: 'clear' });
    };

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e]">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                <AnimatePresence initial={false}>
                    {messages.map((msg, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-blue-600' :
                                        msg.type === 'error' ? 'bg-red-600' :
                                            msg.type === 'warning' ? 'bg-yellow-600' : 'bg-gray-700'
                                    }`}
                            >
                                {msg.role === 'user' ? <User size={16} /> :
                                    msg.type === 'error' ? <XCircle size={16} /> :
                                        msg.type === 'warning' ? <AlertTriangle size={16} /> : <Bot size={16} />}
                            </div>

                            <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className="text-xs text-gray-500 mb-1">
                                    {msg.role === 'user' ? 'You' : 'Analysis Result'}
                                </div>
                                <div
                                    className={`p-3 rounded-lg text-sm whitespace-pre-wrap font-mono ${msg.role === 'user' ? 'bg-blue-600/20 border border-blue-500/30' :
                                            msg.type === 'error' ? 'bg-red-900/20 border border-red-500/30 text-red-200' :
                                                msg.type === 'warning' ? 'bg-yellow-900/20 border border-yellow-500/30 text-yellow-200' :
                                                    'bg-[#252526] border border-[#3e3e42] text-gray-200'
                                        }`}
                                >
                                    {msg.content}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-3 items-center text-gray-400 p-2"
                    >
                        <div className="w-4 h-4 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                        <span className="text-sm">Processing analysis...</span>
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Toolbar */}
            <div className="p-4 border-t border-[#3e3e42] bg-[#252526] flex gap-3">
                <button
                    onClick={handleAnalyze}
                    disabled={isLoading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                >
                    {isLoading ? (
                        <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Play size={16} />
                    )}
                    Analyze Files
                </button>

                <button
                    onClick={handleClear}
                    className="p-2 text-gray-400 hover:text-white hover:bg-[#3e3e42] rounded transition-colors"
                    title="Clear History"
                >
                    <Trash2 size={20} />
                </button>
            </div>
        </div>
    );
}
