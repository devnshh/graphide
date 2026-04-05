import { useCallback, useEffect, useMemo, useState } from 'react';
import { RepositorySigmaGraph } from './RepositorySigmaGraph';
import {
    DEFAULT_REPOSITORY_GRAPH_FILTERS,
} from '../lib/repositoryGraph';
import type { RepositoryGraphFilters, RepositoryGraphResponse } from '../lib/repositoryGraph';
import { vscode } from '../vscode';

function FilterToggle({
    active,
    label,
    onClick,
}: {
    active: boolean;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            className={`graph-filter-chip ${active ? 'active' : ''}`}
            onClick={onClick}
            type="button"
        >
            {label}
        </button>
    );
}

export function RepositoryGraphView({
    selectedFile,
}: {
    selectedFile: { path: string; name: string } | null;
}) {
    const [graph, setGraph] = useState<RepositoryGraphResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<RepositoryGraphFilters>(DEFAULT_REPOSITORY_GRAPH_FILTERS);
    const [query, setQuery] = useState('');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [inspectorOpen, setInspectorOpen] = useState(false);

    const loadGraph = useCallback(() => {
        if (!selectedFile || loading) {
            return;
        }
        setLoading(true);
        setError(null);
        vscode.postMessage({
            type: 'getRepositoryGraph',
            targetPath: selectedFile.path,
        });
    }, [loading, selectedFile]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type !== 'repositoryGraphData') {
                return;
            }

            setLoading(false);
            const payload = message.data as RepositoryGraphResponse & { detail?: string };
            if (!payload || payload.status === 'error') {
                setGraph(null);
                setError(payload?.detail || payload?.truncatedReason || 'Failed to load repository graph.');
                return;
            }

            setGraph(payload);
            setSelectedNodeId(null);
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        setSelectedNodeId(null);
        setQuery('');
        setError(null);
        setInspectorOpen(false);
    }, [selectedFile?.path]);

    useEffect(() => {
        if (selectedNodeId) {
            setInspectorOpen(true);
        }
    }, [selectedNodeId]);

    const selectedNode = useMemo(() => {
        if (!graph || !selectedNodeId) {
            return null;
        }
        return graph.nodes.find((node) => node.id === selectedNodeId) || null;
    }, [graph, selectedNodeId]);

    const searchResults = useMemo(() => {
        if (!graph || !query.trim()) {
            return [];
        }
        const term = query.trim().toLowerCase();
        return graph.nodes
            .filter((node) => {
                const relativePath = node.properties.relativePath || '';
                return node.properties.name.toLowerCase().includes(term)
                    || relativePath.toLowerCase().includes(term)
                    || node.label.toLowerCase().includes(term);
            })
            .slice(0, 10);
    }, [graph, query]);

    const toggleFilter = useCallback((key: keyof RepositoryGraphFilters) => {
        setFilters((current) => ({
            ...current,
            [key]: !current[key],
        }));
    }, []);

    return (
        <div className="graph-view repository-graph-view">
            <header className="view-header">
                <div className="header-left">
                    <h1 className="view-title">Repository Graph</h1>
                    <span className="view-subtitle">Standalone code knowledge graph explorer</span>
                </div>
                <div className="header-right">
                    <button
                        className="graph-panel-toggle"
                        onClick={() => setInspectorOpen((current) => !current)}
                        type="button"
                    >
                        {inspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
                    </button>
                </div>
            </header>

            <div className="repository-graph-toolbar">
                <button
                    className="btn-primary"
                    onClick={loadGraph}
                    disabled={!selectedFile || loading}
                    type="button"
                >
                    {loading ? 'Building Graph...' : 'Load Repository Graph'}
                </button>

                <input
                    className="graph-search-input"
                    disabled={!graph}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search files, folders, or symbols"
                    type="text"
                    value={query}
                />
            </div>

            <div className="repository-graph-filters">
                <FilterToggle active={filters.structure} label="Structure" onClick={() => toggleFilter('structure')} />
                <FilterToggle active={filters.files} label="Files" onClick={() => toggleFilter('files')} />
                <FilterToggle active={filters.symbols} label="Symbols" onClick={() => toggleFilter('symbols')} />
                <FilterToggle active={filters.containsEdges} label="Contains" onClick={() => toggleFilter('containsEdges')} />
                <FilterToggle active={filters.definesEdges} label="Defines" onClick={() => toggleFilter('definesEdges')} />
                <FilterToggle active={filters.importEdges} label="Imports" onClick={() => toggleFilter('importEdges')} />
            </div>

            {selectedFile && (
                <div className="graph-meta-row">
                    <span className="graph-meta-pill">Scope: {selectedFile.name}</span>
                    {graph && <span className="graph-meta-pill">Root: {graph.repoRoot.split('/').pop()}</span>}
                    {graph && (
                        <span className="graph-meta-pill">
                            {graph.nodeCount} nodes · {graph.edgeCount} edges
                        </span>
                    )}
                </div>
            )}

            {graph && (
                <div className="graph-meta-row graph-stats-row">
                    <span className="graph-stat-block">{graph.counts.folders} folders</span>
                    <span className="graph-stat-block">{graph.counts.files} files</span>
                    <span className="graph-stat-block">{graph.counts.symbols} symbols</span>
                    <span className="graph-stat-block">{graph.counts.imports} imports</span>
                    <span className="graph-stat-block">
                        Mode: {graph.symbolMode === 'full' ? 'full repo graph' : 'file graph only'}
                    </span>
                </div>
            )}

            {graph?.truncated && (
                <div className="graph-warning-banner">
                    {graph.truncatedReason}
                </div>
            )}

            {query.trim() && searchResults.length > 0 && (
                <div className="graph-search-results">
                    {searchResults.map((node) => (
                        <button
                            className={`graph-search-result ${selectedNodeId === node.id ? 'active' : ''}`}
                            key={node.id}
                            onClick={() => setSelectedNodeId(node.id)}
                            type="button"
                        >
                            <span className="graph-search-result-title">{node.properties.name}</span>
                            <span className="graph-search-result-meta">
                                {node.label}
                                {node.properties.relativePath ? ` · ${node.properties.relativePath}` : ''}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <div className={`repository-graph-layout ${inspectorOpen ? 'inspector-open' : 'inspector-closed'}`}>
                <div className="repository-graph-stage">
                    <div className="repository-graph-stage-chrome">
                        <div className="graph-legend">
                            <span className="graph-legend-item project">Project</span>
                            <span className="graph-legend-item folder">Folder</span>
                            <span className="graph-legend-item file">File</span>
                            <span className="graph-legend-item symbol">Symbol</span>
                        </div>
                        <div className="graph-stage-caption">
                            Zoom, pan, search, then click any node to inspect it.
                        </div>
                    </div>
                    {graph ? (
                        <RepositorySigmaGraph
                            filters={filters}
                            graphData={graph}
                            inspectorOpen={inspectorOpen}
                            onSelectNode={setSelectedNodeId}
                            selectedNodeId={selectedNodeId}
                        />
                    ) : (
                        <div className="empty-state">
                            <p className="empty-title">No repository graph loaded</p>
                            <p className="empty-hint">
                                {selectedFile
                                    ? 'Load the graph to explore folders, files, symbols, and local imports.'
                                    : 'Select a file or repository folder first.'}
                            </p>
                        </div>
                    )}
                </div>

                <aside className={`repository-graph-sidecard ${inspectorOpen ? 'open' : 'closed'}`}>
                    <button
                        className="graph-sidecard-toggle"
                        onClick={() => setInspectorOpen((current) => !current)}
                        type="button"
                    >
                        {inspectorOpen ? '>' : '<'}
                    </button>
                    {error ? (
                        <div className="graph-sidecard-section">
                            <p className="graph-sidecard-title">Error</p>
                            <p className="graph-sidecard-text">{error}</p>
                        </div>
                    ) : selectedNode ? (
                        <>
                            <div className="graph-sidecard-section">
                                <p className="graph-sidecard-title">{selectedNode.properties.name}</p>
                                <p className="graph-sidecard-chip">{selectedNode.label}</p>
                            </div>
                            <div className="graph-sidecard-section">
                                <p className="graph-sidecard-label">Path</p>
                                <p className="graph-sidecard-text">{selectedNode.properties.relativePath || selectedNode.properties.filePath}</p>
                            </div>
                            {selectedNode.properties.startLine && (
                                <div className="graph-sidecard-section">
                                    <p className="graph-sidecard-label">Location</p>
                                    <p className="graph-sidecard-text">
                                        Line {selectedNode.properties.startLine}
                                        {selectedNode.properties.endLine && selectedNode.properties.endLine !== selectedNode.properties.startLine
                                            ? `-${selectedNode.properties.endLine}`
                                            : ''}
                                    </p>
                                </div>
                            )}
                            {selectedNode.properties.language && (
                                <div className="graph-sidecard-section">
                                    <p className="graph-sidecard-label">Language</p>
                                    <p className="graph-sidecard-text">{selectedNode.properties.language}</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="graph-sidecard-section">
                            <p className="graph-sidecard-title">Inspector</p>
                            <p className="graph-sidecard-text">
                                Click a node or use search to inspect files, folders, and symbols.
                            </p>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
