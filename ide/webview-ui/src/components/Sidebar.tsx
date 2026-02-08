import { Code2, Activity, GitGraph, Settings, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

type ViewType = 'editor' | 'dashboard' | 'graph' | 'settings';

interface SidebarProps {
    activeView: ViewType;
    onViewChange: (view: ViewType) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
    const navItems = [
        { id: 'editor' as ViewType, icon: Code2, label: 'Editor' },
        { id: 'dashboard' as ViewType, icon: Activity, label: 'Vulnerabilities' },
        { id: 'graph' as ViewType, icon: GitGraph, label: 'Dataflow Graph' },
    ];

    return (
        <aside className="w-12 bg-[#252526] border-r border-[#3e3e42] flex flex-col items-center py-4 gap-4 z-10 shadow-lg">
            <div className="mb-4 text-cyan-400">
                <Shield size={24} />
            </div>

            <nav className="flex flex-col gap-4 flex-1 w-full items-center">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onViewChange(item.id)}
                        className={`p-2 rounded-lg transition-colors relative group ${activeView === item.id ? 'text-white bg-[#37373d]' : 'text-gray-400 hover:text-white hover:bg-[#2a2d2e]'
                            }`}
                        title={item.label}
                    >
                        <item.icon size={20} />
                        {activeView === item.id && (
                            <motion.div
                                layoutId="active-indicator"
                                className="absolute left-0 top-2 bottom-2 w-1 bg-cyan-500 rounded-r"
                                initial={false}
                                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            />
                        )}
                    </button>
                ))}
            </nav>

            <button
                onClick={() => onViewChange('settings')}
                className={`p-2 rounded-lg transition-colors text-gray-400 hover:text-white hover:bg-[#2a2d2e] ${activeView === 'settings' ? 'bg-[#37373d] text-white' : ''
                    }`}
                title="Settings"
            >
                <Settings size={20} />
            </button>
        </aside>
    );
}
