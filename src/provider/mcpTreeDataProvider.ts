import * as vscode from 'vscode';
import { McpServerService } from '../services/mcpServerService';

interface McpServer {
  id: string;
  name: string;
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: { [key: string]: string };
  url?: string;
  headers?: { [key: string]: string };
}

export class McpTreeDataProvider implements vscode.TreeDataProvider<McpTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<McpTreeItem | undefined | null | void> = new vscode.EventEmitter<McpTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<McpTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  private selectedItems: McpTreeItem[] = [];

  constructor(private context: vscode.ExtensionContext, _mcpServerService: McpServerService) { }

  getTreeItem(element: McpTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: McpTreeItem): Thenable<McpTreeItem[]> {
    if (element) {
      // Return child items (tools, prompts, resources) for server items
      if (element.contextValue === 'mcpServer.running' || element.contextValue === 'mcpServer.stopped') {
        return this.getServerChildren(element);
      }
      return Promise.resolve([]);
    }

    const servers = this.context.globalState.get<McpServer[]>('ollama.mcpServers', []);
    return Promise.resolve(servers.map(server => {
      const status = this.context.globalState.get<string>(`ollama.mcpServerStatus.${server.id}`, 'Stopped');
      const serverInfo = this.context.globalState.get<any>(`ollama.mcpServerInfo.${server.id}`, null);
      const toolCount = this.context.globalState.get<number>(`ollama.mcpServerToolCount.${server.id}`, 0);

      const label = `${server.name} (${server.type})`;
      const serverDescription = status === 'Running' ?
        `${toolCount} tools` :
        'Stopped';

      return new McpTreeItem(
        label,
        server.id,
        status,
        status === 'Running' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        {
          command: 'vscode-ollama.configureMcpServer',
          title: 'Configure MCP Server',
          arguments: [server.id]
        },
        serverDescription,
        serverInfo?.version ? `v${serverInfo.version}` : undefined
      );
    }));
  }

  private async getServerChildren(serverElement: McpTreeItem): Promise<McpTreeItem[]> {
    const serverId = serverElement.id;
    const tools = this.context.globalState.get<any[]>(`ollama.mcpServerTools.${serverId}`, []);
    const prompts = this.context.globalState.get<any[]>(`ollama.mcpServerPrompts.${serverId}`, []);
    const resources = this.context.globalState.get<any[]>(`ollama.mcpServerResources.${serverId}`, []);

    const children: McpTreeItem[] = [];

    // Add tools section
    if (tools.length > 0) {
      children.push(new McpTreeItem(
        `Tools (${tools.length})`,
        `${serverId}-tools`,
        'section',
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        undefined,
        'tools'
      ));
    }

    // Add prompts section
    if (prompts.length > 0) {
      children.push(new McpTreeItem(
        `Prompts (${prompts.length})`,
        `${serverId}-prompts`,
        'section',
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        undefined,
        'prompts'
      ));
    }

    // Add resources section
    if (resources.length > 0) {
      children.push(new McpTreeItem(
        `Resources (${resources.length})`,
        `${serverId}-resources`,
        'section',
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        undefined,
        'resources'
      ));
    }

    return children;
  }

  updateSelection(selection: readonly McpTreeItem[]): void {
    this.selectedItems = selection.slice();
    vscode.commands.executeCommand('setContext', 'ollamaMcpView:selected', this.selectedItems.length > 0);
  }

  getSelectedItems(): McpTreeItem[] {
    return this.selectedItems.slice();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

class McpTreeItem extends vscode.TreeItem {
  public override readonly id: string;

  constructor(
    public override readonly label: string,
    public readonly serverId: string,
    public readonly status: string,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
    command?: vscode.Command,
    description?: string,
    public readonly sectionType?: string
  ) {
    super(label, collapsibleState);
    this.id = serverId;
    this.tooltip = this.getTooltip();
    this.description = description || status;
    this.contextValue = this.getContextValue();
    if (command) {
      this.command = command;
    }
    this.iconPath = this.getIcon();
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.sectionType) {
      switch (this.sectionType) {
        case 'tools':
          return new vscode.ThemeIcon('tools');
        case 'prompts':
          return new vscode.ThemeIcon('comment');
        case 'resources':
          return new vscode.ThemeIcon('database');
        default:
          return new vscode.ThemeIcon('folder');
      }
    }

    if (this.status === 'Running') {
      return new vscode.ThemeIcon('play', new vscode.ThemeColor('testing.iconPassed')); // Green for Running
    }
    return new vscode.ThemeIcon('server', new vscode.ThemeColor('disabledForeground')); // Gray for Stopped
  }

  private getTooltip(): string {
    if (this.sectionType) {
      return `${this.label} - ${this.sectionType} available from this MCP server`;
    }
    return `${this.label} (${this.status})`;
  }

  private getContextValue(): string {
    if (this.sectionType) {
      return `mcpSection.${this.sectionType}`;
    }
    return `mcpServer.${this.status.toLowerCase()}`;
  }
}