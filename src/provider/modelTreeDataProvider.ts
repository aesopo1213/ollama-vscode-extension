import * as vscode from 'vscode';
import { OllamaService } from '../services/ollamaService';
import { Model } from '../models/ollamaModel';

export class ModelTreeItem extends vscode.TreeItem {
  constructor(
    public readonly model: Model,
    public override readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(model.name, collapsibleState);
    
    this.tooltip = `${model.name} (${formatSize(model.size)})`;
    this.description = formatSize(model.size);
    this.iconPath = new vscode.ThemeIcon('hubot');
    
    this.command = {
      command: 'vscode-ollama.startChat',
      title: 'Start Chat with Model',
      arguments: [model.name]
    };
  }
}

export class ModelTreeDataProvider implements vscode.TreeDataProvider<ModelTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ModelTreeItem | undefined | null | void> = new vscode.EventEmitter<ModelTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ModelTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  
  constructor(private ollamaService: OllamaService) {}
  
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  getTreeItem(element: ModelTreeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: ModelTreeItem): Promise<ModelTreeItem[]> {
    if (element) {
      return []; // No children for model items
    }
    
    try {
      const models = await this.ollamaService.listModels();
      
      if (models.length === 0) {
        vscode.window.showInformationMessage('No Ollama models found. Install a model using the Ollama CLI.');
        return [];
      }
      
      return models.map(model => new ModelTreeItem(model, vscode.TreeItemCollapsibleState.None));
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load models: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}