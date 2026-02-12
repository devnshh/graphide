/*---------------------------------------------------------------------------------------------
 *  Graphide Webview Provider
 *  Bridges the React webview with the FastAPI backend via IRequestService
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWebviewViewService, WebviewView } from '../../webviewView/browser/webviewViewService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IOverlayWebview, WebviewMessageReceivedEvent } from '../../webview/browser/webview.js';
import { asWebviewUri } from '../../webview/common/webview.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { basename } from '../../../../base/common/resources.js';

const BACKEND_URL = 'http://localhost:8000';

export class GraphideWebviewProvider extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.graphideWebviewProvider';
	static readonly VIEW_TYPE = 'graphide.panel';

	constructor(
		@IWebviewViewService private readonly webviewViewService: IWebviewViewService,
		@IFileService private readonly fileService: IFileService,
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
		@IRequestService private readonly requestService: IRequestService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
	) {
		super();
		this._register(
			this.webviewViewService.register(GraphideWebviewProvider.VIEW_TYPE, {
				resolve: (webviewView: WebviewView, _cancellation: CancellationToken) => {
					return this.resolveWebviewView(webviewView);
				}
			})
		);
	}

	private async resolveWebviewView(webviewView: WebviewView): Promise<void> {
		const webview = webviewView.webview;

		// The webview-ui/dist is at the root of the IDE checkout
		const distUri = URI.file(this.nativeEnvironmentService.appRoot + '/webview-ui/dist');

		// Enable scripts and set local resource roots
		webview.contentOptions = {
			allowScripts: true,
			localResourceRoots: [distUri]
		};

		// Set the HTML content
		const html = await this.getWebviewHtml(webview, distUri);
		webview.setHtml(html);

		// Set up message bridge
		this._register(webview.onMessage((e: WebviewMessageReceivedEvent) => {
			this.handleMessage(webview, e.message);
		}));
	}

	private async handleMessage(webview: IOverlayWebview, message: any): Promise<void> {
		switch (message.type) {

			case 'selectFiles': {
				const uris = await this.fileDialogService.showOpenDialog({
					canSelectFiles: true,
					canSelectFolders: true,
					canSelectMany: false,
					openLabel: 'Analyze',
					title: 'Select Code File or Directory to Analyze'
				});

				if (uris && uris.length > 0) {
					const fileUri = uris[0];
					const fileName = basename(fileUri);
					webview.postMessage({
						type: 'fileSelected',
						filePath: fileUri.fsPath,
						fileName: fileName
					});
				}
				break;
			}

			case 'analyzeFiles': {
				const { filePath, language } = message;
				if (!filePath) {
					webview.postMessage({ type: 'analysisError', error: 'No file selected' });
					return;
				}

				// Send progress
				webview.postMessage({
					type: 'analysisProgress',
					step: 1, total: 5,
					message: 'Sending to backend...'
				});

				try {
					const payload = {
						intent: 'scan',
						filePath: filePath,
						language: language || 'c',
						userQuery: 'Analyze this file'
					};

					const context = await this.requestService.request({
						type: 'POST',
						url: `${BACKEND_URL}/agent/request`,
						headers: { 'Content-Type': 'application/json' },
						data: JSON.stringify(payload)
					}, CancellationToken.None);

					const data = await asJson<any>(context);

					webview.postMessage({
						type: 'analysisResult',
						data: data
					});

				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					webview.postMessage({
						type: 'analysisError',
						error: `Backend Error: ${errorMessage}\n\nEnsure the backend is running at ${BACKEND_URL}`
					});
				}
				break;
			}

			case 'healthCheck': {
				try {
					const context = await this.requestService.request({
						type: 'GET',
						url: `${BACKEND_URL}/`,
					}, CancellationToken.None);
					const data = await asJson<any>(context);
					webview.postMessage({
						type: 'healthCheckResult',
						status: 'connected',
						data: data
					});
				} catch {
					webview.postMessage({
						type: 'healthCheckResult',
						status: 'disconnected'
					});
				}
				break;
			}

			case 'getGraph': {
				const { filePath: graphFilePath, scanId } = message;
				try {
					const params = new URLSearchParams();
					if (graphFilePath) params.set('file_path', graphFilePath);
					if (scanId) params.set('scan_id', scanId);

					const context = await this.requestService.request({
						type: 'GET',
						url: `${BACKEND_URL}/graph?${params.toString()}`,
					}, CancellationToken.None);
					const data = await asJson<any>(context);
					webview.postMessage({
						type: 'graphData',
						data: data
					});
				} catch {
					webview.postMessage({
						type: 'graphData',
						data: { nodes: [], relationships: [], status: 'error' }
					});
				}
				break;
			}
		}
	}

	private async getWebviewHtml(webview: IOverlayWebview, distUri: URI): Promise<string> {
		// Try to load the Vite-built React app
		try {
			const indexHtmlUri = URI.joinPath(distUri, 'index.html');
			const content = await this.fileService.readFile(indexHtmlUri);
			let html = content.value.toString();

			// Convert file:// URI to webview-compatible URI via service worker
			const webviewDistUri = asWebviewUri(distUri);
			const webviewDistPath = webviewDistUri.toString();
			html = html.replace(/(href|src)="\.\/assets\//g, `$1="${webviewDistPath}/assets/`);

			return html;
		} catch {
			// Fallback: inline HTML when the React build is not available
			return this.getFallbackHtml();
		}
	}

	private getFallbackHtml(): string {
		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body {
			font-family: var(--vscode-font-family, sans-serif);
			background: var(--vscode-sideBar-background, #1e1e1e);
			color: var(--vscode-foreground, #ccc);
			display: flex; align-items: center; justify-content: center;
			height: 100vh; margin: 0;
		}
		.msg { text-align: center; opacity: 0.7; }
		.msg h2 { font-size: 16px; margin-bottom: 8px; }
		.msg p { font-size: 13px; }
	</style>
</head>
<body>
	<div class="msg">
		<h2>Webview build not found</h2>
		<p>Run <code>npm run build:webview</code> in webview-ui/</p>
	</div>
</body>
</html>`;
	}
}
