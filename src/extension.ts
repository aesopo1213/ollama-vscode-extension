import * as vscode from 'vscode';
import { OllamaService } from './services/ollamaService';
import { McpServerService } from './services/mcpServerService';
import { ChatViewProvider } from './provider/chatViewProvider';
import { ModelTreeDataProvider } from './provider/modelTreeDataProvider';
import { ChatHistoryProvider, ChatSession, ChatHistoryItem } from './provider/chatHistoryProvider';
import { McpSettingsProvider } from './provider/mcpSettingsProvider';
import { McpTreeDataProvider } from './provider/mcpTreeDataProvider';
import { StatusBarManager } from './ui/statusBarManager';
import { Logger } from './services/logger';

export function activate(context: vscode.ExtensionContext) {
  // Initialize services
  const mcpServerService = new McpServerService(context);
  const ollamaService = new OllamaService(context, mcpServerService);
  const statusBar = new StatusBarManager();
  const logger = Logger.getInstance();

  // Register tree view providers
  const modelProvider = new ModelTreeDataProvider(ollamaService);
  const chatHistoryProvider = new ChatHistoryProvider(context);
  const mcpProvider = new McpTreeDataProvider(context, mcpServerService);
  
  // Register webview providers
  const chatViewProvider = new ChatViewProvider(context, ollamaService, statusBar, chatHistoryProvider);
  const mcpSettingsProvider = new McpSettingsProvider(context, mcpServerService);
  
  // Register tree views
  const modelsView = vscode.window.createTreeView('ollamaModelsView', {
    treeDataProvider: modelProvider,
    showCollapseAll: true
  });
  
  const chatsView = vscode.window.createTreeView('ollamaChatsView', {
    treeDataProvider: chatHistoryProvider,
    showCollapseAll: true,
    canSelectMany: true
  });
  
  const mcpView = vscode.window.createTreeView('ollamaMcpView', {
    treeDataProvider: mcpProvider,
    showCollapseAll: false,
    canSelectMany: true
  });

  // Update context and selection for MCP view
  mcpView.onDidChangeSelection((e) => {
    logger.debug(`MCP view selection changed: ${e.selection.length} item(s) selected`);
    e.selection.forEach((item: any) => {
      logger.debug(`Selected MCP item: ${JSON.stringify({ serverId: item.serverId, label: item.label })}`);
    });
    mcpProvider.updateSelection(e.selection);
    vscode.commands.executeCommand('setContext', 'ollamaMcpView:selected', e.selection.length > 0);
  }, null, context.subscriptions);

  // Update context when selection changes for chats
  chatsView.onDidChangeSelection((e) => {
    logger.debug(`Chats view selection changed: ${e.selection.length} item(s) selected`);
    e.selection.forEach((item: any) => {
      logger.debug(`Selected chat item: ${JSON.stringify({ viewId: item.session?.viewId, title: item.session?.title })}`);
    });
    chatHistoryProvider.updateSelection(e.selection);
    const selected = e.selection.length > 0;
    vscode.commands.executeCommand('setContext', 'ollamaChatsView:selected', selected);
    if (e.selection.length > 0 && e.selection.every(item => item instanceof ChatHistoryItem)) {
      vscode.commands.executeCommand('setContext', 'viewItem', 'chatHistory');
    } else {
      vscode.commands.executeCommand('setContext', 'viewItem', null);
    }
  }, null, context.subscriptions);

  // Register commands
  const setupOllamaCommand = vscode.commands.registerCommand('vscode-ollama.setup', async () => {
    await ollamaService.setupOllama();
  });

  const startOllamaCommand = vscode.commands.registerCommand('vscode-ollama.startOllama', async () => {
    await ollamaService.startOllama();
  });

  const startChatCommand = vscode.commands.registerCommand('vscode-ollama.startChat', async (model: string) => {
    const models = await ollamaService.listModels();
    if (models.length === 0) {
      vscode.window.showErrorMessage('No Ollama models found. Please install at least one model.');
      return;
    }
    
    chatViewProvider.createOrShowWebview(undefined, undefined, {model: model});
  });

  const openChatHistoryCommand = vscode.commands.registerCommand('vscode-ollama.openChatHistory', (session: ChatSession) => {
    chatViewProvider.createOrShowWebview(undefined, session.viewId, session);
  });

  const deleteChatHistoryCommand = vscode.commands.registerCommand('vscode-ollama.deleteChatHistory', async (items?: ChatHistoryItem | ChatHistoryItem[], source: string = 'unknown') => {
    logger.debug(`deleteChatHistoryCommand invoked (source: ${source}) with items: ${items ? JSON.stringify(items) : 'null'}`);
    const selectedItems: ChatHistoryItem[] = chatHistoryProvider.getSelectedItems();
    logger.debug(`Processing ${selectedItems.length} items from chatHistoryProvider.getSelectedItems`);

    if (selectedItems.length === 0) {
      logger.warn(`No chats selected to delete (source: ${source})`);
      vscode.window.showInformationMessage('No chats selected to delete.');
      return;
    }

    const chatTitles = selectedItems.map(item => item.session.title);
    const titlesList = chatTitles.join(', ');
    logger.debug(`Selected chats to delete: ${titlesList}`);

    try {
      const chats = context.globalState.get<ChatSession[]>('ollama.chats', []);
      const viewIdsToDelete = selectedItems.map(item => item.session.viewId);
      const updatedChats = chats.filter(ch => !viewIdsToDelete.includes(ch.viewId));
      await context.globalState.update('ollama.chats', updatedChats);
      
      chatHistoryProvider.refresh();
      logger.info(`Deleted chat${selectedItems.length > 1 ? 's' : ''}: ${titlesList} (source: ${source})`);
      vscode.window.showInformationMessage(`Deleted chat${selectedItems.length > 1 ? 's' : ''}: ${titlesList}`);
    } catch (error) {
      logger.error(`Failed to delete chat${selectedItems.length > 1 ? 's' : ''} (source: ${source})`, 'ChatHistory', error);
      vscode.window.showErrorMessage(`Failed to delete chat${selectedItems.length > 1 ? 's' : ''}: ${error}`);
    }
  });

  const renameChatCommand = vscode.commands.registerCommand('vscode-ollama.renameChat', async (item?: ChatHistoryItem) => {
    if (!item) {
      item = chatHistoryProvider.getSelectedItems()[0];
    }
    
    if (!item || !(item instanceof ChatHistoryItem)) {
      vscode.window.showInformationMessage('No chat selected to rename.');
      return;
    }

    const newTitle = await vscode.window.showInputBox({
      prompt: `Enter new title for "${item.session.title}"`,
      value: item.session.title,
      validateInput: (value) => value.trim() ? null : 'Title cannot be empty'
    });

    if (!newTitle) {
      return; // User cancelled
    }

    const chats = context.globalState.get<ChatSession[]>('ollama.chats', []);
    const chatIndex = chats.findIndex(ch => ch.viewId === item?.session.viewId);
    if (chatIndex >= 0 && item) {
      chats[chatIndex]!.title = newTitle;
      await context.globalState.update('ollama.chats', chats);

      const savedTitles = context.globalState.get<{ [key: string]: string }>('ollama.titles', {});
      savedTitles[item.session.viewId] = newTitle;
      await context.globalState.update('ollama.titles', savedTitles);

      vscode.commands.executeCommand('vscode-ollama.updateChatTitle', { viewId: item.session.viewId, title: newTitle });

      chatHistoryProvider.refresh();
      logger.info(`Renamed chat: ${item.session.title} to ${newTitle}`);
      vscode.window.showInformationMessage(`Chat renamed to "${newTitle}".`);
    }
  });
  
  const generateFromSelectionCommand = vscode.commands.registerCommand('vscode-ollama.generateFromSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor found');
      return;
    }
    
    const selection = editor.selection;
    const text = editor.document.getText(selection);
    
    if (!text) {
      vscode.window.showErrorMessage('No text selected');
      return;
    }
    
    chatViewProvider.createOrShowWebview(text);
  });
  
  const refreshModelsCommand = vscode.commands.registerCommand('vscode-ollama.refreshModels', async () => {
    try {
      statusBar.setLoading('Refreshing models...');
      await modelProvider.refresh();
      statusBar.setSuccess('Models refreshed');
    } catch (error) {
      statusBar.setError('Failed to refresh models');
      vscode.window.showErrorMessage(`Error refreshing models: ${error}`);
      logger.error('Failed to refresh models', 'Models', error);
    }
  });

  const configureMcpServerCommand = vscode.commands.registerCommand('vscode-ollama.configureMcpServer', (serverId: string) => {
    logger.debug(`Opening webview panel to configure MCP server: ${serverId}`);
    mcpSettingsProvider.createWebviewPanel(serverId);
  });

  const addMcpServerCommand = vscode.commands.registerCommand('vscode-ollama.addMcpServer', async () => {
    try {
      logger.debug('Opening webview panel to add new MCP server');
      mcpSettingsProvider.createWebviewPanel();
    } catch (error) {
      logger.error('Failed to open MCP server configuration panel', 'MCP', error);
      vscode.window.showErrorMessage(`Failed to open MCP server configuration: ${error}`);
    }
  });

  const removeMcpServerCommand = vscode.commands.registerCommand('vscode-ollama.removeMcpServer', async (items?: any, source: string = 'unknown') => {
    logger.debug(`removeMcpServerCommand invoked (source: ${source}) with items: ${items ? JSON.stringify(items) : 'null'}`);
    const serverIds: string[] = mcpProvider.getSelectedItems().map(item => item.serverId).filter((id: string) => id);
    logger.debug(`Processing ${serverIds.length} items from mcpProvider.getSelectedItems`);

    if (serverIds.length === 0) {
      logger.warn(`No MCP servers selected (source: ${source})`);
      vscode.window.showErrorMessage('No MCP servers selected');
      return;
    }

    const serverNames = [];
    for (const id of serverIds) {
      const server = mcpServerService.getMcpServer(id);
      if (server) serverNames.push(server.name);
    }
    const namesList = serverNames.join(', ');
    if (!namesList) {
      logger.warn(`Selected MCP servers not found (source: ${source})`);
      vscode.window.showErrorMessage('Selected MCP servers not found');
      return;
    }

    logger.debug(`Selected MCP servers to remove: ${namesList}`);
    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Removing ${serverIds.length} MCP server${serverIds.length > 1 ? 's' : ''}...`
      }, async () => {
        for (const serverId of serverIds) {
          const server = mcpServerService.getMcpServer(serverId);
          if (server) {
            await mcpServerService.removeMcpServer(serverId);
            logger.info(`Removed MCP server: ${server.name} (source: ${source})`);
          }
        }
      });
      mcpProvider.refresh();
      logger.info(`Removed MCP server${serverIds.length > 1 ? 's' : ''}: ${namesList} (source: ${source})`);
      vscode.window.showInformationMessage(`Removed MCP server${serverIds.length > 1 ? 's' : ''}: ${namesList}`);
    } catch (error) {
      logger.error(`Failed to remove MCP server${serverIds.length > 1 ? 's' : ''} (source: ${source})`, 'MCP', error);
      vscode.window.showErrorMessage(`Failed to remove MCP server${serverIds.length > 1 ? 's' : ''}: ${error}`);
    }
  });

  const startMcpServerCommand = vscode.commands.registerCommand('vscode-ollama.startMcpServer', async (item: any) => {
    const serverId = item.serverId;
    if (!serverId) {
      vscode.window.showErrorMessage('No MCP server selected');
      return;
    }
    try {
      await mcpServerService.startMcpServer(serverId);
      mcpProvider.refresh();
      vscode.window.showInformationMessage(`Started MCP server`);
    } catch (error) {
      logger.error('Failed to start MCP server', 'MCP', error);
      vscode.window.showErrorMessage(`Failed to start MCP server: ${error}`);
    }
  });

  const stopMcpServerCommand = vscode.commands.registerCommand('vscode-ollama.stopMcpServer', async (item: any) => {
    const serverId = item.serverId;
    if (!serverId) {
      vscode.window.showErrorMessage('No MCP server selected');
      return;
    }
    try {
      await mcpServerService.stopMcpServer(serverId);
      mcpProvider.refresh();
      vscode.window.showInformationMessage(`Stopped MCP server`);
    } catch (error) {
      logger.error('Failed to stop MCP server', 'MCP', error);
      vscode.window.showErrorMessage(`Failed to stop MCP server: ${error}`);
    }
  });

  const testMcpServerCommand = vscode.commands.registerCommand('vscode-ollama.testMcpServer', async (item: any) => {
    const serverId = item.serverId;
    if (!serverId) {
      vscode.window.showErrorMessage('No MCP server selected');
      return;
    }
    try {
      const success = await mcpServerService.testMcpServer(serverId);
      vscode.window.showInformationMessage(success ? 'Test successful' : 'Test failed');
    } catch (error) {
      logger.error('Failed to test MCP server', 'MCP', error);
      vscode.window.showErrorMessage(`Failed to test MCP server: ${error}`);
    }
  });

  const refreshMcpServersCommand = vscode.commands.registerCommand('vscode-ollama.refreshMcpServers', () => {
    mcpProvider.refresh();
  });

  // Register everything to extension context
  context.subscriptions.push(
    setupOllamaCommand,
    startOllamaCommand,
    startChatCommand,
    openChatHistoryCommand,
    deleteChatHistoryCommand,
    renameChatCommand,
    generateFromSelectionCommand,
    refreshModelsCommand,
    configureMcpServerCommand,
    addMcpServerCommand,
    removeMcpServerCommand,
    startMcpServerCommand,
    stopMcpServerCommand,
    testMcpServerCommand,
    refreshMcpServersCommand,
    modelsView,
    chatsView,
    mcpView,
    statusBar
  );

  // Initial model loading
  ollamaService.listModels().then(() => {
    logger.debug('Models loaded successfully');
  }).catch((error) => {
    vscode.window.showErrorMessage('Failed to connect to Ollama. Make sure Ollama is running.');
    logger.error('Failed to load models', 'Ollama', error);
  });
  
  logger.info('Ollama extension activated');
  vscode.window.showInformationMessage('Ollama extension activated! Start a new chat or manage MCP servers from the sidebar.');
}

export function deactivate() {
  Logger.getInstance().info('Deactivating Ollama extension');
}