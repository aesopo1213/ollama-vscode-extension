import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../services/logger';
import { getNonce } from '../utils/security';
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

export class McpSettingsProvider {
  private _logger = Logger.getInstance();
  private _panels: Map<string, vscode.WebviewPanel> = new Map();
  private mcpServerService: McpServerService;
  private _extensionUri: vscode.Uri;
  
  constructor(private context: vscode.ExtensionContext, mcpServerService: McpServerService) {
    this.mcpServerService = mcpServerService;
    this._extensionUri = context.extensionUri;
  }

  public createWebviewPanel(serverId?: string): void {
    const panelKey = serverId || 'new';
    let panel = this._panels.get(panelKey);
    if (panel) {
      panel.reveal(vscode.ViewColumn.Active);
      if (serverId) {
        panel.webview.postMessage({ command: 'getServer', serverId });
      } else {
        panel.webview.postMessage({ command: 'loadServer', server: {}, status: 'Stopped' });
      }
      return;
    }

    panel = vscode.window.createWebviewPanel(
      'mcpServerSettings',
      serverId ? 'Configure MCP Server' : 'Add New MCP Server',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, 'src', 'webview'), 
          vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'js')

        ]
      }
    );

    this._panels.set(panelKey, panel);
    try {
       panel.webview.html = this._getHtmlForWebview(panel.webview, panelKey);
    } catch (error) {
      Logger.getInstance().error(`Failed to load chat.html: ${error}`);
      vscode.window.showErrorMessage('Failed to load chat Webview');
      panel.dispose();
      this._panels.delete(panelKey);
      return;
    }

    panel.webview.onDidReceiveMessage(
      async (message: any) => {
        try {
          switch (message.command) {
            case 'saveServer':
              await this.handleSaveServer(message.server);
              panel?.dispose();
              vscode.window.showInformationMessage(`MCP server '${message.server.name}' saved`);
              vscode.commands.executeCommand('vscode-ollama.refreshMcpServers');
              break;
            case 'cancel':
              panel?.dispose();
              break;
            case 'getServer':
              this._logger.info(`Processing getServer for serverId: ${message.serverId}`);
              const server = this.mcpServerService.getMcpServer(message.serverId);
              const status = this.context.globalState.get<string>(`ollama.mcpServerStatus.${message.serverId}`, 'Stopped');
              panel?.webview.postMessage({ command: 'loadServer', server: server || {}, status });
              break;
            case 'testServer':
              this._logger.info(`Testing server: ${JSON.stringify(message.server)}`);
              const success = await this.mcpServerService.testMcpServer(message.server);
              this._logger.debug("Is Success: " + success)
              panel?.webview.postMessage({
                command: 'testResult',
                success,
                error: success ? undefined : 'Connection failed. Ensure the command is valid and the server is accessible.'
              });
              break;
          }
        } catch (error) {
          this._logger.error(`Message handler error: ${message.command}`, error);
          panel?.webview.postMessage({ command: 'error', error: `Failed to test server: ${String(error)}` });
        }
      },
      undefined,
      this.context.subscriptions
    );

    panel.onDidDispose(() => {
      this._panels.delete(panelKey);
    }, null, this.context.subscriptions);

    if (serverId) {
      panel.webview.postMessage({ command: 'getServer', serverId });
    } else {
      panel.webview.postMessage({ command: 'loadServer', server: {}, status: 'Stopped' });
    }
  }

  private async handleSaveServer(server: McpServer): Promise<void> {
    if (!server.name) {
      throw new Error('Server name is required');
    }
    if (!server.id) {
      server.id = getNonce();
      await this.mcpServerService.addMcpServer(server);
    } else {
      await this.mcpServerService.updateMcpServer(server.id, server);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview, viewId: string): string {
    const theme = vscode.window.activeColorTheme;
    const isDarkTheme = theme.kind === vscode.ColorThemeKind.Dark || theme.kind === vscode.ColorThemeKind.HighContrast;
    
    const colors = {
      backgroundColor: isDarkTheme ? '#1e1e1e' : '#ffffff',
      inputBackground: isDarkTheme ? '#3c3c3c' : '#f3f3f3',
      inputBorder: isDarkTheme ? '#6b6b6b' : '#e0e0e0', // Lighter border for dark mode
      buttonBackground: isDarkTheme ? '#0e639c' : '#007acc',
      buttonHoverBackground: isDarkTheme ? '#1177bb' : '#0062a3',
      buttonTextColor: isDarkTheme ? '#ffffff' : '#ffffff',
      textColor: isDarkTheme ? '#cccccc' : '#333333',
      userMessageBackground: isDarkTheme ? '#2b3a55' : '#e6f7ff',
      aiMessageBackground: isDarkTheme ? '#3c3c3c' : '#f5f5f5',
      borderColor: isDarkTheme ? '#474747' : '#e0e0e0',
      codeBackground: isDarkTheme ? '#1e1e1e' : '#f5f5f5',
      codeColor: isDarkTheme ? '#d7ba7d' : '#800000',
      separatorColor: isDarkTheme ? '#444444' : '#e0e0e0'
    };
    
    const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'mcpSettings.html');
    const cssPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'css', 'mcpSettings.css');
    
    let htmlContent: string;
    let cssContent: string;
    try {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
      cssContent = fs.readFileSync(cssPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read files: ${error}`);
    }
    
    // Replace color placeholders in CSS
    cssContent = cssContent
      .replace(/{{backgroundColor}}/g, colors.backgroundColor)
      .replace(/{{inputBackground}}/g, colors.inputBackground)
      .replace(/{{inputBorder}}/g, colors.inputBorder)
      .replace(/{{buttonBackground}}/g, colors.buttonBackground)
      .replace(/{{buttonHoverBackground}}/g, colors.buttonHoverBackground)
      .replace(/{{buttonTextColor}}/g, colors.buttonTextColor)
      .replace(/{{textColor}}/g, colors.textColor)
      .replace(/{{userMessageBackground}}/g, colors.userMessageBackground)
      .replace(/{{aiMessageBackground}}/g, colors.aiMessageBackground)
      .replace(/{{borderColor}}/g, colors.borderColor)
      .replace(/{{codeBackground}}/g, colors.codeBackground)
      .replace(/{{codeColor}}/g, colors.codeColor)
      .replace(/{{separatorColor}}/g, colors.separatorColor)
      .replace(/{{descriptionColor}}/g, isDarkTheme ? '#999999' : '#666666')
      .replace(/{{focusBorder}}/g, isDarkTheme ? '#1177bb' : '#007acc')
      .replace(/{{secondaryButtonBackground}}/g, isDarkTheme ? '#3c3c3c' : '#6c757d')
      .replace(/{{secondaryButtonTextColor}}/g, isDarkTheme ? '#cccccc' : '#ffffff')
      .replace(/{{secondaryButtonHoverBackground}}/g, isDarkTheme ? '#474747' : '#5a6268')
      .replace(/{{successColor}}/g, '#4CAF50')
      .replace(/{{errorColor}}/g, isDarkTheme ? '#f48771' : '#d73a49');
    
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'js'));
    
    // Replace placeholders in HTML
    return htmlContent
      .replace(/{{viewId}}/g, viewId)
      .replace(/{{nonce}}/g, viewId)
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{cssContent}}/g, cssContent)
      .replace(/{{jsUri}}/g, jsUri.toString());
  }
}