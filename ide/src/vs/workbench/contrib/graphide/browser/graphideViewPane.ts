/*---------------------------------------------------------------------------------------------
 *  GraphIDE View Pane
 *  UX Overhaul: Flat styling, semantic states, density support, keyboard accessible
 *--------------------------------------------------------------------------------------------*/

import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import * as dom from '../../../../base/browser/dom.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { basename } from '../../../../base/common/resources.js';
import './media/graphide.css';

interface ChatMessage {
    role: 'user' | 'system';
    content: string;
    timestamp: Date;
    type?: 'normal' | 'error' | 'warning';
    fileAttachment?: {
        path: string;
        label?: string;
    };
}

interface VulnerabilityData {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    file: string;
    line: number;
    status: 'open' | 'fixed' | 'in_review';
}

type ViewType = 'editor' | 'dashboard' | 'graph' | 'settings';

export class GraphIDEViewPane extends ViewPane {

    static readonly ID = 'graphide.panel';

    // UI Containers
    private editorContainer!: HTMLElement;
    private dashboardContainer!: HTMLElement;
    private graphContainer!: HTMLElement;
    private messagesContainer!: HTMLElement;

    // State
    private activeView: ViewType = 'editor';
    private messages: ChatMessage[] = [];
    private lastErrorContent: string = '';
    private errorCount: number = 0;

    // Mock Data for Dashboard
    private vulnerabilities: VulnerabilityData[] = [
        { id: "VULN-2024-001", severity: "critical", type: "SQL Injection", file: "src/auth_service.ts", line: 14, status: "open" },
        { id: "VULN-2024-002", severity: "high", type: "XSS Vulnerability", file: "src/frontend/profile.tsx", line: 45, status: "in_review" },
        { id: "VULN-2024-005", severity: "critical", type: "Remote Code Execution", file: "src/server/upload.ts", line: 88, status: "open" }
    ];

