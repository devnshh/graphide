import { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import './styles.css';
import graphideLogo from './assets/graphide-logo.jpeg';
import { RepositoryGraphView } from './components/RepositoryGraphView';
import type { RepositorySelection } from './lib/repositoryGraph';
import { vscode } from './vscode';

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewType = 'analysis' | 'dashboard' | 'graph';
type BackendStatus = 'checking' | 'connected' | 'disconnected';

type JsonPrimitive = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

interface AgentOutput {
    agentName: string;
    markdownOutput: string;
    metadata?: JsonObject;
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

interface ValidationStatus {
    passed: boolean;
    errors: string[];
}

interface ScanResponse {
    status: 'success' | 'error' | 'processing';
    message?: string;
    agentOutputs?: AgentOutput[];
    patchProposals?: PatchProposal[];
    vulnerabilities?: VulnerabilityData[];
    validationStatus?: ValidationStatus;
}

interface ProgressStep {
    step: number;
    total: number;
    message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
    return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
    if (value === null) {
        return true;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return true;
    }
    if (Array.isArray(value)) {
        return value.every(isJsonValue);
    }
    return isJsonObject(value);
}

function isAgentOutput(value: unknown): value is AgentOutput {
    return isRecord(value)
        && typeof value.agentName === 'string'
        && typeof value.markdownOutput === 'string'
        && (!('metadata' in value) || value.metadata === undefined || isJsonObject(value.metadata));
}

function isPatchProposal(value: unknown): value is PatchProposal {
    return isRecord(value)
        && typeof value.code === 'string'
        && typeof value.description === 'string';
}

function isValidationStatus(value: unknown): value is ValidationStatus {
    return isRecord(value)
        && typeof value.passed === 'boolean'
        && Array.isArray(value.errors)
        && value.errors.every((error) => typeof error === 'string');
}

function isVulnerabilityData(value: unknown): value is VulnerabilityData {
    return isRecord(value)
        && typeof value.id === 'string'
        && (value.severity === 'critical'
            || value.severity === 'high'
            || value.severity === 'medium'
            || value.severity === 'low')
        && typeof value.type === 'string'
        && typeof value.file === 'string'
        && typeof value.line === 'number'
        && typeof value.status === 'string'
        && (!('cwe' in value) || value.cwe === undefined || typeof value.cwe === 'string')
        && (!('description' in value) || value.description === undefined || typeof value.description === 'string');
}

function isScanResponse(value: unknown): value is ScanResponse {
    if (!isRecord(value)
        || (value.status !== 'success' && value.status !== 'error' && value.status !== 'processing')) {
        return false;
    }

    if ('message' in value && value.message !== undefined && typeof value.message !== 'string') {
        return false;
    }
    if ('agentOutputs' in value
        && value.agentOutputs !== undefined
        && (!Array.isArray(value.agentOutputs) || !value.agentOutputs.every(isAgentOutput))) {
        return false;
    }
    if ('patchProposals' in value
        && value.patchProposals !== undefined
        && (!Array.isArray(value.patchProposals) || !value.patchProposals.every(isPatchProposal))) {
        return false;
    }
    if ('vulnerabilities' in value
        && value.vulnerabilities !== undefined
        && (!Array.isArray(value.vulnerabilities) || !value.vulnerabilities.every(isVulnerabilityData))) {
        return false;
    }
    if ('validationStatus' in value
        && value.validationStatus !== undefined
        && !isValidationStatus(value.validationStatus)) {
        return false;
    }
    return true;
}

function isAppWebviewMessage(value: unknown): value is
    | { type: 'fileSelected'; filePath: string; fileName: string }
    | { type: 'analysisProgress'; step: number; total: number; message: string }
    | { type: 'analysisResult'; data: ScanResponse }
    | { type: 'analysisError'; error: string }
    | { type: 'healthCheckResult'; status: BackendStatus } {
    if (!isRecord(value) || typeof value.type !== 'string') {
        return false;
    }

    switch (value.type) {
        case 'fileSelected':
            return typeof value.filePath === 'string' && typeof value.fileName === 'string';
        case 'analysisProgress':
            return typeof value.step === 'number' && typeof value.total === 'number' && typeof value.message === 'string';
        case 'analysisResult':
            return isScanResponse(value.data);
        case 'analysisError':
            return typeof value.error === 'string';
        case 'healthCheckResult':
            return value.status === 'checking' || value.status === 'connected' || value.status === 'disconnected';
        default:
            return false;
    }
}

// ─── Icons (SVG components) ─────────────────────────────────────────────────

const Icons = {
    bolt: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
    chart: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></svg>,
    graph: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" /></svg>,
    folder: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
    shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
    shieldAlert: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
    shieldCheck: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>,
    check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
    x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    xCircle: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>,
    arrowLeft: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>,
    chevronRight: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
    chevronDown: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>,
    cpu: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" /></svg>,
    wrench: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
    refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>,
    warning: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
    scatter: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m-7.07-15.07l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" /></svg>,
};

// ─── Markdown renderer ──────────────────────────────────────────────────────

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(md: string): string {
    return marked.parse(md) as string;
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
    const [activeView, setActiveView] = useState<ViewType>('analysis');
    const [selectedFile, setSelectedFile] = useState<RepositorySelection | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState<ProgressStep | null>(null);
    const [results, setResults] = useState<ScanResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');
    const [analysisHistory, setAnalysisHistory] = useState<ScanResponse[]>([]);
    const [selectedVuln, setSelectedVuln] = useState<VulnerabilityData | null>(null);

    const resultsEndRef = useRef<HTMLDivElement>(null);

    // ── Message handling ──────────────────────────────────────────────────────

    useEffect(() => {
        const handleMessage = (event: MessageEvent<unknown>) => {
            if (!isAppWebviewMessage(event.data)) {
                return;
            }

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
        setSelectedVuln(null);

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
        setSelectedVuln(null);
    }, []);

    // ── Derived data ──────────────────────────────────────────────────────────

    const allVulnerabilities: VulnerabilityData[] = analysisHistory
        .flatMap(r => r.vulnerabilities || []);

    const criticalCount = allVulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = allVulnerabilities.filter(v => v.severity === 'high').length;
    const totalCount = allVulnerabilities.length;
    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="app">
            <nav className="sidebar">
                <div className="sidebar-top">
                    <div className="brand-icon" aria-hidden="true">
                        <img className="brand-icon-image" src={graphideLogo} alt="Graphide logo" />
                    </div>
                    <NavButton icon={Icons.bolt} label="Analysis" view="analysis" active={activeView} onClick={setActiveView} />
                    <NavButton icon={Icons.chart} label="Dashboard" view="dashboard" active={activeView} onClick={setActiveView}
                        badge={totalCount > 0 ? totalCount : undefined} />
                    <NavButton icon={Icons.graph} label="Graph" view="graph" active={activeView} onClick={setActiveView} />
                </div>
                <div className="sidebar-bottom">
                    <div className={`status-indicator ${backendStatus}`} title={`Backend: ${backendStatus}`}>
                        <div className="status-dot" />
                    </div>
                </div>
            </nav>

            <main className="content">
                {activeView === 'analysis' && (
                    selectedVuln ? (
                        <VulnDetailView
                            vuln={selectedVuln}
                            results={results}
                            onBack={() => setSelectedVuln(null)}
                        />
                    ) : (
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
                            onSelectVuln={setSelectedVuln}
                            resultsEndRef={resultsEndRef}
                        />
                    )
                )}
                {activeView === 'dashboard' && (
                    <DashboardView
                        vulnerabilities={allVulnerabilities}
                        criticalCount={criticalCount}
                        highCount={highCount}
                        totalCount={totalCount}
                        scanCount={analysisHistory.length}
                        onSelectVuln={(v) => { setSelectedVuln(v); setActiveView('analysis'); }}
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

function AnalysisView({ selectedFile, isAnalyzing, progress, results, error, backendStatus, onSelectFile, onAnalyze, onClear, onSelectVuln, resultsEndRef }: {
    selectedFile: { path: string; name: string } | null;
    isAnalyzing: boolean;
    progress: ProgressStep | null;
    results: ScanResponse | null;
    error: string | null;
    backendStatus: string;
    onSelectFile: () => void;
    onAnalyze: () => void;
    onClear: () => void;
    onSelectVuln: (v: VulnerabilityData) => void;
    resultsEndRef: React.RefObject<HTMLDivElement | null>;
}) {
    return (
        <div className="analysis-view">
            <header className="view-header">
                <div className="header-left">
                    <h1 className="view-title">Vulnerability Analysis</h1>
                    <span className="view-subtitle">CPG-powered security scanner</span>
                </div>
                <div className="header-right">
                    <div className="header-status">
                        <div className={`header-status-dot ${backendStatus === 'connected' ? 'connected' : 'disconnected'}`} />
                        <span>{backendStatus === 'connected' ? 'Connected' : backendStatus === 'checking' ? 'Checking...' : 'Offline'}</span>
                    </div>
                </div>
            </header>

            <div className="toolbar">
                <button className="file-select-btn" onClick={onSelectFile} disabled={isAnalyzing}>
                    <span className="file-icon">{Icons.folder}</span>
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
                    className={`btn-primary`}
                    onClick={onAnalyze}
                    disabled={!selectedFile || isAnalyzing || backendStatus === 'disconnected'}
                    title={backendStatus === 'disconnected' ? 'Backend not connected' : ''}
                >
                    {isAnalyzing ? (
                        <><div className="spinner" /><span>Scanning...</span></>
                    ) : (
                        <>{Icons.bolt}<span>Run Scan</span></>
                    )}
                </button>

                {(results || error) && (
                    <button className="btn-ghost-icon" onClick={onClear} title="Clear results">{Icons.x}</button>
                )}
            </div>

            {backendStatus === 'disconnected' && (
                <div className="alert alert-warning">
                    {Icons.warning}
                    <span>Backend not reachable at localhost:8000. Start it with <code>python main.py</code></span>
                </div>
            )}

            {isAnalyzing && progress && (
                <div className="progress-section">
                    <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${(progress.step / progress.total) * 100}%` }} />
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
                    <span className="progress-text">Initializing analysis...</span>
                </div>
            )}

            <div className="results-area">
                {error && (
                    <div className="alert alert-error">
                        <strong>Analysis Failed</strong>
                        <pre>{error}</pre>
                    </div>
                )}

                {results && (
                    <>
                        <div className={`status-banner ${results.status === 'success' && results.vulnerabilities && results.vulnerabilities.length > 0 ? 'vulnerable' : results.status === 'error' ? 'error' : 'clean'}`}>
                            {results.status === 'success' && results.vulnerabilities && results.vulnerabilities.length > 0 && (
                                <><span className="banner-icon">{Icons.shieldAlert}</span><span>Found {results.vulnerabilities.length} issue{results.vulnerabilities.length !== 1 ? 's' : ''}</span></>
                            )}
                            {results.status === 'success' && (!results.vulnerabilities || results.vulnerabilities.length === 0) && (
                                <><span className="banner-icon">{Icons.check}</span><span>{results.message || 'No vulnerabilities detected'}</span></>
                            )}
                            {results.status === 'error' && (
                                <><span className="banner-icon">{Icons.xCircle}</span><span>{results.message || 'Analysis error'}</span></>
                            )}
                        </div>

                        {results.vulnerabilities && results.vulnerabilities.length > 0 && (
                            <div className="vuln-cards">
                                {results.vulnerabilities.map((v, i) => (
                                    <div
                                        key={i}
                                        className={`vuln-card severity-${v.severity}`}
                                        onClick={() => onSelectVuln(v)}
                                    >
                                        <div className="vuln-card-header">
                                            <span className={`severity-badge ${v.severity}`}>{v.severity}</span>
                                            <span className="vuln-id">{v.id}</span>
                                            <span className="vuln-card-arrow">{Icons.chevronRight}</span>
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

                        {results.agentOutputs && results.agentOutputs.map((output, i) => (
                            <CollapsibleAgentOutput key={i} output={output} />
                        ))}

                        {results.patchProposals && results.patchProposals.length > 0 && (
                            <div className="patch-section">
                                <div className="section-label">
                                    {Icons.wrench}
                                    <span>Suggested Patches</span>
                                </div>
                                {results.patchProposals.map((patch, i) => (
                                    <div key={i} className="patch-card">
                                        <div className="patch-header">{patch.description}</div>
                                        <pre className="patch-code"><code>{patch.code}</code></pre>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {!results && !error && !isAnalyzing && (
                    <div className="empty-state">
                        <div className="empty-icon">{Icons.shieldCheck}</div>
                        <p className="empty-title">Ready to analyze</p>
                        <p className="empty-hint">Select a file or directory, then click Run Scan to detect vulnerabilities using CPG-based analysis</p>
                    </div>
                )}

                <div ref={resultsEndRef} />
            </div>
        </div>
    );
}

// ─── Collapsible Agent Output ────────────────────────────────────────────────

function CollapsibleAgentOutput({ output }: { output: AgentOutput }) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className="agent-output">
            <div className="agent-header" onClick={() => setCollapsed(c => !c)}>
                <span className="agent-icon">{Icons.cpu}</span>
                <span className="agent-name">{output.agentName}</span>
                <span className={`agent-toggle ${collapsed ? 'collapsed' : ''}`}>
                    {Icons.chevronDown}
                </span>
            </div>
            <div className={`agent-body ${collapsed ? 'collapsed' : ''}`} style={collapsed ? { maxHeight: 0 } : { maxHeight: '2000px' }}>
                <div
                    className="markdown-body"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(output.markdownOutput) }}
                />
            </div>
        </div>
    );
}

// ─── Vulnerability Detail View ───────────────────────────────────────────────

function VulnDetailView({ vuln, results, onBack }: {
    vuln: VulnerabilityData;
    results: ScanResponse | null;
    onBack: () => void;
}) {
    const relevantPatch = results?.patchProposals?.[0];

    return (
        <div className="detail-view">
            <button className="detail-back" onClick={onBack}>
                {Icons.arrowLeft}
                <span>Back to issues</span>
            </button>

            <div className="detail-content">
                <div className="detail-badge-row">
                    <span className={`severity-badge ${vuln.severity}`}>{vuln.severity}</span>
                    <span className="vuln-id">{vuln.id}</span>
                </div>

                <h2 className="detail-title">
                    {vuln.type} in {vuln.file.split('/').pop()}
                </h2>
                <div className="detail-meta">
                    {vuln.cwe || 'Security Issue'} · Line {vuln.line}
                </div>

                {vuln.description && (
                    <div className="detail-section">
                        <div className="section-label">Description</div>
                        <div className="detail-section-body">{vuln.description}</div>
                    </div>
                )}

                <div className="detail-section">
                    <div className="section-label">Location</div>
                    <div className="detail-section-body">
                        <code style={{
                            fontFamily: 'var(--g-font-mono)',
                            fontSize: '11px',
                            background: 'rgba(255,255,255,0.04)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            display: 'inline-block',
                            color: 'var(--g-text-secondary)'
                        }}>
                            {vuln.file}:{vuln.line}
                        </code>
                    </div>
                </div>

                <div className="detail-section">
                    <div className="section-label">Attack Path</div>
                    <div className="taint-path">
                        <TaintNode type="source" label="Source" code={`User input at line ${vuln.line}`} showLine />
                        <TaintNode type="intermediate" label="Flow" code={`${vuln.type} in ${vuln.file.split('/').pop()}`} showLine />
                        <TaintNode type="sink" label="Sink" code={`Exploitable at ${vuln.file}:${vuln.line}`} showLine={false} />
                    </div>
                </div>

                {relevantPatch && (
                    <div className="detail-section">
                        <div className="section-label">Suggested Fix</div>
                        <div className="code-diff">
                            {relevantPatch.code.split('\n').map((line, i) => {
                                const cls = line.startsWith('-') ? 'removed' : line.startsWith('+') ? 'added' : 'context';
                                return <div key={i} className={`code-diff-line ${cls}`}>{line}</div>;
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="detail-actions">
                {relevantPatch && (
                    <button className="btn-primary btn-full">
                        {Icons.wrench}
                        <span>Apply Fix</span>
                    </button>
                )}
                <button className="btn-ghost btn-full" onClick={onBack}>
                    <span>Dismiss</span>
                </button>
            </div>
        </div>
    );
}

// ─── Taint Path Node ─────────────────────────────────────────────────────────

function TaintNode({ type, label, code, showLine }: {
    type: 'source' | 'intermediate' | 'sink';
    label: string;
    code: string;
    showLine: boolean;
}) {
    return (
        <div className="taint-node">
            <div className="taint-node-indicator">
                <div className={`taint-dot ${type}`} />
                {showLine && <div className="taint-line" />}
            </div>
            <div className="taint-node-content">
                <div className={`taint-node-label ${type}`}>{label}</div>
                <div className="taint-node-code">{code}</div>
            </div>
        </div>
    );
}

// ─── Dashboard View ──────────────────────────────────────────────────────────

function DashboardView({ vulnerabilities, criticalCount, highCount, totalCount, scanCount, onSelectVuln }: {
    vulnerabilities: VulnerabilityData[];
    criticalCount: number;
    highCount: number;
    totalCount: number;
    scanCount: number;
    onSelectVuln: (v: VulnerabilityData) => void;
}) {
    const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

    const filtered = vulnerabilities.filter(v => {
        if (filter === 'open') return v.status !== 'resolved' && v.status !== 'fixed';
        if (filter === 'resolved') return v.status === 'resolved' || v.status === 'fixed';
        return true;
    });

    const openCount = vulnerabilities.filter(v => v.status !== 'resolved' && v.status !== 'fixed').length;
    const resolvedCount = vulnerabilities.filter(v => v.status === 'resolved' || v.status === 'fixed').length;

    // Group by file
    const grouped = filtered.reduce<Record<string, VulnerabilityData[]>>((acc, v) => {
        const file = v.file.split('/').pop() || v.file;
        if (!acc[file]) acc[file] = [];
        acc[file].push(v);
        return acc;
    }, {});

    return (
        <div className="dashboard-view">
            <header className="view-header">
                <div className="header-left">
                    <h1 className="view-title">Security Dashboard</h1>
                    <span className="view-subtitle">{scanCount} scan{scanCount !== 1 ? 's' : ''} completed</span>
                </div>
            </header>

            <div className="segmented-control">
                <button className={`segment-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                    All ({totalCount})
                </button>
                <button className={`segment-btn ${filter === 'open' ? 'active' : ''}`} onClick={() => setFilter('open')}>
                    Open ({openCount})
                </button>
                <button className={`segment-btn ${filter === 'resolved' ? 'active' : ''}`} onClick={() => setFilter('resolved')}>
                    Resolved ({resolvedCount})
                </button>
            </div>

            <div className="metrics-grid">
                <MetricCard label="Critical" value={criticalCount} color="var(--g-critical)" />
                <MetricCard label="High" value={highCount} color="var(--g-high)" />
                <MetricCard label="Total" value={totalCount} color="var(--g-text-primary)" />
                <MetricCard label="Scans" value={scanCount} color="var(--g-accent)" />
            </div>

            {filtered.length > 0 ? (
                <div className="findings-list">
                    {Object.entries(grouped).map(([file, vulns]) => (
                        <div key={file}>
                            <div className="findings-group-header">
                                <span className="findings-group-title">{file}</span>
                                <span className="findings-group-count">{vulns.length} issue{vulns.length !== 1 ? 's' : ''}</span>
                            </div>
                            {vulns.map((v, i) => {
                                const isResolved = v.status === 'resolved' || v.status === 'fixed';
                                return (
                                    <div key={i} className="finding-row" onClick={() => onSelectVuln(v)}>
                                        <div className={`finding-dot ${v.severity}`} />
                                        <div className="finding-info">
                                            <div className="finding-type">{v.type}</div>
                                            <div className="finding-location">Line {v.line}{v.cwe ? ` · ${v.cwe}` : ''}</div>
                                        </div>
                                        <span className={`finding-status ${isResolved ? 'resolved' : ''}`}>
                                            {isResolved ? '✓' : 'Open'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
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

function GraphView({ selectedFile }: { selectedFile: RepositorySelection | null }) {
    return <RepositoryGraphView key={selectedFile?.path ?? 'repository-graph'} selectedFile={selectedFile} />;
}

export default App;
