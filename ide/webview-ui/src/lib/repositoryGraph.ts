export interface RepositorySelection {
    path: string;
    name: string;
}

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

export interface RepositoryGraphNodeProperties {
    name: string;
    filePath: string;
    relativePath?: string;
    language?: string;
    startLine?: number;
    endLine?: number;
}

export interface RepositoryGraphNode {
    id: string;
    label: RepositoryNodeLabel;
    properties: RepositoryGraphNodeProperties;
}

export interface RepositoryGraphRelationship {
    id: string;
    sourceId: string;
    targetId: string;
    type: 'CONTAINS' | 'DEFINES' | 'IMPORTS';
}

export interface RepositoryGraphCounts {
    folders: number;
    files: number;
    symbols: number;
    imports: number;
}

export interface RepositoryGraphResponse {
    status: 'success';
    graphKind: 'repository';
    repoRoot: string;
    scopePath: string;
    nodes: RepositoryGraphNode[];
    relationships: RepositoryGraphRelationship[];
    nodeCount: number;
    edgeCount: number;
    counts: RepositoryGraphCounts;
    truncated: boolean;
    truncatedReason: string;
    symbolMode: 'full' | 'file-only';
    sourceFileCount: number;
    renderedFileCount: number;
}

export interface RepositoryGraphErrorResponse {
    status: 'error';
    detail: string;
}

export type RepositoryGraphMessage = RepositoryGraphResponse | RepositoryGraphErrorResponse;

export interface RepositoryGraphDataMessage {
    type: 'repositoryGraphData';
    data: RepositoryGraphMessage;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isRepositoryNodeLabel(value: unknown): value is RepositoryNodeLabel {
    return value === 'Project'
        || value === 'Folder'
        || value === 'File'
        || value === 'Class'
        || value === 'Function'
        || value === 'Method'
        || value === 'Interface'
        || value === 'Enum'
        || value === 'Struct';
}

function isRepositoryGraphNodeProperties(value: unknown): value is RepositoryGraphNodeProperties {
    if (!isRecord(value) || !isString(value.name) || !isString(value.filePath)) {
        return false;
    }

    if ('relativePath' in value && value.relativePath !== undefined && !isString(value.relativePath)) {
        return false;
    }
    if ('language' in value && value.language !== undefined && !isString(value.language)) {
        return false;
    }
    if ('startLine' in value && value.startLine !== undefined && !isNumber(value.startLine)) {
        return false;
    }
    if ('endLine' in value && value.endLine !== undefined && !isNumber(value.endLine)) {
        return false;
    }

    return true;
}

export function isRepositoryGraphNode(value: unknown): value is RepositoryGraphNode {
    return isRecord(value)
        && isString(value.id)
        && isRepositoryNodeLabel(value.label)
        && isRepositoryGraphNodeProperties(value.properties);
}

export function isRepositoryGraphRelationship(value: unknown): value is RepositoryGraphRelationship {
    return isRecord(value)
        && isString(value.id)
        && isString(value.sourceId)
        && isString(value.targetId)
        && (value.type === 'CONTAINS' || value.type === 'DEFINES' || value.type === 'IMPORTS');
}

export function isRepositoryGraphMessage(value: unknown): value is RepositoryGraphMessage {
    if (!isRecord(value) || !isString(value.status)) {
        return false;
    }

    if (value.status === 'error') {
        return isString(value.detail);
    }

    if (value.status !== 'success'
        || value.graphKind !== 'repository'
        || !isString(value.repoRoot)
        || !isString(value.scopePath)
        || !Array.isArray(value.nodes)
        || !Array.isArray(value.relationships)
        || !isRecord(value.counts)
        || !isNumber(value.nodeCount)
        || !isNumber(value.edgeCount)
        || typeof value.truncated !== 'boolean'
        || !isString(value.truncatedReason)
        || (value.symbolMode !== 'full' && value.symbolMode !== 'file-only')
        || !isNumber(value.sourceFileCount)
        || !isNumber(value.renderedFileCount)) {
        return false;
    }

    if (!value.nodes.every(isRepositoryGraphNode) || !value.relationships.every(isRepositoryGraphRelationship)) {
        return false;
    }

    return isNumber(value.counts.folders)
        && isNumber(value.counts.files)
        && isNumber(value.counts.symbols)
        && isNumber(value.counts.imports);
}

export function isRepositoryGraphDataMessage(value: unknown): value is RepositoryGraphDataMessage {
    return isRecord(value)
        && value.type === 'repositoryGraphData'
        && isRepositoryGraphMessage(value.data);
}

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
