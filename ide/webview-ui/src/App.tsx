import { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { InteractiveNvlWrapper } from '@neo4j-nvl/react';
import type { Node, Relationship } from '@neo4j-nvl/base';
import './styles.css';

// VS Code API
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): any;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewType = 'analysis' | 'dashboard' | 'graph';

interface AgentOutput {
    agentName: string;
    markdownOutput: string;
    metadata?: Record<string, any>;
}

interface VulnerabilityData {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    file: string;
    line: number;
    status: string;
    cwe?: string;
    description?: string;
}

interface PatchProposal {
    code: string;
    description: string;
}

interface ScanResponse {
    status: string;
    message?: string;
    agentOutputs?: AgentOutput[];
    patchProposals?: PatchProposal[];
    vulnerabilities?: VulnerabilityData[];
    validationStatus?: { passed: boolean; errors: string[] };
}

interface ProgressStep {
    step: number;
    total: number;
    message: string;
}

// ─── Markdown renderer ──────────────────────────────────────────────────────

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(md: string): string {
    return marked.parse(md) as string;
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
    // Navigation
    const [activeView, setActiveView] = useState<ViewType>('analysis');

    // File selection
    const [selectedFile, setSelectedFile] = useState<{ path: string; name: string } | null>(null);

    // Analysis state
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState<ProgressStep | null>(null);
    const [results, setResults] = useState<ScanResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Backend status
    const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

    // History
    const [analysisHistory, setAnalysisHistory] = useState<ScanResponse[]>([]);

    const resultsEndRef = useRef<HTMLDivElement>(null);

    // ── Message handling ──────────────────────────────────────────────────────

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const msg = event.data;
            switch (msg.type) {
                case 'fileSelected':
                    setSelectedFile({ path: msg.filePath, name: msg.fileName });
                    setError(null);
                    break;

                case 'analysisProgress':
                    setProgress({ step: msg.step, total: msg.total, message: msg.message });
                    break;

                case 'analysisResult':
                    setIsAnalyzing(false);
                    setProgress(null);
                    setResults(msg.data);
                    if (msg.data) {
                        setAnalysisHistory(prev => [msg.data, ...prev]);
                    }
                    break;

                case 'analysisError':
                    setIsAnalyzing(false);
                    setProgress(null);
                    setError(msg.error);
                    break;

                case 'healthCheckResult':
                    setBackendStatus(msg.status);
                    break;
            }
        };
        window.addEventListener('message', handleMessage);

        // Check backend on mount
        vscode.postMessage({ type: 'healthCheck' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [results]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleSelectFile = useCallback(() => {
        vscode.postMessage({ type: 'selectFiles' });
    }, []);

    const handleAnalyze = useCallback(() => {
        if (!selectedFile || isAnalyzing) return;
        setIsAnalyzing(true);
        setError(null);
        setResults(null);

        // Detect language from extension
        const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
            c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
            py: 'python', js: 'javascript', ts: 'typescript',
            java: 'java', go: 'go', rs: 'rust', rb: 'ruby',
        };
        const language = langMap[ext] || 'c';

        vscode.postMessage({
            type: 'analyzeFiles',
            filePath: selectedFile.path,
            language
        });
    }, [selectedFile, isAnalyzing]);

    const handleClear = useCallback(() => {
        setResults(null);
        setError(null);
        setProgress(null);
        setSelectedFile(null);
    }, []);

    // ── Derived data ──────────────────────────────────────────────────────────

    // Aggregate vulnerabilities from all history
    const allVulnerabilities: VulnerabilityData[] = analysisHistory
        .flatMap(r => r.vulnerabilities || []);

    const criticalCount = allVulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = allVulnerabilities.filter(v => v.severity === 'high').length;
    const totalCount = allVulnerabilities.length;
    const cleanCount = analysisHistory.filter(r => r.status === 'success' && (!r.vulnerabilities || r.vulnerabilities.length === 0)).length;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="app">
            {/* Sidebar Navigation */}
            <nav className="sidebar">
                <div className="sidebar-top">
                    <div className="brand-icon">G</div>
                    <NavButton icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>} label="Analysis" view="analysis" active={activeView} onClick={setActiveView} />
                    <NavButton icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></svg>} label="Dashboard" view="dashboard" active={activeView} onClick={setActiveView}
                        badge={totalCount > 0 ? totalCount : undefined} />
                    <NavButton icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" /></svg>} label="Graph" view="graph" active={activeView} onClick={setActiveView} />
                </div>
                <div className="sidebar-bottom">
                    <div className={`status-indicator ${backendStatus}`} title={`Backend: ${backendStatus}`}>
                        <div className="status-dot" />
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="content">
                {activeView === 'analysis' && (
                    <AnalysisView
                        selectedFile={selectedFile}
                        isAnalyzing={isAnalyzing}
                        progress={progress}
                        results={results}
                        error={error}
                        backendStatus={backendStatus}
                        onSelectFile={handleSelectFile}
                        onAnalyze={handleAnalyze}
                        onClear={handleClear}
                        resultsEndRef={resultsEndRef}
                    />
                )}
                {activeView === 'dashboard' && (
                    <DashboardView
                        vulnerabilities={allVulnerabilities}
                        criticalCount={criticalCount}
                        highCount={highCount}
                        totalCount={totalCount}
                        cleanCount={cleanCount}
                        scanCount={analysisHistory.length}
                    />
                )}
                {activeView === 'graph' && <GraphView selectedFile={selectedFile} />}
            </main>
        </div>
    );
}

