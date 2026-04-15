/*---------------------------------------------------------------------------------------------
 *  Graphide Panel Contribution
 *  Webview-based: Loads React app inside sidebar panel
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewsRegistry, Extensions as ViewExtensions, IViewContainersRegistry, ViewContainerLocation } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { WebviewViewPane } from '../../webviewView/browser/webviewViewPane.js';
import { GraphideWebviewProvider } from './graphideWebviewProvider.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

const GRAPHIDE_VIEW_TYPE = GraphideWebviewProvider.VIEW_TYPE;

// Register the GraphIDE icon
const graphideViewIcon = registerIcon('graphide-view-icon', Codicon.hubot, localize('graphideViewIcon', 'View icon of the Graphide panel.'));

// Register the view container (sidebar panel)
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'graphide',
	title: localize2('graphide', 'Analyze Code'),
	icon: graphideViewIcon,
	order: 10,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['graphide', { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'graphide-view-container',
	hideIfEmpty: false
}, ViewContainerLocation.AuxiliaryBar, { isDefault: false });

// Register the view as a webview view (renders React app)
Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: GRAPHIDE_VIEW_TYPE,
	name: localize2('graphidePanel', 'Graphide'),
	ctorDescriptor: new SyncDescriptor(WebviewViewPane),
	canToggleVisibility: true,
	canMoveView: true,
	hideByDefault: false,
	collapsed: false,
	order: 1,
	focusCommand: { id: 'graphide.focus' }
}], VIEW_CONTAINER);

// Register the webview provider (resolves React content into the webview)
registerWorkbenchContribution2(GraphideWebviewProvider.ID, GraphideWebviewProvider, WorkbenchPhase.AfterRestored);

const openGraphidePanel = async (accessor: ServicesAccessor): Promise<void> => {
	const viewsService = accessor.get(IViewsService);
	await viewsService.openView(GRAPHIDE_VIEW_TYPE, true);
};

// Register the commands that surface the Graphide panel
CommandsRegistry.registerCommand('graphide.analyze', openGraphidePanel);
CommandsRegistry.registerCommand('graphide.focus', openGraphidePanel);

// Register Status Bar Contribution
class GraphIDEStatusBarContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IStatusbarService private readonly statusBarService: IStatusbarService
	) {
		super();
		this.registerStatusBar();
	}

	private registerStatusBar(): void {
		const item = this.statusBarService.addEntry({
			name: localize('graphide.analyze', "Graphide Analyze"),
			text: '$(hubot) Analyze',
			tooltip: localize('graphide.analyze.tooltip', "Analyze Code with Graphide"),
			command: 'graphide.analyze',
			ariaLabel: localize('graphide.analyze', "Graphide Analyze")
		}, 'graphide.analyze', StatusbarAlignment.RIGHT, 100);

		this._register(item);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(GraphIDEStatusBarContribution, LifecyclePhase.Restored);
