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

  constructor(private context: vscode.ExtensionContext, _mcpServerService: McpServerService) {}

  getTreeItem(element: McpTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: McpTreeItem): Thenable<McpTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    const servers = this.context.globalState.get<McpServer[]>('ollama.mcpServers', []);
    return Promise.resolve(servers.map(server => {
      const status = this.context.globalState.get<string>(`ollama.mcpServerStatus.${server.id}`, 'Stopped');
      return new McpTreeItem(
        server.name,
        server.id,
        status,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'vscode-ollama.configureMcpServer',
          title: 'Configure MCP Server',
          arguments: [server.id]
        }
      );
    }));
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
  constructor(
    public override readonly label: string,
    public readonly serverId: string,
    public readonly status: string,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label} (${status})`;
    this.description = status;
    this.contextValue = `mcpServer.${status.toLowerCase()}`; // e.g., mcpServer.running
    if (command) {
      this.command = command;
    }
    this.id = serverId; // Ensure unique ID for tree item
    this.iconPath = this.getIcon();
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.status === 'Running') {
      return new vscode.ThemeIcon('play', new vscode.ThemeColor('testing.iconPassed')); // Green for Running
    }
    return new vscode.ThemeIcon('server', new vscode.ThemeColor('disabledForeground')); // Gray for Stopped
  }
}