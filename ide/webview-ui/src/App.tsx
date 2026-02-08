import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { EditorView } from './views/EditorView';
import { DashboardView } from './views/DashboardView';
import { GraphView } from './views/GraphView';
import './App.css';

type ViewType = 'editor' | 'dashboard' | 'graph' | 'settings';

function App() {
    const [activeView, setActiveView] = useState<ViewType>('editor');

    // Handle messages from VS Code extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            // Handle messages (e.g., specific navigation request or data updates)
            if (message.command === 'navigate') {
                setActiveView(message.view);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <div className="flex h-screen bg-[#1e1e1e] text-white font-sans overflow-hidden">
            {/* Sidebar Navigation */}
            <Sidebar activeView={activeView} onViewChange={setActiveView} />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Header (Optional, if needed for title) */}

                {/* Viewport */}
                <div className="flex-1 overflow-hidden relative">
                    {activeView === 'editor' && <EditorView />}
                    {activeView === 'dashboard' && <DashboardView />}
                    {activeView === 'graph' && <GraphView />}
                    {activeView === 'settings' && (
                        <div className="p-4 text-gray-400">Settings view not implemented yet.</div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default App;
