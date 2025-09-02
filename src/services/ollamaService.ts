import axios from 'axios';
import * as vscode from 'vscode';
import { ChatRequest, ChatResponse, CompletionOptions, CompletionResponse, Model, Tool, ParameterSchema, ToolCall, ChatMessage } from '../models/ollamaModel';
import { Logger } from './logger';
import { McpServerService } from './mcpServerService';
import { exec } from 'child_process';
import { promisify } from 'util';
import { uuid } from '../utils/security';

const execAsync = promisify(exec);

export class OllamaService {
  private _baseUrl: string;
  private _models: Model[] = [];
  private _isApiAvailable: boolean = false;
  private mcpServerService: McpServerService;
  private logger: Logger;
  private sessionIdCounterMap: Map<string, number> = new Map(); // Tracks next ID for each session

  constructor(private context: vscode.ExtensionContext, mcp: McpServerService) {
    const config = vscode.workspace.getConfiguration('vscode-ollama');
    this._baseUrl = `http://${config.get<string>('apiHost', 'localhost')}:${config.get<string>('apiPort', '11434')}`;
    this.mcpServerService = mcp;
    this.logger = Logger.getInstance();

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('vscode-ollama.apiHost') || e.affectsConfiguration('vscode-ollama.apiPort')) {
        const config = vscode.workspace.getConfiguration('vscode-ollama');
        this._baseUrl = `http://${config.get<string>('apiHost', 'localhost')}:${config.get<string>('apiPort', '11434')}`;
      }
    }, null, this.context.subscriptions);
  }



  private getMcpSystemPrompt(): string {
    return this.mcpServerService.getMcpSystemPrompt();
  }

  private getMcpTools(): Tool[] {
    const mcpTools = this.mcpServerService.getMcpToolsForOllama();
    const tools: Tool[] = [];

    for (const [serverName, serverTools] of Object.entries(mcpTools)) {
      for (const tool of serverTools) {
        const properties: Record<string, ParameterSchema> = {};
        for (const [key, value] of Object.entries(tool.parameters || {})) {
          properties[key] = {
            type: this.inferParameterType(value),
            description: `Parameter ${key} for ${tool.name}`
          };
        }

        tools.push({
          type: 'function',
          function: {
            name: `${serverName}:${tool.name}`,
            description: tool.description,
            parameters: {
              type: 'object',
              properties,
              required: []
            }
          }
        });
      }
    }
    return tools;
  }

  private inferParameterType(value: unknown): ParameterSchema['type'] {
    if (value === null) return 'string';
    switch (typeof value) {
      case 'string':
        return 'string';
      case 'number':
        return Number.isInteger(value) ? 'integer' : 'number';
      case 'boolean':
        return 'boolean';
      case 'object':
        return Array.isArray(value) ? 'array' : 'object';
      default:
        return 'string';
    }
  }

  public async setupOllama(): Promise<void> {
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = 'Configure Settings';
    quickPick.placeholder = 'Select an option to configure';
    quickPick.canSelectMany = false;

    const config = vscode.workspace.getConfiguration('vscode-ollama');
    const userInfo: { host: string; port: number } = {
      host: config.get<string>('apiHost', 'localhost'),
      port: config.get<number>('apiPort', 11434),
    };

    const steps = [
      {
        label: 'Set Host',
        description: userInfo.host,
        action: async () => {
          const host = await vscode.window.showInputBox({
            prompt: 'Enter the host',
            placeHolder: 'e.g., localhost',
            value: userInfo.host,
            validateInput: (value) => (!value.trim() ? 'Host cannot be empty.' : null)
          });
          if (host) userInfo.host = host;
          await config.update('apiHost', host, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(`Saved Host: ${host || 'None'}`);
          return !!host;
        }
      },
      {
        label: 'Set Port',
        description: userInfo.port.toString(),
        action: async () => {
          const port = await vscode.window.showInputBox({
            prompt: 'Enter the port number',
            placeHolder: 'e.g., 11434',
            value: userInfo.port.toString(),
            validateInput: (value) => {
              const portNum = parseInt(value);
              if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
                return 'Please enter a valid port number (1-65535).';
              }
              return null;
            }
          });
          if (port) userInfo.port = parseInt(port);
          await config.update('apiPort', port, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(`Saved Port: ${port || 'None'}`);
          return !!port;
        }
      }
    ];

    function updateQuickPickItems() {
      quickPick.items = steps.map(step => ({
        label: step.label,
        description: step.label === 'Set Port' && userInfo.port ? `Current: ${userInfo.port}` :
                step.label === 'Set Host' && userInfo.host ? `Current: ${userInfo.host}` : step.description
      }));
    }

    quickPick.items = steps;
    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        const step = steps.find(s => s.label === selected.label);
        if (step) {
          const continueFlow = await step.action();
          if (!continueFlow) quickPick.hide();
          else updateQuickPickItems();
        }
      }
    });

    quickPick.show();
  }

  public async startOllama(): Promise<boolean> {
    const available = await this.checkApiAvailability();
    if (available) {
      vscode.window.showInformationMessage('Ollama is started!');
      return true;
    }
    const terminal = vscode.window.createTerminal({
      name: 'Ollama Extension'
    });
    terminal.sendText(`ollama serve\n`);
    return true;
  }

  public async checkApiAvailability(): Promise<boolean> {
    try {
      await axios.get(`${this._baseUrl}/api/tags`);
      this._isApiAvailable = true;
      return true;
    } catch (error) {
      this._isApiAvailable = false;
      return false;
    }
  }

  public async listModels(): Promise<Model[]> {
    const available = await this.checkApiAvailability();
    this.logger.debug(`available: ${available}`);
    if (!available) {
      const button = 'Run';
      const result = await vscode.window.showInformationMessage(
        'Ollama is not started! Start Ollama?',
        button,
        'Cancel'
      );
      if (result === button) {
        await vscode.commands.executeCommand('vscode-ollama.startOllama');
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        throw new Error(`Ollama is not started!`);
      }
    }
    try {
      const response = await axios.get(`${this._baseUrl}/api/tags`);
      const models: Model[] = response.data.models || [];
      // Throttle tool support checks to avoid overwhelming the server
      this._models = [];
      for (const model of models) {
        const supportsTools = await this.checkModelToolSupport(model.name);
        this._models.push({ ...model, supportsTools });
      }
      this.logger.debug(`Models: ${JSON.stringify(this._models)}`);
      return this._models;
    } catch (error) {
      this.logger.error('Error fetching models:', 'API', error);
      throw new Error(`Failed to fetch models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async getModelDetails(modelName: string): Promise<any> {
    try {
      const response = await axios.post(`${this._baseUrl}/api/show`, { name: modelName });
      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching details for model ${modelName}`, 'API', error);
      throw new Error(`Failed to fetch model details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async ollamaChat(
    request: ChatRequest,
    options: { signal?: AbortSignal; sessionId?: string } = {},
    onUpdate?: (message: ChatMessage) => void,
    onComplete?: (messages: ChatMessage[]) => void
  ): Promise<ChatMessage | null> {
    const config = vscode.workspace.getConfiguration('vscode-ollama');
    const useStreaming = config.get<boolean>('showStreamingOutput') !== false;
    const sessionId = options.sessionId || uuid(); // Generate session ID for internal tracking

    const mcpTools = this.getMcpTools();
    const model = this._models.find(m => m.name === request.model);
    if (mcpTools.length > 0 && model?.supportsTools) {
      request.tools = mcpTools;
    } else if (mcpTools.length > 0) {
      this.logger.warn(`Model ${request.model} does not support tool calling; omitting tools field.`);
    }

    // Initialize ID counter for this session if not already set

    if (!this.sessionIdCounterMap.has(sessionId)) {
      this.sessionIdCounterMap.set(sessionId, Math.max(...request.messages.map(m => Number(m.id) || 0)) + 1);
    }

    // Use provided message IDs without modification
    const messagesWithIds = request.messages.map(msg => ({
      ...msg,
      id: msg.id
    }));

    const requestOptions: ChatRequest = {
      ...request,
      messages: messagesWithIds,
      stream: useStreaming && !!onUpdate,
    };
    this.logger.info(`Session ${sessionId} /api/chat request: ${JSON.stringify(requestOptions)}`);

    try {
      if (requestOptions.stream) {
        return await this._handleStreamingChat(sessionId, requestOptions, options.signal, onUpdate, onComplete);
      } else {
        const response = await axios.post(`${this._baseUrl}/api/chat`, {
          ...requestOptions,
          stream: false,
        }, options.signal ? { signal: options.signal } : {});
        return await this._handleNonStreamingChat(sessionId, response.data, requestOptions, onComplete);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        this.logger.info(`Session ${sessionId} chat request aborted`);
        return null;
      }
      if (error.response) {
        const responseData = error.response.data
          ? JSON.stringify(error.response.data, (_key, value) =>
              typeof value === 'object' && value !== null && (value.constructor?.name === 'Socket' || value.constructor?.name === 'Buffer')
                ? '[Circular]'
                : value
            )
          : 'No response data';
        this.logger.error(`Session ${sessionId} Ollama server response: status=${error.response.status}, data=${responseData}`);
        throw new Error(`Failed to generate chat response: ${responseData}`);
      }
      throw new Error(`Failed to generate chat response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async checkModelToolSupport(modelName: string): Promise<boolean> {
    const cacheKey = `ollama_tool_support_${modelName}`;
    const cached = this.context.globalState.get<boolean>(cacheKey);
    if (cached !== undefined) {
      this.logger.debug(`Cached tool support for ${modelName}: ${cached}`);
      return cached;
    }

    try {
      // Check server version
      const serverVersion = await this.getServerVersion();
      const [majorVersion, minorVersion, patchVersion] = serverVersion.split('.').map(Number);
      if (majorVersion === 0 && ((minorVersion ?? 0) < 1 || ((minorVersion ?? 0) === 1 && (patchVersion ?? 0) < 26))) {
        this.logger.info(`Ollama server version ${serverVersion} does not support tools.`);
        await this.context.globalState.update(cacheKey, false);
        return false;
      }

      // Check model metadata
      const details = await this.getModelDetails(modelName);
      const modelfile = details?.modelfile.toUpperCase() || '';
      this.logger.debug(`Model ${modelName} modelfile: ${modelfile}`);
      if (modelfile.includes('TOOLS') || modelfile.includes('FUNCTION_CALLING')) {
        this.logger.debug(`Model ${modelName} supports tools based on modelfile.`);
        await this.context.globalState.update(cacheKey, true);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.warn(`Failed to check tool support for ${modelName}: ${error}`);
      await this.context.globalState.update(cacheKey, false);
      return false;
    }
  }

  private async getServerVersion(): Promise<string> {
    try {
      const response = await axios.get(`${this._baseUrl}/api/version`);
      return response.data?.version ?? '0.0.0';
    } catch (error) {
      this.logger.debug(`API /api/version not available, falling back to command: ${error}`);
      try {
        const { stdout } = await execAsync('ollama --version');
        const match = stdout.match(/version (\d+\.\d+\.\d+)/);
        return match?.[1] ?? '0.0.0';
      } catch (cmdError) {
        this.logger.warn(`Failed to get Ollama version: ${cmdError}`);
        return '0.0.0';
      }
    }
  }

  private getNextId(sessionId: string): number {
    const currentId = this.sessionIdCounterMap.get(sessionId) || 1;
    Logger.getInstance().info(`this.sessionIdCounterMap currentId: ${JSON.stringify(currentId)}`)
    this.sessionIdCounterMap.set(sessionId, currentId + 1);
    return currentId;
  }

  private async _handleStreamingChat(
    sessionId: string,
    request: ChatRequest,
    signal?: AbortSignal,
    onUpdate?: (response: ChatMessage) => void,
    onComplete?: (finalResponse: ChatMessage[]) => void
  ): Promise<ChatMessage | null> {
    const response = await axios.post(
      `${this._baseUrl}/api/chat`,
      request,
      { responseType: 'stream', ...(signal ? { signal } : {}) }
    );

    let currentMessage: ChatMessage = { id: this.getNextId(sessionId).toString(), content: '' };
    let finalMessageObject: ChatMessage | null = null;
    let messages = [...request.messages];

    response.data.on('data', async (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const json: ChatResponse = JSON.parse(line);

            if (json.message) {
              if (onUpdate && !json.done) {
                if (!json.message.id) {
                  json.message.id = currentMessage.id;
                }
                onUpdate(json.message);
              }
              if (!currentMessage.role && json.message.role) {
                currentMessage.role = json.message.role;
              }
              if (json.message.content) {
                currentMessage.content += json.message.content;
              }
              if (json.message.tool_calls) {
                if (!currentMessage.tool_calls) currentMessage.tool_calls = [];
                currentMessage.tool_calls = currentMessage.tool_calls?.concat(
                  json.message.tool_calls.map(tc => ({
                    ...tc,
                    id: this.getNextId(sessionId).toString(), // Assign numeric tool_call_id
                    function: { ...tc.function }
                  }))
                );
              }
            }

            if (json.done) {
              if (currentMessage.role) {
                const message: ChatMessage = {
                  id: currentMessage.id,
                  role: currentMessage.role,
                  content: currentMessage.content,
                  ...(currentMessage.tool_calls ? { tool_calls: currentMessage.tool_calls } : {}),
                };
                const messageObject: ChatMessage = message;

                messages.push(message);

                if (message.tool_calls && message.tool_calls.length > 0) {
                  messages = await this._handleToolCalls(sessionId, message.tool_calls, messages, onUpdate);
                  const newRequest: ChatRequest = {
                    ...request,
                    messages,
                    stream: request.stream ?? false,
                    ...(request.tools ? { tools: request.tools } : {}),
                  };
                  const followUpMessage = await this._handleStreamingChat(sessionId, newRequest, signal, onUpdate, onComplete);
                  finalMessageObject = followUpMessage || messageObject;
                } else {
                  finalMessageObject = messageObject;
                  if (onComplete) {
                    messages = messages.filter(m => m.role !== 'system');
                    onComplete(messages);
                  }
                }

                currentMessage = { id: this.getNextId(sessionId).toString(), content: '' };
              } else {
                finalMessageObject = { id: this.getNextId(sessionId).toString(), role: 'assistant', content: '' };
                if (onComplete) {
                  messages = messages.filter(m => m.role !== 'system');
                  onComplete(messages);
                }
              }
            }
          } catch (e) {
            this.logger.error(`Session ${sessionId} error parsing streaming response`, 'API', e);
          }
        }
      }
    });

    return new Promise((resolve) => {
      response.data.on('end', () => resolve(finalMessageObject));
    });
  }

  private async _handleNonStreamingChat(
    sessionId: string,
    response: ChatResponse,
    request: ChatRequest,
    onComplete?: (finalResponse: ChatMessage[]) => void
  ): Promise<ChatMessage | null> {
    const message: ChatMessage = {
      ...response.message,
      id: response.message.id || this.getNextId(sessionId).toString(),
      ...(response.message.tool_calls ? {
        tool_calls: response.message.tool_calls.map(tc => ({
          ...tc,
          id: this.getNextId(sessionId).toString(), // Assign numeric tool_call_id
          function: { ...tc.function }
        }))
      } : {})
    };
    let messages = [...request.messages, message];

    if (message.tool_calls) {
      messages = await this._handleToolCalls(sessionId, message.tool_calls, messages);
      const newRequest: ChatRequest = {
        ...request,
        messages,
        stream: false,
        ...(request.tools ? { tools: request.tools } : {})
      };
      const newResponse = await axios.post(`${this._baseUrl}/api/chat`, newRequest);
      const followUpMessage: ChatMessage = {
        ...newResponse.data.message,
        id: this.getNextId(sessionId).toString()
      };
      messages.push(followUpMessage);
      if (onComplete) {
        messages = messages.filter(m => m.role !== 'system');
        onComplete(messages);
      }
      return followUpMessage;
    }

    if (onComplete) {
      messages = messages.filter(m => m.role !== 'system');
      onComplete(messages);
    }
    return message;
  }

  private async _handleToolCalls(
    sessionId: string,
    toolCalls: ToolCall[],
    messages: ChatMessage[],
    onUpdate?: (response: ChatMessage) => void
  ): Promise<ChatMessage[]> {
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const parameters = toolCall.function.arguments;
      const toolCallId = toolCall.id || this.getNextId(sessionId).toString(); // Use provided tool_call_id or generate new numeric ID

      const originalToolName = toolName.includes(':') ? toolName.split(':').pop() : toolName;

      const toolResponse = await this.mcpServerService.sendMcpRequest({
        toolName: originalToolName!,
        parameters
      });

      const message: ChatMessage = {
        id: this.getNextId(sessionId).toString(),
        role: 'tool',
        content: JSON.stringify(toolResponse.result || { error: toolResponse.error }),
        tool_call_id: toolCallId
      };

      if (onUpdate) {
        onUpdate(message);
      }

      messages.push(message);

      this.logger.info(`Session ${sessionId} tool call ${toolName} (tool_call_id: ${toolCallId}): ${JSON.stringify(toolResponse)}`);
    }
    return messages;
  }

  public async generateCompletion(
    options: CompletionOptions,
    onUpdate?: (response: CompletionResponse) => void,
    onComplete?: (finalResponse: CompletionResponse) => void
  ): Promise<CompletionResponse | null> {
    const config = vscode.workspace.getConfiguration('vscode-ollama');
    const useStreaming = config.get<boolean>('showStreamingOutput') !== false;

    const systemPrompt = this.getMcpSystemPrompt();
    if (systemPrompt) {
      options.system = options.system ? `${options.system}\n${systemPrompt}` : systemPrompt;
    }

    const requestOptions: CompletionOptions = {
      ...options,
      stream: useStreaming && !!onUpdate,
    };

    try {
      if (requestOptions.stream) {
        const response = await axios.post(
          `${this._baseUrl}/api/generate`,
          requestOptions,
          { responseType: 'stream' }
        );

        let fullResponse = '';
        let finalResponseObject: CompletionResponse | null = null;

        response.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const json = JSON.parse(line);
                if (onUpdate) {
                  onUpdate(json);
                }
                fullResponse += json.response || '';

                if (json.done) {
                  finalResponseObject = {
                    ...json,
                    response: fullResponse,
                  };

                  if (onComplete && finalResponseObject) {
                    onComplete(finalResponseObject);
                  }
                }
              } catch (e) {
                this.logger.error('Error parsing streaming response', 'API', e);
              }
            }
          }
        });

        return new Promise((resolve) => {
          response.data.on('end', () => {
            resolve(finalResponseObject);
          });
        });
      } else {
        const response = await axios.post(`${this._baseUrl}/api/generate`, {
          ...requestOptions,
          stream: false,
        });

        if (onComplete) {
          onComplete(response.data);
        }

        return response.data;
      }
    } catch (error) {
      this.logger.error('Error generating completion', 'API', error);
      throw new Error(`Failed to generate completion: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public get models(): Model[] {
    return this._models;
  }

  public get isApiAvailable(): boolean {
    return this._isApiAvailable;
  }
}