import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private timeout: NodeJS.Timeout | null = null;
  
  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'vscode-ollama.showOutput';
    this.statusBarItem.show();
    this.setDefault();
  }
  
  public setDefault(): void {
    this.statusBarItem.text = `$(hubot) Ollama`;
    this.statusBarItem.tooltip = 'Ollama for VS Code';
    this.statusBarItem.backgroundColor = undefined;
  }
  
  public setLoading(message: string = 'Working...'): void {
    this.clear();
    this.statusBarItem.text = `$(sync~spin) ${message}`;
    this.statusBarItem.tooltip = message;
  }
  
  public setText(message: string): void {
    this.clear();
    this.statusBarItem.text = `$(hubot) ${message}`;
    this.statusBarItem.tooltip = message;
  }

  public setFunction(message: string, command: string) {
    this.clear();
    this.statusBarItem.text = `${message}`;
    this.statusBarItem.command = command;
  }
  
  public setSuccess(message: string = 'Success'): void {
    this.clear();
    this.statusBarItem.text = `$(check) ${message}`;
    this.statusBarItem.tooltip = message;
    
    // Reset after a delay
    this.timeout = setTimeout(() => {
      this.setDefault();
    }, 3000);
  }
  
  public setError(message: string = 'Error'): void {
    this.clear();
    this.statusBarItem.text = `$(error) ${message}`;
    this.statusBarItem.tooltip = message;
    
    // Reset after a delay
    this.timeout = setTimeout(() => {
      this.setDefault();
    }, 5000);
  }
  
  private clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
  
  public dispose(): void {
    this.clear();
    this.statusBarItem.dispose();
  }
}