export type RepositoryNodeLabel =
    | 'Project'
    | 'Folder'
    | 'File'
    | 'Class'
    | 'Function'
    | 'Method'
    | 'Interface'
    | 'Enum'
    | 'Struct';

export interface RepositoryGraphNode {
    id: string;
    label: RepositoryNodeLabel;
    properties: {
        name: string;
        filePath: string;
        relativePath?: string;
        language?: string;
        startLine?: number;
        endLine?: number;
    };
}

export interface RepositoryGraphRelationship {
    id: string;
    sourceId: string;
    targetId: string;
    type: 'CONTAINS' | 'DEFINES' | 'IMPORTS';
    confidence: number;
    reason: string;
}

export interface RepositoryGraphResponse {
    status: string;
    graphKind: 'repository';
    repoRoot: string;
    scopePath: string;
    nodes: RepositoryGraphNode[];
    relationships: RepositoryGraphRelationship[];
    nodeCount: number;
    edgeCount: number;
    counts: {
        folders: number;
        files: number;
        symbols: number;
        imports: number;
    };
    truncated: boolean;
    truncatedReason: string;
    symbolMode: 'full' | 'file-only';
    sourceFileCount: number;
    renderedFileCount: number;
}

export interface RepositoryGraphFilters {
    structure: boolean;
    files: boolean;
    symbols: boolean;
    containsEdges: boolean;
    definesEdges: boolean;
    importEdges: boolean;
}

export const DEFAULT_REPOSITORY_GRAPH_FILTERS: RepositoryGraphFilters = {
    structure: true,
    files: true,
    symbols: true,
    containsEdges: true,
    definesEdges: true,
    importEdges: true,
};

export function getNodeCategory(label: RepositoryNodeLabel): 'structure' | 'files' | 'symbols' {
    if (label === 'Project' || label === 'Folder') {
        return 'structure';
    }
    if (label === 'File') {
        return 'files';
    }
    return 'symbols';
}

export function getNodeColor(label: RepositoryNodeLabel): string {
    switch (label) {
        case 'Project':
            return '#60A5FA';
        case 'Folder':
            return '#F59E0B';
        case 'File':
            return '#94A3B8';
        case 'Class':
            return '#34D399';
        case 'Function':
        case 'Method':
            return '#A78BFA';
        case 'Interface':
            return '#22D3EE';
        case 'Enum':
            return '#F97316';
        case 'Struct':
            return '#FB7185';
        default:
            return '#94A3B8';
    }
}

export function getNodeSize(label: RepositoryNodeLabel): number {
    switch (label) {
        case 'Project':
            return 18;
        case 'Folder':
            return 13;
        case 'File':
            return 8;
        default:
            return 6;
    }
}
