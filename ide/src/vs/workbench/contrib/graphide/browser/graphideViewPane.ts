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
import './media/graphide.css';

interface ChatMessage {
    role: 'user' | 'system';
    content: string;
    timestamp: Date;
    type?: 'normal' | 'error' | 'warning';
}

export class GraphIDEViewPane extends ViewPane {

    static readonly ID = 'graphide.panel';
    private messagesContainer!: HTMLElement;
    private messages: ChatMessage[] = [];
    private lastErrorContent: string = '';
    private errorCount: number = 0;

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

        // Main container with CSS class
        container.classList.add('graphide-panel');

        // Toolbar (compact, not hero button)
        const toolbar = dom.append(container, dom.$('.graphide-toolbar'));

        const analyzeBtn = dom.append(toolbar, dom.$('button.graphide-toolbar-btn.primary'));
        analyzeBtn.setAttribute('tabindex', '0');
        analyzeBtn.textContent = 'Analyze Files';
        analyzeBtn.addEventListener('click', () => this.handleAnalyze());

        // Clear button in toolbar
        const clearBtn = dom.append(toolbar, dom.$('button.graphide-icon-btn'));
        clearBtn.classList.add('codicon', 'codicon-clear-all');
        clearBtn.title = 'Clear Results';
        clearBtn.setAttribute('tabindex', '0');
        clearBtn.addEventListener('click', () => this.clearHistory());

        // Messages area
        this.messagesContainer = dom.append(container, dom.$('.graphide-messages'));
        this.messagesContainer.setAttribute('role', 'log');
        this.messagesContainer.setAttribute('aria-live', 'polite');

        // Welcome message - concise
        this.addMessage('system', 'Select a file to analyze for vulnerabilities.', 'normal');
    }

    private clearHistory(): void {
        this.messages = [];
        dom.clearNode(this.messagesContainer);
        this.addMessage('system', 'Results cleared. Select a file to analyze.', 'normal');
    }

    private addMessage(role: 'user' | 'system', content: string, type: 'normal' | 'error' | 'warning' = 'normal'): void {
        // Consolidate repeated error messages to reduce vertical noise
        if (type === 'error' && content === this.lastErrorContent && this.messages.length > 0) {
            this.errorCount++;
            const lastMessage = this.messages[this.messages.length - 1];
            if (lastMessage && lastMessage.type === 'error') {
                // Update existing error message with count badge
                const messageEls = this.messagesContainer.querySelectorAll('.graphide-message-error');
                const lastEl = messageEls[messageEls.length - 1];
                if (lastEl) {
                    let countBadge = lastEl.querySelector('.error-count') as HTMLElement;
                    if (countBadge) {
                        countBadge.textContent = `(${this.errorCount}×)`;
                    } else {
                        const roleEl = lastEl.querySelector('.graphide-message-role');
                        if (roleEl) {
                            countBadge = document.createElement('span');
                            countBadge.className = 'error-count';
                            countBadge.style.cssText = 'opacity: 0.7; font-weight: normal; margin-left: 4px;';
                            countBadge.textContent = `(${this.errorCount}×)`;
                            roleEl.appendChild(countBadge);
                        }
                    }
                }
                return;
            }
        }

        // Reset error tracking for new error or non-error messages
        if (type === 'error') {
            this.lastErrorContent = content;
            this.errorCount = 1;
        } else {
            this.lastErrorContent = '';
            this.errorCount = 0;
        }

        const message: ChatMessage = { role, content, timestamp: new Date(), type };
        this.messages.push(message);
        this.renderMessage(message);
    }

    private renderMessage(message: ChatMessage): void {
        const messageEl = dom.append(this.messagesContainer, dom.$('.graphide-message'));

        // Enable keyboard focus for accessibility
        messageEl.setAttribute('tabindex', '0');

        // Apply role-specific class
        messageEl.classList.add(message.role === 'user' ? 'graphide-message-user' : 'graphide-message-system');

        // Apply semantic state class for errors/warnings
        if (message.type === 'error') {
            messageEl.classList.add('graphide-message-error');
        } else if (message.type === 'warning') {
            messageEl.classList.add('graphide-message-warning');
        }

        // Role label with icon
        const roleEl = dom.append(messageEl, dom.$('.graphide-message-role'));

        let iconClass = 'codicon-hubot';
        let labelText = 'Analysis Result';

        if (message.role === 'user') {
            // Should not happen in read-only mode, but kept for robustness
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

        // Content with markdown rendering
        const contentEl = dom.append(messageEl, dom.$('.graphide-message-content'));
        const markdownContent = new MarkdownString(message.content, { isTrusted: true, supportHtml: true });
        const rendered = this.markdownRendererService.render(markdownContent);
        contentEl.appendChild(rendered.element);

        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    public async handleAnalyze(): Promise<void> {
        const uris = await this.fileDialogService.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            openLabel: 'Analyze',
            title: 'Select Code File to Analyze'
        });

        if (!uris || uris.length === 0) {
            return;
        }

        // Just take the first file for now as per backend limitation
        const filePath = uris[0].fsPath;

        this.addMessage('system', `Analysing ${filePath}...\n\n(Generating Queries -> Slicing -> Explaining)`, 'normal');

        // Show loading indicator in message or toolbar? 
        // We removed the send button, so let's just use message updates for now.

        try {
            const payload = {
                intent: 'scan',
                filePath: filePath,
                language: 'c', // Default or detect
                userQuery: 'Analyze this file'
            };

            const context = await this.requestService.request({
                type: 'POST',
                url: 'http://localhost:8000/agent/request',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload)
            }, CancellationToken.None);

            const data = await asJson<any>(context);

            if (data?.agentOutputs && data.agentOutputs.length > 0) {
                for (const output of data.agentOutputs) {
                    this.addMessage('system', output.markdownOutput || output.message || 'No content', 'normal');
                }
            } else if (data?.message) {
                this.addMessage('system', data.message, data.status === 'error' ? 'error' : 'normal');
            } else {
                this.addMessage('system', 'Analysis completed with no specific output.', 'warning');
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.addMessage('system', `Analysis Failed: ${errorMessage}\n\nEnsure backend is running at localhost:8000`, 'error');
        }
    }

    protected override layoutBody(height: number, width: number): void {
        super.layoutBody(height, width);
    }
}
