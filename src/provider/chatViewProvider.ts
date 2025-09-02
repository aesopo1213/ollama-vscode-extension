﻿import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OllamaService } from '../services/ollamaService';
import { StatusBarManager } from '../ui/statusBarManager';
import { getNonce } from '../utils/security';
import { ChatMessage, ChatRequest, CompletionResponse } from '../models/ollamaModel';
import { Logger } from '../services/logger';
import { ChatHistoryProvider } from '../provider/chatHistoryProvider';

export class ChatViewProvider {
  public static readonly viewType = 'ollama.chatView';
  
  private _panels: Map<string, vscode.WebviewPanel> = new Map();
  private _defaultTitle: string = 'Ollama Chat';
  private _titles: Map<string, string> = new Map();
  private _extensionUri: vscode.Uri;
  private _ollamaService: OllamaService;
  private _statusBar: StatusBarManager;
  private _disposables: vscode.Disposable[] = [];
  private _chatHistoryProvider: ChatHistoryProvider;
  private _abortControllers: Map<string, AbortController> = new Map();

  constructor(
    private readonly context: vscode.ExtensionContext,
    ollamaService: OllamaService,
    statusBar: StatusBarManager,
    chatHistoryProvider: ChatHistoryProvider
  ) {
    this._extensionUri = context.extensionUri;
    this._ollamaService = ollamaService;
    this._statusBar = statusBar;
    this._chatHistoryProvider = chatHistoryProvider;
    const savedTitles = this.context.globalState.get<{ [key: string]: string }>('ollama.titles', {});
    for (const [viewId, title] of Object.entries(savedTitles)) {
      this._titles.set(viewId, title);
    }
  }

