import { useCallback, useEffect, useMemo, useRef } from 'react';
import Sigma from 'sigma';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import noverlap from 'graphology-layout-noverlap';
import EdgeCurveProgram from '@sigma/edge-curve';
import { getNodeCategory, getNodeColor, getNodeSize } from '../lib/repositoryGraph';
import type { RepositoryGraphFilters, RepositoryGraphNode, RepositoryGraphResponse } from '../lib/repositoryGraph';

interface SigmaNodeAttributes {
    x: number;
    y: number;
    size: number;
    color: string;
    label: string;
    nodeType: RepositoryGraphNode['label'];
    filePath: string;
    relativePath?: string;
    startLine?: number;
    endLine?: number;
    hidden?: boolean;
    zIndex?: number;
}

interface SigmaEdgeAttributes {
    size: number;
    color: string;
    relationType: string;
    type?: string;
    hidden?: boolean;
    zIndex?: number;
}

function seededPosition(seed: string, scale: number): { x: number; y: number } {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash << 5) - hash + seed.charCodeAt(index);
        hash |= 0;
    }
    const x = Math.sin(hash) * scale;
    const y = Math.cos(hash * 1.7) * scale;
    return { x, y };
}

function buildSigmaGraph(
    graphData: RepositoryGraphResponse,
    filters: RepositoryGraphFilters,
): Graph<SigmaNodeAttributes, SigmaEdgeAttributes> {
    const graph = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes>();
    const visibleNodeIds = new Set<string>();
    const scale = Math.max(220, Math.sqrt(graphData.nodes.length) * 22);

    for (const node of graphData.nodes) {
        const category = getNodeCategory(node.label);
        if ((category === 'structure' && !filters.structure)
            || (category === 'files' && !filters.files)
            || (category === 'symbols' && !filters.symbols)) {
            continue;
        }

        const depth = node.properties.relativePath ? node.properties.relativePath.split('/').length : 1;
        const basePosition = seededPosition(node.id, scale);
        graph.addNode(node.id, {
            x: basePosition.x + depth * 3,
            y: basePosition.y + depth * 6,
            size: getNodeSize(node.label),
            color: getNodeColor(node.label),
            label: node.properties.name,
            nodeType: node.label,
            filePath: node.properties.filePath,
            relativePath: node.properties.relativePath,
            startLine: node.properties.startLine,
            endLine: node.properties.endLine,
        });
        visibleNodeIds.add(node.id);
    }

    for (const relationship of graphData.relationships) {
        if (!visibleNodeIds.has(relationship.sourceId) || !visibleNodeIds.has(relationship.targetId)) {
            continue;
        }
        if ((relationship.type === 'CONTAINS' && !filters.containsEdges)
            || (relationship.type === 'DEFINES' && !filters.definesEdges)
            || (relationship.type === 'IMPORTS' && !filters.importEdges)) {
            continue;
        }
        graph.addEdgeWithKey(relationship.id, relationship.sourceId, relationship.targetId, {
            size: relationship.type === 'IMPORTS' ? 1.6 : 1,
            color: relationship.type === 'IMPORTS' ? '#3B82F6' : '#2F3340',
            relationType: relationship.type,
            type: 'curved',
        });
    }

    return graph;
}

