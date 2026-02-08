import { Shield, AlertCircle, CheckCircle, Bug } from 'lucide-react';

export function DashboardView() {
    // Mock data for now, ideally passed via props or context from backend messages
    const stats = [
        { label: 'Critical Issues', value: '2', trend: '+1', color: 'text-rose-400', icon: AlertCircle },
        { label: 'Open Findings', value: '3', trend: '+3', color: 'text-blue-400', icon: Bug },
        { label: 'Fix Rate', value: '84%', trend: '+12%', color: 'text-emerald-400', icon: CheckCircle },
    ];

    const vulnerabilities = [
        { id: "VULN-2024-001", severity: "critical", type: "SQL Injection", file: "src/auth_service.ts", line: 14, status: "open" },
        { id: "VULN-2024-002", severity: "high", type: "XSS Vulnerability", file: "src/frontend/profile.tsx", line: 45, status: "in_review" },
        { id: "VULN-2024-005", severity: "critical", type: "Remote Code Execution", file: "src/server/upload.ts", line: 88, status: "open" }
    ];

    return (
        <div className="p-6 h-full overflow-y-auto custom-scrollbar">
            <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-2">
                    <Shield className="text-cyan-400" size={24} />
                    Security Findings
                </h2>
                <p className="text-gray-500 text-sm mt-1">Real-time vulnerability detection and triage</p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                {stats.map((stat, idx) => (
                    <div key={idx} className="bg-[#252526] p-4 rounded-lg border border-[#3e3e42]">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-gray-400 text-xs font-medium uppercase">{stat.label}</span>
                            <stat.icon size={16} className={stat.color} />
                        </div>
                        <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-xs text-gray-500 mt-1">
                            <span className="text-green-400">{stat.trend}</span> vs last scan
                        </div>
                    </div>
                ))}
            </div>

            {/* Vulnerabilities Table */}
            <div className="bg-[#252526] rounded-lg border border-[#3e3e42] overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[#2d2d30] text-gray-400 border-b border-[#3e3e42]">
                        <tr>
                            <th className="p-3 font-medium">Severity</th>
                            <th className="p-3 font-medium">ID</th>
                            <th className="p-3 font-medium">Type</th>
                            <th className="p-3 font-medium">Location</th>
                            <th className="p-3 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#3e3e42]">
                        {vulnerabilities.map((vuln) => (
                            <tr key={vuln.id} className="hover:bg-[#2a2d2e] transition-colors">
                                <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${vuln.severity === 'critical' ? 'bg-rose-900/30 text-rose-400 border border-rose-800/50' :
                                            vuln.severity === 'high' ? 'bg-orange-900/30 text-orange-400 border border-orange-800/50' :
                                                'bg-blue-900/30 text-blue-400 border border-blue-800/50'
                                        }`}>
                                        {vuln.severity}
                                    </span>
                                </td>
                                <td className="p-3 font-mono text-gray-300">{vuln.id}</td>
                                <td className="p-3 font-medium text-gray-200">{vuln.type}</td>
                                <td className="p-3 font-mono text-gray-400 text-xs">{vuln.file}:{vuln.line}</td>
                                <td className="p-3">
                                    <span className="capitalize text-gray-300">{vuln.status.replace('_', ' ')}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