  public createOrShowWebview(initialPrompt?: string, viewId: string = "", session?: any): void {
    if (!viewId) {
      viewId = getNonce();
    }

    const existingPanel = this._panels.get(viewId);
    if (existingPanel) {
      existingPanel.reveal(existingPanel.viewColumn);
      if (session) {
        this._sendMessageToWebview(existingPanel, 'restoreChat', viewId, {
          title: session.title,
          model: session.model,
          messages: session.messages
        });
        this._sendMessageToWebview(existingPanel, 'setTitle', viewId, { title: session.title });
        existingPanel.title = session.title || this._titles.get(viewId) || this._defaultTitle;
      } else if (initialPrompt) {
        this._sendMessageToWebview(existingPanel, 'setPrompt', viewId, { prompt: initialPrompt });
      }
      return;
    }

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    const panelTitle = this._titles.get(viewId) || session?.title || this._defaultTitle;

    const panel = vscode.window.createWebviewPanel(
      ChatViewProvider.viewType,
      panelTitle,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, 'media'),
          vscode.Uri.joinPath(this._extensionUri, 'dist'),
          vscode.Uri.joinPath(this._extensionUri, 'src', 'webview'),
          vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'js')
        ]
      }
    );

    this._panels.set(viewId, panel);

    panel.iconPath = {
      light: vscode.Uri.joinPath(this._extensionUri, 'media', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(this._extensionUri, 'media', 'icon-dark.svg')
    };

    try {
      panel.webview.html = this._getHtmlForWebview(panel.webview, viewId);
    } catch (error) {
      Logger.getInstance().error(`Failed to load chat.html: ${error}`);
      vscode.window.showErrorMessage('Failed to load chat Webview');
      panel.dispose();
      this._panels.delete(viewId);
      return;
    }

    panel.webview.onDidReceiveMessage(async (message) => {
      const viewId = message.data?.viewId || message.viewId;
      switch (message.command) {
        case 'ollamaChat':
          await this._handleOllamaChat(message.data);
          break;
        case 'stopOllamaChat':
          await this._handleStopOllamaChat(message.data);
          break;
        case 'generateCompletion':
          await this._handleGenerateCompletion(message.data);
          break;
        case 'getModels':
          await this._handleGetModels(message.data.viewId);
          break;
        case 'insertToEditor':
          this._handleInsertToEditor(message.data.text);
          break;
        case 'getTitle':
          this._handleGetTitle(viewId);
          break;
        case 'updateTitle':
          this._handleUpdateTitle(message.data);
          break;
        case 'updateModel':
          this._handleUpdateSelectedModel(message.data.model);
          break;
        case 'error':
          Logger.getInstance().error(`Webview JS error: ${JSON.stringify(message.error)}`);
          break;
      }
    }, null, this._disposables);

    panel.onDidDispose(() => this._disposePanel(viewId), null, this._disposables);

    if (session) {
      if (this._panels.get(viewId)) {
        this._sendMessageToWebview(panel, 'restoreChat', viewId, {
          title: session.title,
          model: session.model,
          messages: session.messages
        });
        this._sendMessageToWebview(panel, 'setTitle', viewId, { title: session.title });
      }
    } else if (initialPrompt) {
      if (this._panels.get(viewId)) {
        this._sendMessageToWebview(panel, 'setPrompt', viewId, { prompt: initialPrompt });
      }
    }

    this._handleGetModels(viewId);
  }

  private async _handleOllamaChat(data: any): Promise<void> {
    try {
      if (!data.id) {
        throw new Error('Missing message ID in ollamaChat request');
      }

      this._statusBar.setLoading('Generating response...');

      const model = data.model;
      const request: ChatRequest = {
        model,
        messages: data.messages,
        stream: true,
        options: data.options
      };

      const abortController = new AbortController();
      this._abortControllers.set(data.viewId, abortController);

      await this._ollamaService.ollamaChat(
        request,
        { signal: abortController.signal },
        (message: ChatMessage) => {
          const panel = this._panels.get(data.viewId);
          if (panel) {
            if (message.tool_calls && message.tool_calls.length > 0) {
              Logger.getInstance().info('Tool call: ' + JSON.stringify(message));
            } else {
              Logger.getInstance().info('API call: ' + JSON.stringify(message));
            }
            this._sendMessageToWebview(panel, 'updateResponse', data.viewId, { message });
          }
        },
        (messages: ChatMessage[]) => {
          const panel = this._panels.get(data.viewId);
          if (panel) {
            const finalMessage = messages[messages.length - 1];
            this._sendMessageToWebview(panel, 'completeResponse', data.viewId, { message: finalMessage });
            this._autoSaveChat(data.viewId, model, messages);
            Logger.getInstance().info('/api/chat response msg: ' + JSON.stringify(messages));
          }
          this._abortControllers.delete(data.viewId);
          this._statusBar.setSuccess('Response generated');
        }
      );
    } catch (error: any) {
      if (error.name === 'AbortError') {
        Logger.getInstance().info(`Chat aborted for viewId: ${data.viewId}`);
      } else {
        Logger.getInstance().error(`Error generating chat response: ${error}`);
        this._statusBar.setError('Error generating response');
        const panel = this._panels.get(data.viewId);
        if (panel) {
          this._sendMessageToWebview(panel, 'error', data.viewId, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      this._abortControllers.delete(data.viewId);
    }
  }

  private async _handleStopOllamaChat(data: { viewId: string }): Promise<void> {
    const { viewId } = data;
    const abortController = this._abortControllers.get(viewId);
    if (abortController) {
      abortController.abort();
      this._abortControllers.delete(viewId);
      this._statusBar.setSuccess('Chat stopped');
      const panel = this._panels.get(viewId);
      if (panel) {
        this._sendMessageToWebview(panel, 'stopResponse', viewId);
      }
      Logger.getInstance().info(`Stopped chat for viewId: ${viewId}`);
    }
  }

  private _handleUpdateSelectedModel(model: string): void {
    if (model) {
      this._panels.forEach((panel, panelViewId) => {
        this._sendMessageToWebview(panel, 'setModel', panelViewId, { model });
      });
    }
  }

  private _handleGetTitle(viewId: string): void {
    const title = this._titles.get(viewId) || this._defaultTitle;
    const panel = this._panels.get(viewId);
    if (panel) {
      this._sendMessageToWebview(panel, 'setTitle', viewId, { title });
    }
  }

  private _handleUpdateTitle(data: { title: string, viewId: string }): void {
    const { title, viewId } = data;
    if (title) {
      this._titles.set(viewId, title);
      const savedTitles = this.context.globalState.get<{ [key: string]: string }>('ollama.titles', {});
      savedTitles[viewId] = title;
      this.context.globalState.update('ollama.titles', savedTitles);

      const chats = this.context.globalState.get<any[]>('ollama.chats', []);
      const chatIndex = chats.findIndex(chat => chat.viewId === viewId);
      if (chatIndex >= 0) {
        chats[chatIndex].title = title;
        chats[chatIndex].timestamp = new Date().toISOString();
        this.context.globalState.update('ollama.chats', chats);
      } else {
        this._titles.set(viewId, title);
      }

      this._panels.forEach((panel, panelViewId) => {
        if (panelViewId === viewId) {
          panel.title = title;
          this._sendMessageToWebview(panel, 'setTitle', viewId, { title });
        }
      });

      this._chatHistoryProvider.refresh();
      Logger.getInstance().info(`Updated title to ${title} for viewId: ${viewId} via Webview`);
    }
  }

  private _autoSaveChat(viewId: string, model: string, messages: ChatMessage[]): void {
    if (!messages || messages.length === 0) {
      Logger.getInstance().debug(`No messages to save for viewId: ${viewId}`);
      return;
    }

    const chats = this.context.globalState.get<any[]>('ollama.chats', []);
    const existingIndex = chats.findIndex(chat => chat.viewId === viewId);
    let title = this._titles.get(viewId) || `Chat ${chats.length + 1}`;

    const newChat = {
      id: existingIndex >= 0 ? chats[existingIndex].id : Date.now().toString(),
      viewId,
      title,
      model,
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        images: msg.images,
        tool_calls: msg.tool_calls,
        tool_call_id: msg.tool_call_id
      })),
      timestamp: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      chats[existingIndex] = newChat;
    } else {
      chats.push(newChat);
      this._titles.set(viewId, title);
      const savedTitles = this.context.globalState.get<{ [key: string]: string }>('ollama.titles', {});
      savedTitles[viewId] = title;
      this.context.globalState.update('ollama.titles', savedTitles);
    }

    this.context.globalState.update('ollama.chats', chats);

    const panel = this._panels.get(viewId);
    if (panel) {
      this._sendMessageToWebview(panel, 'chatSaved', viewId);
      this._sendMessageToWebview(panel, 'setTitle', viewId, { title });
      panel.title = title;
    }

    this._chatHistoryProvider.refresh();
    Logger.getInstance().info(`Saved chat for viewId: ${viewId} with title: ${title}`);
  }

  private async _handleGenerateCompletion(data: any): Promise<void> {
    try {
      this._statusBar.setLoading('Generating response...');

      await this._ollamaService.generateCompletion(
        {
          model: data.model,
          prompt: data.prompt,
          system: data.system,
          template: data.template,
          context: data.context,
          stream: true,
          options: data.options
        },
        (response: CompletionResponse) => {
          const panel = this._panels.get(data.viewId);
          if (panel) {
            this._sendMessageToWebview(panel, 'updateResponse', data.viewId, {
              id: data.id,
              chunk: response.response,
              done: response.done
            });
          }
        },
        (finalResponse: CompletionResponse) => {
          const panel = this._panels.get(data.viewId);
          if (panel) {
            this._sendMessageToWebview(panel, 'completeResponse', data.viewId, {
              id: data.id,
              response: finalResponse.response,
              context: finalResponse.context
            });
          }
          this._statusBar.setSuccess('Response generated');
        }
      );
    } catch (error) {
      Logger.getInstance().error(`Error generating completion: ${error}`);
      this._statusBar.setError('Error generating response');

      const panel = this._panels.get(data.viewId);
      if (panel) {
        this._sendMessageToWebview(panel, 'error', data.viewId, {
          id: data.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async _handleGetModels(viewId: string): Promise<void> {
    const panel = this._panels.get(viewId);
    if (!panel) {
      Logger.getInstance().error(`No panel found for view ${viewId}`);
      return;
    }

    try {
      const models = await this._ollamaService.listModels();
      Logger.getInstance().debug(`Retrieved ${models.length} models for view ${viewId}: ${JSON.stringify(models)}`);
      this._sendMessageToWebview(panel, 'setModels', viewId, { models });
    } catch (error) {
      Logger.getInstance().error(`Error fetching models for view ${viewId}: ${error}`);
      this._sendMessageToWebview(panel, 'setModels', viewId, { models: [] });
      this._statusBar.setError('Failed to load models');
      vscode.window.showErrorMessage(`Failed to load Ollama models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private _handleInsertToEditor(text: string): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, text);
      });
    } else {
      vscode.window.showErrorMessage('No active editor found to insert text');
    }
  }

  private _sendMessageToWebview(panel: vscode.WebviewPanel, command: string, viewId: string, data?: any): void {
    const message = { command, viewId, data };
    panel.webview.postMessage(message);
  }

  private _getHtmlForWebview(webview: vscode.Webview, viewId: string): string {
    const theme = vscode.window.activeColorTheme;
    const isDarkTheme = theme.kind === vscode.ColorThemeKind.Dark || theme.kind === vscode.ColorThemeKind.HighContrast;

    const colors = {
      backgroundColor: isDarkTheme ? '#1e1e1e' : '#ffffff',
      inputBackground: isDarkTheme ? '#3c3c3c' : '#f3f3f3',
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

    const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'chat.html');
    const cssPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'css', 'chat.css');

    let htmlContent: string;
    let cssContent: string;
    try {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
      cssContent = fs.readFileSync(cssPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read files: ${error}`);
    }

    cssContent = cssContent
      .replace(/{{backgroundColor}}/g, colors.backgroundColor)
      .replace(/{{inputBackground}}/g, colors.inputBackground)
      .replace(/{{buttonBackground}}/g, colors.buttonBackground)
      .replace(/{{buttonHoverBackground}}/g, colors.buttonHoverBackground)
      .replace(/{{buttonTextColor}}/g, colors.buttonTextColor)
      .replace(/{{textColor}}/g, colors.textColor)
      .replace(/{{userMessageBackground}}/g, colors.userMessageBackground)
      .replace(/{{aiMessageBackground}}/g, colors.aiMessageBackground)
      .replace(/{{borderColor}}/g, colors.borderColor)
      .replace(/{{codeBackground}}/g, colors.codeBackground)
      .replace(/{{codeColor}}/g, colors.codeColor)
      .replace(/{{separatorColor}}/g, colors.separatorColor);

    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'js'));

    return htmlContent
      .replace(/{{viewId}}/g, viewId)
      .replace(/{{nonce}}/g, viewId)
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{cssContent}}/g, cssContent)
      .replace(/{{jsUri}}/g, jsUri.toString());
  }

  private _disposePanel(viewId: string): void {
    const panel = this._panels.get(viewId);
    if (panel) {
      panel.dispose();
      this._panels.delete(viewId);
    }
    this._abortControllers.delete(viewId);
  }
}