export function RepositorySigmaGraph({
    graphData,
    filters,
    inspectorOpen,
    selectedNodeId,
    onSelectNode,
}: {
    graphData: RepositoryGraphResponse | null;
    filters: RepositoryGraphFilters;
    inspectorOpen: boolean;
    selectedNodeId: string | null;
    onSelectNode: (nodeId: string | null) => void;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const sigmaRef = useRef<Sigma | null>(null);
    const layoutRef = useRef<FA2Layout | null>(null);
    const layoutStopTimerRef = useRef<number | null>(null);
    const selectedNodeRef = useRef<string | null>(null);
    const graphRef = useRef<Graph<SigmaNodeAttributes, SigmaEdgeAttributes> | null>(null);

    const sigmaGraph = useMemo(() => {
        if (!graphData) {
            return null;
        }
        return buildSigmaGraph(graphData, filters);
    }, [filters, graphData]);

    const stopLayout = useCallback((mode: 'settle' | 'dispose' = 'settle') => {
        if (layoutStopTimerRef.current) {
            window.clearTimeout(layoutStopTimerRef.current);
            layoutStopTimerRef.current = null;
        }
        if (layoutRef.current) {
            try {
                layoutRef.current.stop();
            } catch {
                // Ignore worker shutdown races during tab switches.
            }
            try {
                layoutRef.current.kill();
            } catch {
                // Ignore worker shutdown races during tab switches.
            }
            layoutRef.current = null;
        }
        if (mode === 'settle' && graphRef.current) {
            try {
                noverlap.assign(graphRef.current, {
                    maxIterations: 24,
                    settings: {
                        margin: 6,
                        ratio: 1.08,
                    },
                });
            } catch {
                // Layout settle is optional; never crash the webview over it.
            }
        }
        if (mode === 'settle') {
            try {
                sigmaRef.current?.refresh();
            } catch {
                // Sigma may already be tearing down.
            }
        }
    }, []);

    const applySelection = useCallback((nodeId: string | null) => {
        selectedNodeRef.current = nodeId;
        const sigma = sigmaRef.current;
        if (!sigma) {
            return;
        }
        if (!nodeId) {
            sigma?.refresh();
            return;
        }
        sigma.refresh();
    }, []);

    useEffect(() => {
        if (!containerRef.current || sigmaRef.current) {
            return;
        }

        const sigma = new Sigma(new Graph<SigmaNodeAttributes, SigmaEdgeAttributes>(), containerRef.current, {
            renderLabels: true,
            labelFont: 'JetBrains Mono, monospace',
            labelSize: 11,
            labelColor: { color: '#E8E8ED' },
            labelRenderedSizeThreshold: 8,
            defaultNodeColor: '#94A3B8',
            defaultEdgeColor: '#2F3340',
            defaultEdgeType: 'curved',
            edgeProgramClasses: {
                curved: EdgeCurveProgram,
            },
            minCameraRatio: 0.03,
            maxCameraRatio: 16,
            hideEdgesOnMove: true,
            zIndex: true,
            nodeReducer: (node, data) => {
                const selected = selectedNodeRef.current;
                if (!selected) {
                    return data;
                }

                const graph = graphRef.current;
                if (!graph) {
                    return data;
                }

                const next = { ...data };
                const isSelected = node === selected;
                const isNeighbor = graph.hasEdge(node, selected) || graph.hasEdge(selected, node);
                if (isSelected) {
                    next.color = '#E8F1FF';
                    next.size = (data.size || 6) * 1.9;
                    next.zIndex = 3;
                    return next;
                }
                if (isNeighbor) {
                    next.color = data.color;
                    next.size = (data.size || 6) * 1.05;
                    next.zIndex = 2;
                    return next;
                }
                next.color = data.color;
                next.size = data.size || 6;
                next.zIndex = 0;
                return next;
            },
            edgeReducer: (edge, data) => {
                const selected = selectedNodeRef.current;
                if (!selected) {
                    return data;
                }
                const graph = graphRef.current;
                if (!graph) {
                    return data;
                }
                const [source, target] = graph.extremities(edge);
                const next = { ...data };
                if (source === selected || target === selected) {
                    next.size = (data.size || 1) * 2;
                    next.color = '#60A5FA';
                    next.zIndex = 2;
                    return next;
                }
                next.color = '#334155';
                next.size = Math.max(0.6, (data.size || 1) * 0.9);
                next.zIndex = 0;
                return next;
            },
        });

        sigma.on('clickNode', ({ node }) => {
            onSelectNode(node);
        });
        sigma.on('clickStage', () => {
            onSelectNode(null);
        });

        sigmaRef.current = sigma;

        return () => {
            stopLayout('dispose');
            try {
                sigma.kill();
            } catch {
                // Ignore disposal races when leaving the graph tab.
            }
            sigmaRef.current = null;
            graphRef.current = null;
            selectedNodeRef.current = null;
        };
    }, [onSelectNode, stopLayout]);

    useEffect(() => {
        if (!containerRef.current || !sigmaRef.current) {
            return;
        }

        const sigma = sigmaRef.current;
        const resize = () => {
            try {
                sigma.resize(true);
                sigma.refresh();
            } catch {
                // Ignore resize races during layout transitions.
            }
        };

        const observer = new ResizeObserver(() => {
            window.requestAnimationFrame(resize);
        });
        observer.observe(containerRef.current);

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!sigmaGraph || !sigmaRef.current) {
            return;
        }

        stopLayout();
        graphRef.current = sigmaGraph;
        sigmaRef.current.setGraph(sigmaGraph);

        if (sigmaGraph.order > 1) {
            const settings = {
                ...forceAtlas2.inferSettings(sigmaGraph),
                adjustSizes: true,
                barnesHutOptimize: sigmaGraph.order > 250,
                gravity: 0.6,
                scalingRatio: sigmaGraph.order > 1200 ? 80 : 22,
                slowDown: sigmaGraph.order > 1200 ? 8 : 3,
            };
            const layout = new FA2Layout(sigmaGraph, { settings });
            layout.start();
            layoutRef.current = layout;
            layoutStopTimerRef.current = window.setTimeout(() => {
                stopLayout();
            }, sigmaGraph.order > 1200 ? 6000 : 2500);
        } else {
            noverlap.assign(sigmaGraph, {
                maxIterations: 10,
                settings: {
                    margin: 4,
                },
            });
        }

        sigmaRef.current.getCamera().animatedReset({ duration: 250 });
        sigmaRef.current.refresh();
    }, [sigmaGraph, stopLayout]);

    useEffect(() => {
        applySelection(selectedNodeId);
    }, [applySelection, selectedNodeId]);

    useEffect(() => {
        const sigma = sigmaRef.current;
        if (!sigma) {
            return;
        }

        const timer = window.setTimeout(() => {
            try {
                sigma.resize(true);
                sigma.refresh();
            } catch {
                // Ignore inspector transition resize races.
            }
        }, 180);

        return () => {
            window.clearTimeout(timer);
        };
    }, [inspectorOpen]);

    return <div ref={containerRef} className="repository-graph-canvas" />;
}
