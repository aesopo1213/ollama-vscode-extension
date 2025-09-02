import * as vscode from 'vscode';
import { ChatMessage } from '../models/ollamaModel';
import { Logger } from '../services/logger';

export interface ChatSession {
  id: string;
  viewId: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  timestamp: string;
}

export class ChatHistoryItem extends vscode.TreeItem {
  constructor(
    public readonly session: ChatSession,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(session.title, collapsibleState);
    
    this.tooltip = `${session.title} - ${session.model}`;
    this.description = new Date(session.timestamp).toLocaleString();
    this.iconPath = new vscode.ThemeIcon('history');
    this.contextValue = 'chatHistory';
    this.id = session.viewId; // Ensure unique ID for tree item
    
    this.command = {
      command: 'vscode-ollama.openChatHistory',
      title: 'Open Chat History',
      arguments: [session]
    };
  }
}

export class ChatHistoryProvider implements vscode.TreeDataProvider<ChatHistoryItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ChatHistoryItem | undefined | null | void> = new vscode.EventEmitter<ChatHistoryItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ChatHistoryItem | undefined | null | void> = this._onDidChangeTreeData.event;
  private selectedItems: ChatHistoryItem[] = [];

  constructor(private context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand('ollamaChatsView.refresh', () => this.refresh())
    );
  }
  
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  getTreeItem(element: ChatHistoryItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: ChatHistoryItem): Promise<ChatHistoryItem[]> {
    if (element) {
      return [];
    }
    
    const chats = this.context.globalState.get<ChatSession[]>('ollama.chats', []);
    
    if (chats.length === 0) {
      return [];
    }
    
    chats.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return chats.map(chat => new ChatHistoryItem(chat, vscode.TreeItemCollapsibleState.None));
  }

  updateSelection(selection: readonly ChatHistoryItem[]): void {
    this.selectedItems = selection.slice();
    Logger.getInstance().debug(`ChatHistoryProvider: Updated selection with ${this.selectedItems.length} item(s)`);
  }

  getSelectedItems(): ChatHistoryItem[] {
    return this.selectedItems.slice();
  }
}