    constructor(
        options: IViewPaneOptions,
        @IKeybindingService keybindingService: IKeybindingService,
        @IContextMenuService contextMenuService: IContextMenuService,
        @IConfigurationService configurationService: IConfigurationService,
        @IContextKeyService contextKeyService: IContextKeyService,
        @IViewDescriptorService viewDescriptorService: IViewDescriptorService,
        @IInstantiationService instantiationService: IInstantiationService,
        @IOpenerService openerService: IOpenerService,
        @IThemeService themeService: IThemeService,
        @IHoverService hoverService: IHoverService,
        @IRequestService private readonly requestService: IRequestService,
        @IFileDialogService private readonly fileDialogService: IFileDialogService,
        @IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService
    ) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    }

    protected override renderBody(container: HTMLElement): void {
        super.renderBody(container);

        // 1. Root Container
        container.classList.add('graphide-root');

        // 2. Navigation Sidebar (Left)
        this.renderSidebar(container);

        // 3. Main Content Area (Right)
        const mainContent = dom.append(container, dom.$('.graphide-main-content'));

        // 3a. Header
        this.renderHeader(mainContent);

        // 3b. Viewport (Stack of Views)
        const viewport = dom.append(mainContent, dom.$('.graphide-viewport'));

        // --- View: Editor (Default) ---
        this.editorContainer = dom.append(viewport, dom.$('.graphide-view-editor'));
        this.editorContainer.style.height = '100%';
        this.editorContainer.style.display = 'flex';
        this.editorContainer.style.flexDirection = 'column';
        this.renderEditorView(this.editorContainer);

        // --- View: Dashboard ---
        this.dashboardContainer = dom.append(viewport, dom.$('.graphide-view-dashboard'));
        this.dashboardContainer.style.height = '100%';
        this.dashboardContainer.style.display = 'none'; // Hidden initially
        this.renderDashboardView(this.dashboardContainer);

        // --- View: Graph ---
        this.graphContainer = dom.append(viewport, dom.$('.graphide-view-graph'));
        this.graphContainer.style.height = '100%';
        this.graphContainer.style.display = 'none'; // Hidden initially
        this.renderGraphView(this.graphContainer);

        // 3c. Footer (Status Bar) is optional, can add later if space permits.
    }

    // --- Sidebar Implementation ---
    private renderSidebar(container: HTMLElement): void {
        const sidebar = dom.append(container, dom.$('.graphide-nav-sidebar'));

        // Brand Icon (Top)
        const brandIcon = dom.append(sidebar, dom.$('.graphide-nav-icon'));
        dom.append(brandIcon, dom.$('span.codicon.codicon-shield'));
        brandIcon.style.color = 'var(--color-cyan-400)';
        brandIcon.style.marginBottom = '24px';
        brandIcon.style.cursor = 'default';

        // Nav Items
        this.createNavIcon(sidebar, 'codicon-code', 'Editor', 'editor', true);
        this.createNavIcon(sidebar, 'codicon-pulse', 'Vulnerabilities', 'dashboard');
        this.createNavIcon(sidebar, 'codicon-type-hierarchy', 'Dataflow Graph', 'graph');

        // Spacer
        const spacer = dom.append(sidebar, dom.$('div'));
        spacer.style.flex = '1';

        // Settings (Bottom)
        this.createNavIcon(sidebar, 'codicon-settings-gear', 'Settings', 'settings');
    }

    private createNavIcon(parent: HTMLElement, iconClass: string, title: string, view: ViewType, active: boolean = false): void {
        const btn = dom.append(parent, dom.$('.graphide-nav-icon'));
        if (active) btn.classList.add('active');
        btn.title = title;
        btn.dataset.view = view;

        dom.append(btn, dom.$(`span.codicon.${iconClass}`));

        btn.addEventListener('click', () => {
            // Update UI State
            parent.querySelectorAll('.graphide-nav-icon').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            this.switchView(view);
        });
    }

    private switchView(view: ViewType): void {
        this.activeView = view;

        // Hide all
        this.editorContainer.style.display = 'none';
        this.dashboardContainer.style.display = 'none';
        this.graphContainer.style.display = 'none';

        // Show active
        switch (view) {
            case 'editor':
                this.editorContainer.style.display = 'flex';
                break;
            case 'dashboard':
                this.dashboardContainer.style.display = 'flex';
                break;
            case 'graph':
                this.graphContainer.style.display = 'block'; // Graph usually needs block/relative
                break;
            case 'settings':
                // Placeholder, maybe show editor for now or simple toast
                this.addMessage('system', 'Settings view not implemented yet.', 'warning');
                this.editorContainer.style.display = 'flex';
                break;
        }
    }

    protected override renderHeader(parent: HTMLElement): void {
        const header = dom.append(parent, dom.$('.graphide-main-header'));
        const left = dom.append(header, dom.$('.left'));
        left.style.display = 'flex';
        left.style.gap = '8px';
        left.style.alignItems = 'center';

        dom.append(left, dom.$('span.codicon.codicon-menu'));
        const title = dom.append(left, dom.$('span'));
        title.textContent = 'Graphide Enterprise';
        title.style.fontWeight = '500';
        title.style.color = 'var(--color-slate-100)';
    }

    // --- Editor View (Existing Logic) ---
    private renderEditorView(container: HTMLElement): void {
        // Toolbar (inside buffer)
        const toolbar = dom.append(container, dom.$('.graphide-toolbar'));
        const analyzeBtn = dom.append(toolbar, dom.$('button.graphide-toolbar-btn.primary'));
        analyzeBtn.textContent = 'Analyze Files';
        analyzeBtn.addEventListener('click', () => this.handleAnalyze());

        const clearBtn = dom.append(toolbar, dom.$('button.graphide-icon-btn'));
        clearBtn.classList.add('codicon', 'codicon-clear-all');
        clearBtn.title = 'Clear Results';
        clearBtn.addEventListener('click', () => this.clearHistory());

        // Messages
        this.messagesContainer = dom.append(container, dom.$('.graphide-messages'));
        this.messagesContainer.setAttribute('role', 'log');

        this.addMessage('system', 'Welcome to Graphide 2.0. Select a file to analyze.', 'normal');
    }

    // --- Dashboard View (New) ---
    private renderDashboardView(container: HTMLElement): void {
        const dashboard = dom.append(container, dom.$('.graphide-dashboard'));

        // Title
        const header = dom.append(dashboard, dom.$('div'));
        header.style.marginBottom = '24px';
        const h1 = dom.append(header, dom.$('h2'));
        h1.textContent = 'Security Findings';
        h1.style.color = 'var(--color-slate-100)';
        h1.style.fontSize = '20px';
        h1.style.fontWeight = '600';

        const sub = dom.append(header, dom.$('p'));
        sub.textContent = 'Real-time vulnerability detection and triage';
        sub.style.color = 'var(--color-slate-500)';
        sub.style.marginTop = '4px';

        // Metrics Grid
        const grid = dom.append(dashboard, dom.$('.graphide-metric-grid'));
        this.createMetricCard(grid, 'Critical Issues', '2', '+1', 'critical');
        this.createMetricCard(grid, 'Open Findings', '3', '+3', 'info');
        this.createMetricCard(grid, 'Fix Rate', '84%', '+12%', 'success');

        // Table
        const tableContainer = dom.append(dashboard, dom.$('.graphide-table-container'));
        const table = dom.append(tableContainer, dom.$('table.graphide-table'));

        // Thead
        const thead = dom.append(table, dom.$('thead'));
        const trHead = dom.append(thead, dom.$('tr'));
        ['Severity', 'ID', 'Type', 'Location', 'Status'].forEach(text => {
            const th = dom.append(trHead, dom.$('th'));
            th.textContent = text;
        });

        // Tbody
        const tbody = dom.append(table, dom.$('tbody'));
        this.vulnerabilities.forEach(vuln => {
            const tr = dom.append(tbody, dom.$('tr'));

            // Severity
            const tdSev = dom.append(tr, dom.$('td'));
            const badge = dom.append(tdSev, dom.$(`.graphide-badge.${vuln.severity}`));
            badge.textContent = vuln.severity;

            // ID
            const tdId = dom.append(tr, dom.$('td'));
            tdId.textContent = vuln.id;
            tdId.style.fontFamily = 'monospace';

            // Type
            const tdType = dom.append(tr, dom.$('td'));
            tdType.textContent = vuln.type;
            tdType.style.fontWeight = '500';
            tdType.style.color = 'var(--color-slate-200)';

            // Location
            const tdLoc = dom.append(tr, dom.$('td'));
            tdLoc.textContent = `${vuln.file}:${vuln.line}`;
            tdLoc.style.fontFamily = 'monospace';

            // Status
            const tdStatus = dom.append(tr, dom.$('td'));
            tdStatus.textContent = vuln.status.replace('_', ' ');
            tdStatus.style.textTransform = 'capitalize';
        });
    }

    private createMetricCard(parent: HTMLElement, label: string, value: string, trend: string, variant: string): void {
        const card = dom.append(parent, dom.$('.graphide-card'));
        const lbl = dom.append(card, dom.$('.graphide-metric-label'));
        lbl.textContent = label;
        const val = dom.append(card, dom.$('.graphide-metric-value'));
        val.textContent = value;
        if (variant === 'critical') val.style.color = 'var(--color-rose-400)';
        if (variant === 'success') val.style.color = 'var(--color-emerald-400)';
    }

    // --- Graph View (New) ---
    private renderGraphView(container: HTMLElement): void {
        const graph = dom.append(container, dom.$('.graphide-graph-container'));

        // Helper to add node
        const addNode = (x: number, y: number, label: string, type: string, isTainted: boolean = false) => {
            const node = dom.append(graph, dom.$('.graphide-graph-node'));
            node.style.left = `${x}px`;
            node.style.top = `${y}px`;

            if (isTainted) node.classList.add('selected');

            // Header
            const header = dom.append(node, dom.$('.graphide-node-header'));
            dom.append(header, dom.$('.graphide-node-icon.codicon.codicon-symbol-file')); // generic icon
            const lbl = dom.append(header, dom.$('.graphide-node-label'));
            lbl.textContent = label;

            const typeEl = dom.append(node, dom.$('.graphide-node-type'));
            typeEl.textContent = type;

            if (isTainted) {
                const taint = dom.append(node, dom.$('.graphide-taint-Label'));
                dom.append(taint, dom.$('span.codicon.codicon-shield'));
                dom.append(taint, dom.$('span', undefined, 'Vulnerable'));
            }
        };

        // Render Mock Graph
        addNode(50, 100, 'Client Request', 'Source');
        addNode(250, 50, 'Auth Controller', 'Process');
        addNode(250, 200, 'User Input', 'Taint Source', true);
        addNode(500, 100, 'Query Builder', 'Process');
        addNode(700, 100, 'PostgreSQL DB', 'Sink', true);

        // Edges would go here (complex to do with pure DOM div lines or SVG injection, keeping simple for now)
        // Ideally we inject an SVG for edges into the container first.
    }


    /* --- Logic & Helpers (Preserved from original) --- */

    private clearHistory(): void {
        this.messages = [];
        dom.clearNode(this.messagesContainer);
        this.addMessage('system', 'Results cleared. Select a file to analyze.', 'normal');
    }

    private addMessage(role: 'user' | 'system', content: string, type: 'normal' | 'error' | 'warning' = 'normal'): void {
        this.addMessageWithStreamOption(role, content, type, false);
    }

    private addMessageWithStreamOption(role: 'user' | 'system', content: string, type: 'normal' | 'error' | 'warning' = 'normal', stream: boolean = false, loadingDots: boolean = false): HTMLElement {
        if (type === 'error' && content === this.lastErrorContent && this.messages.length > 0) {
            this.errorCount++;
            const lastMessage = this.messages[this.messages.length - 1];
            if (lastMessage && lastMessage.type === 'error') {
                const messageEls = this.messagesContainer.querySelectorAll('.graphide-message-error');
                const lastEl = messageEls[messageEls.length - 1] as HTMLElement;
                if (lastEl) {
                    let countBadge = lastEl.querySelector('.error-count') as HTMLElement;
                    if (countBadge) countBadge.textContent = `(${this.errorCount}×)`;
                    return lastEl;
                }
            }
        }
        if (type === 'error') {
            this.lastErrorContent = content;
            this.errorCount = 1;
        } else {
            this.lastErrorContent = '';
            this.errorCount = 0;
        }

        const message: ChatMessage = { role, content, timestamp: new Date(), type };
        this.messages.push(message);
        return this.renderMessage(message, stream, loadingDots);
    }

    private renderMessage(message: ChatMessage, stream: boolean = false, loadingDots: boolean = false): HTMLElement {
        const messageEl = dom.append(this.messagesContainer, dom.$('.graphide-message'));
        messageEl.classList.add('animate-in');
        messageEl.setAttribute('tabindex', '0');
        messageEl.classList.add(message.role === 'user' ? 'graphide-message-user' : 'graphide-message-system');
        if (message.type === 'error') messageEl.classList.add('graphide-message-error');
        else if (message.type === 'warning') messageEl.classList.add('graphide-message-warning');

        const roleEl = dom.append(messageEl, dom.$('.graphide-message-role'));
        let iconClass = 'codicon-hubot';
        let labelText = 'Analysis Result';
        if (message.role === 'user') {
            iconClass = 'codicon-account';
            labelText = 'You';
        } else {
            if (message.type === 'error') {
                iconClass = 'codicon-error';
                labelText = 'Error';
            } else if (message.type === 'warning') {
                iconClass = 'codicon-warning';
                labelText = 'Warning';
            }
        }
        const icon = dom.append(roleEl, dom.$(`span.codicon.${iconClass}`));
        icon.setAttribute('aria-hidden', 'true');
        const label = dom.append(roleEl, dom.$('span'));
        label.textContent = labelText;

        const contentEl = dom.append(messageEl, dom.$('.graphide-message-content'));

        if (loadingDots) {
            const dots = dom.append(contentEl, dom.$('span.graphide-loading-dots'));
            const markdownContent = new MarkdownString(message.content, { isTrusted: true, supportHtml: true, supportThemeIcons: true });
            const rendered = this.markdownRendererService.render(markdownContent);
            contentEl.prepend(rendered.element);
            dom.append(dots, dom.$('span', undefined, '.'));
            dom.append(dots, dom.$('span', undefined, '.'));
            dom.append(dots, dom.$('span', undefined, '.'));
        } else if (stream && message.content.length > 20) {
            let displayedContent = '';
            const fullContent = message.content;
            const chunkSize = 5;
            let index = 0;
            const interval = setInterval(() => {
                if (index >= fullContent.length) {
                    clearInterval(interval);
                    return;
                }
                const chunk = fullContent.substring(index, index + chunkSize);
                displayedContent += chunk;
                index += chunkSize;
                dom.clearNode(contentEl);
                const markdownContent = new MarkdownString(displayedContent + (index < fullContent.length ? ' â–ˆ' : ''), { isTrusted: true, supportHtml: true, supportThemeIcons: true });
                const rendered = this.markdownRendererService.render(markdownContent);
                contentEl.appendChild(rendered.element);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }, 10);
        } else {
            const markdownContent = new MarkdownString(message.content, { isTrusted: true, supportHtml: true, supportThemeIcons: true });
            const rendered = this.markdownRendererService.render(markdownContent);
            contentEl.appendChild(rendered.element);
        }
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        return messageEl;
    }

    public async handleAnalyze(): Promise<void> {
        // Ensure we are on Editor view so user sees progress
        if (this.activeView !== 'editor') {
            const editorBtn = document.querySelector('[data-view="editor"]');
            if (editorBtn) {
                (editorBtn as HTMLElement).click();
            } else {
                this.switchView('editor');
            }
        }

        const uris = await this.fileDialogService.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            openLabel: 'Analyze',
            title: 'Select Code File to Analyze'
        });

        if (!uris || uris.length === 0) return;

        const filePath = uris[0].fsPath;
        const fileUri = URI.file(filePath);
        const fileName = basename(fileUri);
        const isJson = fileName.toLowerCase().endsWith('.json');
        const iconId = isJson ? 'json' : 'file';
        const chip = `[$(${iconId}) ${fileName}](${fileUri.toString()})`;
        const loadingMsgKey = `Analysing ${chip}`;
        const loadingEl = this.addMessageWithStreamOption('system', loadingMsgKey, 'normal', false, true);

        try {
            const payload = {
                intent: 'scan',
                filePath: filePath,
                language: 'c',
                userQuery: 'Analyze this file'
            };
            const context = await this.requestService.request({
                type: 'POST',
                url: 'http://localhost:8000/agent/request',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload)
            }, CancellationToken.None);
            const data = await asJson<any>(context);

            const dots = loadingEl.querySelector('.graphide-loading-dots');
            if (dots) dots.remove();

            if (data?.agentOutputs && data.agentOutputs.length > 0) {
                for (const output of data.agentOutputs) {
                    this.addMessageWithStreamOption('system', output.markdownOutput || output.message || 'No content', 'normal', true);

                    // Hook: If vulnerabilities found, update dashboard mock data?
                    // For now we just display in chat.
                }
            } else if (data?.message) {
                this.addMessageWithStreamOption('system', data.message, data.status === 'error' ? 'error' : 'normal', true);
            } else {
                this.addMessageWithStreamOption('system', 'Analysis completed with no specific output.', 'warning');
            }

        } catch (error) {
            const dots = loadingEl.querySelector('.graphide-loading-dots');
            if (dots) dots.remove();
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.addMessageWithStreamOption('system', `Analysis Failed: ${errorMessage}\n\nEnsure backend is running at localhost:8000`, 'error');
        }
    }

    protected override layoutBody(height: number, width: number): void {
        super.layoutBody(height, width);
    }
}