// ─── NavButton ───────────────────────────────────────────────────────────────

function NavButton({ icon, label, view, active, onClick, badge }: {
    icon: React.ReactNode; label: string; view: ViewType;
    active: ViewType; onClick: (v: ViewType) => void;
    badge?: number;
}) {
    return (
        <button
            className={`nav-btn ${active === view ? 'active' : ''}`}
            onClick={() => onClick(view)}
            title={label}
        >
            <span className="nav-icon">{icon}</span>
            {badge !== undefined && badge > 0 && <span className="nav-badge">{badge}</span>}
        </button>
    );
}

// ─── Analysis View ───────────────────────────────────────────────────────────

function AnalysisView({ selectedFile, isAnalyzing, progress, results, error, backendStatus, onSelectFile, onAnalyze, onClear, resultsEndRef }: {
    selectedFile: { path: string; name: string } | null;
    isAnalyzing: boolean;
    progress: ProgressStep | null;
    results: ScanResponse | null;
    error: string | null;
    backendStatus: string;
    onSelectFile: () => void;
    onAnalyze: () => void;
    onClear: () => void;
    resultsEndRef: React.RefObject<HTMLDivElement | null>;
}) {
    return (
        <div className="analysis-view">
            {/* Header */}
            <header className="view-header">
                <div className="header-left">
                    <h1 className="view-title">Vulnerability Analysis</h1>
                    <span className="view-subtitle">CPG-powered code security scanner</span>
                </div>
            </header>

            {/* File Selection + Action */}
            <div className="toolbar">
                <button className="file-select-btn" onClick={onSelectFile} disabled={isAnalyzing}>
                    <span className="file-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg></span>
                    {selectedFile ? (
                        <span className="file-chip">
                            <span className="chip-name">{selectedFile.name}</span>
                            <span className="chip-path" title={selectedFile.path}>
                                {selectedFile.path.length > 40
                                    ? '...' + selectedFile.path.slice(-37)
                                    : selectedFile.path
                                }
                            </span>
                        </span>
                    ) : (
                        <span className="file-placeholder">Select file or directory...</span>
                    )}
                </button>

                <button
                    className={`analyze-btn ${isAnalyzing ? 'loading' : ''}`}
                    onClick={onAnalyze}
                    disabled={!selectedFile || isAnalyzing || backendStatus === 'disconnected'}
                    title={backendStatus === 'disconnected' ? 'Backend not connected' : ''}
                >
                    {isAnalyzing ? (
                        <><div className="spinner" /><span>Analyzing...</span></>
                    ) : (
                        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg><span>Analyze</span></>
                    )}
                </button>

                {(results || error) && (
                    <button className="clear-btn" onClick={onClear} title="Clear results"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                )}
            </div>

            {/* Backend warning */}
            {backendStatus === 'disconnected' && (
                <div className="alert alert-warning">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> Backend not reachable at localhost:8000. Start it with <code>python main.py</code>
                </div>
            )}

            {/* Progress */}
            {isAnalyzing && progress && (
                <div className="progress-section">
                    <div className="progress-bar-track">
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${(progress.step / progress.total) * 100}%` }}
                        />
                    </div>
                    <span className="progress-text">
                        Step {progress.step}/{progress.total}: {progress.message}
                    </span>
                </div>
            )}
            {isAnalyzing && !progress && (
                <div className="progress-section">
                    <div className="progress-bar-track">
                        <div className="progress-bar-fill indeterminate" />
                    </div>
                    <span className="progress-text">Waiting for backend response...</span>
                </div>
            )}

            {/* Results Area */}
            <div className="results-area">
                {error && (
                    <div className="alert alert-error">
                        <strong>Analysis Failed</strong>
                        <pre>{error}</pre>
                    </div>
                )}

                {results && (
                    <>
                        {/* Status Banner */}
                        <div className={`status-banner ${results.status === 'success' && results.vulnerabilities && results.vulnerabilities.length > 0 ? 'vulnerable' : results.status === 'error' ? 'error' : 'clean'}`}>
                            {results.status === 'success' && results.vulnerabilities && results.vulnerabilities.length > 0 && (
                                <><span className="banner-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></span><span>Found {results.vulnerabilities.length} vulnerability issue(s)</span></>
                            )}
                            {results.status === 'success' && (!results.vulnerabilities || results.vulnerabilities.length === 0) && (
                                <><span className="banner-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></span><span>{results.message || 'No vulnerabilities detected'}</span></>
                            )}
                            {results.status === 'error' && (
                                <><span className="banner-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg></span><span>{results.message || 'Analysis error'}</span></>
                            )}
                        </div>

                        {/* Vulnerability Cards */}
                        {results.vulnerabilities && results.vulnerabilities.length > 0 && (
                            <div className="vuln-cards">
                                {results.vulnerabilities.map((v, i) => (
                                    <div key={i} className={`vuln-card severity-${v.severity}`}>
                                        <div className="vuln-card-header">
                                            <span className={`severity-badge ${v.severity}`}>{v.severity}</span>
                                            <span className="vuln-id">{v.id}</span>
                                        </div>
                                        <div className="vuln-type">{v.type}{v.cwe ? ` (${v.cwe})` : ''}</div>
                                        {v.description && <div className="vuln-desc">{v.description}</div>}
                                        <div className="vuln-location">
                                            <code>{v.file}:{v.line}</code>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Agent Outputs (Markdown) */}
                        {results.agentOutputs && results.agentOutputs.map((output, i) => (
                            <div key={i} className="agent-output">
                                <div className="agent-header">
                                    <span className="agent-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" /></svg></span>
                                    <span className="agent-name">{output.agentName}</span>
                                </div>
                                <div
                                    className="markdown-body"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(output.markdownOutput) }}
                                />
                            </div>
                        ))}

                        {/* Patch Proposals */}
                        {results.patchProposals && results.patchProposals.length > 0 && (
                            <div className="patch-section">
                                <h3 className="section-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>Suggested Patches</h3>
                                {results.patchProposals.map((patch, i) => (
                                    <div key={i} className="patch-card">
                                        <div className="patch-header">
                                            <span>{patch.description}</span>
                                        </div>
                                        <pre className="patch-code"><code>{patch.code}</code></pre>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {!results && !error && !isAnalyzing && (
                    <div className="empty-state">
                        <div className="empty-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <path d="M9 12l2 2 4-4" />
                            </svg>
                        </div>
                        <p className="empty-title">Ready to analyze</p>
                        <p className="empty-hint">Select a file or directory, then click Analyze to scan for vulnerabilities using CPG-based analysis</p>
                    </div>
                )}

                <div ref={resultsEndRef} />
            </div>
        </div>
    );
}

// ─── Dashboard View ──────────────────────────────────────────────────────────

function DashboardView({ vulnerabilities, criticalCount, highCount, totalCount, cleanCount: _cleanCount, scanCount }: {
    vulnerabilities: VulnerabilityData[];
    criticalCount: number;
    highCount: number;
    totalCount: number;
    cleanCount: number;
    scanCount: number;
}) {
    return (
        <div className="dashboard-view">
            <header className="view-header">
                <h1 className="view-title">Security Dashboard</h1>
                <span className="view-subtitle">Real-time vulnerability detection and triage</span>
            </header>

            {/* Metrics */}
            <div className="metrics-grid">
                <MetricCard label="Critical" value={criticalCount} color="#ef4444" />
                <MetricCard label="High" value={highCount} color="#f97316" />
                <MetricCard label="Total Findings" value={totalCount} color="#22d3ee" />
                <MetricCard label="Scans Run" value={scanCount} color="#818cf8" />
            </div>

            {/* Vulnerability Table */}
            {vulnerabilities.length > 0 ? (
                <div className="table-container">
                    <table className="vuln-table">
                        <thead>
                            <tr>
                                <th>Severity</th>
                                <th>ID</th>
                                <th>Type</th>
                                <th>Location</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vulnerabilities.map((v, i) => (
                                <tr key={i}>
                                    <td>
                                        <span className={`severity-badge ${v.severity}`}>{v.severity}</span>
                                    </td>
                                    <td className="mono">{v.id}</td>
                                    <td>
                                        <span className="vuln-type-cell">{v.type}</span>
                                        {v.cwe && <span className="cwe-tag">{v.cwe}</span>}
                                    </td>
                                    <td className="mono">{v.file}:{v.line}</td>
                                    <td className="status-cell">{v.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="empty-state">
                    <p className="empty-title">No findings yet</p>
                    <p className="empty-hint">Run an analysis to populate the dashboard</p>
                </div>
            )}
        </div>
    );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="metric-card">
            <span className="metric-value" style={{ color }}>{value}</span>
            <span className="metric-label">{label}</span>
        </div>
    );
}

// ─── Graph View ──────────────────────────────────────────────────────────────

function GraphView({ selectedFile }: { selectedFile: { path: string; name: string } | null }) {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [rels, setRels] = useState<Relationship[]>([]);
    const [loading, setLoading] = useState(false);
    const [graphInfo, setGraphInfo] = useState<{ nodeCount: number; edgeCount: number } | null>(null);

    const loadGraph = useCallback((filePath?: string) => {
        setLoading(true);
        vscode.postMessage({
            type: 'getGraph',
            filePath: filePath || undefined
        });
    }, []);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const msg = event.data;
            if (msg.type === 'graphData') {
                setLoading(false);
                const data = msg.data;
                if (data && data.nodes) {
                    setGraphInfo({ nodeCount: data.nodeCount || 0, edgeCount: data.edgeCount || 0 });

                    const nvlNodes: Node[] = data.nodes.map((n: any) => ({
                        id: n.id,
                        captions: [{ value: n.caption || n.code || n.id }],
                        color: n.type === 'source' ? '#ef4444'
                            : n.type === 'sink' ? '#f97316'
                                : '#22d3ee',
                        size: n.type === 'source' || n.type === 'sink' ? 30 : 20,
                    }));

                    const nvlRels: Relationship[] = data.relationships.map((r: any) => ({
                        id: r.id,
                        from: r.from,
                        to: r.to,
                        captions: [{ value: r.caption || 'FLOWS_TO' }],
                    }));

                    setNodes(nvlNodes);
                    setRels(nvlRels);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <div className="graph-view">
            <header className="view-header">
                <div className="header-left">
                    <h1 className="view-title">Dataflow Graph</h1>
                    <span className="view-subtitle">Neo4j-powered taint flow visualization</span>
                </div>
            </header>

            {/* Graph Controls */}
            <div className="graph-toolbar">
                <button
                    className="graph-load-btn"
                    onClick={() => loadGraph(selectedFile?.path)}
                    disabled={loading}
                >
                    {loading ? (
                        <><div className="spinner" /><span>Loading...</span></>
                    ) : (
                        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg><span>Load Graph</span></>
                    )}
                </button>
                {selectedFile && (
                    <span className="graph-file-label">{selectedFile.name}</span>
                )}
                {graphInfo && (
                    <span className="graph-stats">
                        {graphInfo.nodeCount} nodes · {graphInfo.edgeCount} edges
                    </span>
                )}
            </div>

            {/* Graph Canvas */}
            <div className="graph-canvas">
                {nodes.length > 0 ? (
                    <InteractiveNvlWrapper
                        nodes={nodes}
                        rels={rels}
                        nvlOptions={{
                            allowDynamicMinZoom: true,
                            layout: 'forceDirected',
                            relationshipThreshold: 0.55,
                        }}
                    />
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12 2v4m0 12v4m-7.07-15.07l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                            </svg>
                        </div>
                        <p className="empty-title">No graph data</p>
                        <p className="empty-hint">
                            {selectedFile
                                ? 'Click "Load Graph" to fetch CPG data from Neo4j'
                                : 'Run an analysis first to populate graph data'
                            }
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
