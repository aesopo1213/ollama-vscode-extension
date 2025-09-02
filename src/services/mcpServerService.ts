import * as vscode from 'vscode';
import { Logger } from './logger';
import { getNonce } from '../utils/security';
import { IMcpHandler, JsonRpcRequest, McpCapabilities, McpServer, McpTool, OllamaToolRequest, OllamaToolResponse, ServerState } from '../models/mcpModel';
import { StdioMcpHandler } from './handler/stdioMcpHandler';
import { SseMcpHandler } from './handler/sseMcpHandler';

export class McpServerService {
  private mcpServers: Map<string, McpServer> = new Map();
  private serverStates: Map<string, ServerState> = new Map();
  private mcpTools: Map<string, McpTool[]> = new Map();
  private handlers: Map<string, IMcpHandler> = new Map();
  private supportedVersions: string[] = ['2025-06-18', '2025-03-26', '2024-11-05'];
  private logger: Logger = Logger.getInstance();
  private clientCapabilities: McpCapabilities = {
    roots: { listChanged: true },
    sampling: {},
    elicitation: {},
    prompts: { listChanged: true },
    resources: { subscribe: true, listChanged: true },
    tools: { listChanged: true }
  };
  private clientInfo = {
    name: 'VSCodeMcpClient',
    title: 'VS Code MCP Client',
    version: '1.0.0'
  };
  private requestIdCounter: number = 100; // Start from 100 to avoid conflicting with fixed IDs

  constructor(private context: vscode.ExtensionContext) {
    const savedServers = this.context.globalState.get<McpServer[]>('ollama.mcpServers', []);
    savedServers.forEach(s => this.mcpServers.set(s.id, s));
    this.handlers.set('stdio', new StdioMcpHandler(context));
    this.handlers.set('sse', new SseMcpHandler());
    this.initializeServerStates();
  }

  private async initializeServerStates(): Promise<void> {
    for (const server of this.mcpServers.values()) {
      const status = this.context.globalState.get<string>(`ollama.mcpServerStatus.${server.id}`, 'Stopped');
      this.serverStates.set(server.id, {
        capabilities: {},
        serverInfo: { name: server.name, version: 'unknown' },
        protocolVersion: '',
        tools: [],
        prompts: [],
        resources: [],
        status: 'Stopped'
      });
      if (status === 'Running') {
        await this.startMcpServer(server.id).catch((error: unknown) => {
          this.logger.error(`Failed to initialize MCP server ${server.name}`, 'MCP', error);
        });
      }
    }
  }

  public async startMcpServer(serverId: string): Promise<void> {
    const server = this.mcpServers.get(serverId);
    if (!server) {
      throw new Error(`MCP server with ID ${serverId} not found`);
    }

    const handler = this.handlers.get(server.type);
    if (!handler) {
      throw new Error(`No handler for MCP server type: ${server.type}`);
    }

    if (handler.isRunning(serverId)) {
      this.logger.info(`MCP server ${server.name} is already running`);
      return;
    }

    try {
      await handler.start(serverId, server);
      await this.connectToMcpServer(server);
      const state = this.serverStates.get(serverId);
      if (state) {
        state.status = 'Running';
        this.serverStates.set(serverId, state);
      }
      await this.context.globalState.update(`ollama.mcpServerStatus.${serverId}`, 'Running');
      this.logger.info(`Started MCP server: ${server.name} (${serverId})`);
    } catch (error: unknown) {
      this.logger.error(`Failed to start MCP server ${server.name} (${serverId})`, 'MCP', error);
      await this.stopMcpServer(serverId);
      throw error;
    }
  }

  public async stopMcpServer(serverId: string): Promise<void> {
    const server = this.mcpServers.get(serverId);
    if (!server) {
      throw new Error(`MCP server with ID ${serverId} not found`);
    }

    const handler = this.handlers.get(server.type);
    if (!handler) {
      throw new Error(`No handler for MCP server type: ${server.type}`);
    }

    await handler.stop(serverId, server);
    const state = this.serverStates.get(serverId);
    if (state) {
      state.status = 'Stopped';
      state.tools = [];
      state.prompts = [];
      state.resources = [];
      this.serverStates.set(serverId, state);
    }
    await this.context.globalState.update(`ollama.mcpServerStatus.${serverId}`, 'Stopped');
    this.mcpTools.delete(serverId);
    this.logger.info(`Stopped MCP server: ${server.name} (${serverId})`);
  }

  public async testMcpServer(input: string | McpServer): Promise<boolean> {
    try {
      let server: McpServer;
      if (typeof input === 'string') {
        const foundServer = this.mcpServers.get(input);
        if (!foundServer) {
          throw new Error(`MCP server with ID ${input} not found`);
        }
        server = foundServer;
      } else {
        server = { ...input, id: input.id ?? getNonce(), name: input.name ?? 'Unnamed' };
      }

      await this.connectToMcpServer(server);
      const state = this.serverStates.get(server.id);
      return (state?.tools.length || 0) > 0;
    } catch (error: unknown) {
      const serverName = typeof input === 'string' ? input : (input.name ?? 'Unnamed');
      this.logger.error(`Test failed for MCP server ${serverName}`, 'MCP', error);
      return false;
    }
  }

  private async connectToMcpServer(server: McpServer): Promise<void> {
    const handler = this.handlers.get(server.type);
    if (!handler) {
      throw new Error(`No handler for MCP server type: ${server.type}`);
    }

    let protocolVersion = this.supportedVersions[0];
    let retryVersions = [...this.supportedVersions.slice(1)];
    let initialized = false;

    while (protocolVersion && !initialized) {
      try {
        const initializeRequest: JsonRpcRequest = {
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion,
            capabilities: this.clientCapabilities,
            clientInfo: this.clientInfo
          },
          id: 1 // Fixed ID for initialization
        };

        const initResponse = await handler.sendMessage(server.id, server, initializeRequest);

        if (initResponse.error) {
          if (initResponse.error.code === -32602 && initResponse.error.data?.supported) {
            throw new Error('Protocol version mismatch', { cause: initResponse.error });
          }
          throw new Error(`Initialization failed: ${initResponse.error.message}`);
        }

        const serverVersion = initResponse.result.protocolVersion;
        if (!this.supportedVersions.includes(serverVersion)) {
          throw new Error(`Unsupported protocol version: ${serverVersion}`);
        }

        const state = this.serverStates.get(server.id);
        if (state) {
          state.protocolVersion = serverVersion;
          state.capabilities = initResponse.result.capabilities;
          state.serverInfo = initResponse.result.serverInfo;
          this.serverStates.set(server.id, state);
        }

        const initializedNotification: JsonRpcRequest = {
          jsonrpc: '2.0',
          method: 'notifications/initialized'
        };
        await handler.sendMessage(server.id, server, initializedNotification);

        initialized = true;

        // Refresh lists after successful initialization
        if (state?.capabilities.tools) {
          await this.refreshTools(server, server.id, handler, state);
        }

        if (state?.capabilities.prompts) {
          await this.refreshPrompts(server, server.id, handler, state);
        }

        if (state?.capabilities.resources) {
          await this.refreshResources(server, server.id, handler, state);
        }

        // Register notification listeners only once after init
        if (state?.capabilities.tools?.listChanged) {
          handler.registerNotificationListener(server.id, (notification: JsonRpcRequest) => {
            if (notification.method === 'notifications/tools/list_changed') {
              this.logger.info(`Tools list changed for server ${server.name}`);
              const currentState = this.serverStates.get(server.id);
              if (currentState) {
                this.refreshTools(server, server.id, handler, currentState).catch(err => {
                  this.logger.error(`Failed to refresh tools for ${server.name}`, 'MCP', err);
                });
              }
            }
          });
        }

        if (state?.capabilities.prompts?.listChanged) {
          handler.registerNotificationListener(server.id, (notification: JsonRpcRequest) => {
            if (notification.method === 'notifications/prompts/list_changed') {
              this.logger.info(`Prompts list changed for server ${server.name}`);
              const currentState = this.serverStates.get(server.id);
              if (currentState) {
                this.refreshPrompts(server, server.id, handler, currentState).catch(err => {
                  this.logger.error(`Failed to refresh prompts for ${server.name}`, 'MCP', err);
                });
              }
            }
          });
        }

        if (state?.capabilities.resources?.listChanged) {
          handler.registerNotificationListener(server.id, (notification: JsonRpcRequest) => {
            if (notification.method === 'notifications/resources/list_changed') {
              this.logger.info(`Resources list changed for server ${server.name}`);
              const currentState = this.serverStates.get(server.id);
              if (currentState) {
                this.refreshResources(server, server.id, handler, currentState).catch(err => {
                  this.logger.error(`Failed to refresh resources for ${server.name}`, 'MCP', err);
                });
              }
            }
          });
        }
      } catch (error: any) {
        if (error.message === 'Protocol version mismatch' && error.cause?.data?.supported) {
          const serverSupportedVersions = error.cause.data.supported as string[];
          const compatibleVersion = retryVersions.find(v => serverSupportedVersions.includes(v));
          if (compatibleVersion) {
            this.logger.info(`Retrying with protocol version ${compatibleVersion} for server ${server.name}`);
            protocolVersion = compatibleVersion;
            retryVersions = retryVersions.filter(v => v !== compatibleVersion);
            continue;
          }
        }
        throw error;
      }
    }

    if (!initialized) {
      throw new Error('Failed to initialize with any supported protocol version');
    }
  }

  private async refreshTools(server: McpServer, serverId: string, handler: IMcpHandler, state: ServerState): Promise<void> {
    const listToolsRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: this.requestIdCounter++
    };
    const listToolsResponse = await handler.sendMessage(serverId, server, listToolsRequest);

    if (listToolsResponse.error) {
      throw new Error(`Failed to fetch tools: ${listToolsResponse.error.message}`);
    }

    const tools = Array.isArray(listToolsResponse.result.tools)
      ? listToolsResponse.result.tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema?.properties ?? {}
        }))
      : [];

    this.mcpTools.set(serverId, tools);
    state.tools = tools;
    this.serverStates.set(serverId, state);
  }

  private async refreshPrompts(server: McpServer, serverId: string, handler: IMcpHandler, state: ServerState): Promise<void> {
    const listPromptsRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'prompts/list',
      params: {},
      id: this.requestIdCounter++
    };
    const listPromptsResponse = await handler.sendMessage(serverId, server, listPromptsRequest);

    if (listPromptsResponse.error) {
      throw new Error(`Failed to fetch prompts: ${listPromptsResponse.error.message}`);
    }

    const prompts = Array.isArray(listPromptsResponse.result.prompts)
      ? listPromptsResponse.result.prompts.map((prompt: any) => ({
          name: prompt.name,
          title: prompt.title,
          description: prompt.description,
          arguments: prompt.arguments || []
        }))
      : [];

    state.prompts = prompts;
    this.serverStates.set(serverId, state);
  }

  private async refreshResources(server: McpServer, serverId: string, handler: IMcpHandler, state: ServerState): Promise<void> {
    const listResourcesRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'resources/list',
      params: {},
      id: this.requestIdCounter++
    };
    const listResourcesResponse = await handler.sendMessage(serverId, server, listResourcesRequest);

    if (listResourcesResponse.error) {
      throw new Error(`Failed to fetch resources: ${listResourcesResponse.error.message}`);
    }

    const resources = Array.isArray(listResourcesResponse.result.resources)
      ? listResourcesResponse.result.resources.map((resource: any) => ({
          uri: resource.uri,
          name: resource.name,
          title: resource.title,
          description: resource.description,
          mimeType: resource.mimeType
        }))
      : [];

    state.resources = resources;
    this.serverStates.set(serverId, state);
  }

  public getMcpSystemPrompt(): string {
    let prompt: string = 'The following MCP components are available:\n';
    let hasComponents: boolean = false;

    this.mcpServers.forEach((server: McpServer, serverId: string) => {
      const state = this.serverStates.get(serverId);
      if (!state) return;

      let serverHasComponents = false;
      let serverPrompt = `\nServer: ${server.name}\n`;

      // Add Tools
      const tools = this.mcpTools.get(serverId) || [];
      if (tools.length > 0) {
        serverHasComponents = true;
        serverPrompt += `Tools:\n`;
        tools.forEach((tool: McpTool) => {
          serverPrompt += `- ${tool.name}: ${tool.description}\n`;
        });
      }

      // Add Prompts
      const prompts = state.prompts || [];
      if (prompts.length > 0) {
        serverHasComponents = true;
        serverPrompt += `Prompts:\n`;
        prompts.forEach((prompt: any) => {
          serverPrompt += `- ${prompt.name}: ${prompt.description}\n`;
        });
      }

      // Add Resources
      const resources = state.resources || [];
      if (resources.length > 0) {
        serverHasComponents = true;
        serverPrompt += `Resources:\n`;
        resources.forEach((resource: any) => {
          serverPrompt += `- ${resource.name}: ${resource.description}\n`;
        });
      }

      if (serverHasComponents) {
        hasComponents = true;
        prompt += serverPrompt;
      }
    });

    return hasComponents ? prompt : '';
  }

  public getMcpToolsForOllama(): Record<string, McpTool[]> {
    const toolsForOllama: Record<string, McpTool[]> = {};
    this.mcpTools.forEach((tools: McpTool[], serverId: string) => {
      const server: McpServer | undefined = this.mcpServers.get(serverId);
      if (server && tools.length > 0) {
        toolsForOllama[server.name] = tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }));
      }
    });
    this.logger.debug(`Tools for Ollama: ${JSON.stringify(toolsForOllama)}`);
    return toolsForOllama;
  }

  public async sendMcpRequest(request: OllamaToolRequest): Promise<OllamaToolResponse> {
    try {
      let targetServer: McpServer | undefined;
      let targetTool: McpTool | undefined;
      let serverId: string | undefined;

      for (const [sid, tools] of this.mcpTools) {
        const tool = tools.find(t => t.name === request.toolName);
        if (tool) {
          targetTool = tool;
          serverId = sid;
          targetServer = this.mcpServers.get(sid);
          break;
        }
      }

      if (!targetServer || !targetTool || !serverId) {
        throw new Error(`Tool ${request.toolName} not found on any MCP server`);
      }

      const handler = this.handlers.get(targetServer.type);
      if (!handler) {
        throw new Error(`No handler for MCP server type: ${targetServer.type}`);
      }

      const callToolRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: request.toolName,
          arguments: request.parameters
        },
        id: this.requestIdCounter++
      };

      const response = await handler.sendMessage(serverId, targetServer, callToolRequest);

      if (response.error) {
        return { success: false, error: response.error.message };
      }

      return { success: true, result: response.result as Record<string, unknown> };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send MCP request for ${request.toolName}`, 'MCP', error);
      return { success: false, error: errorMessage };
    }
  }

  public async addMcpServer(server: McpServer): Promise<void> {
    if (this.mcpServers.has(server.id)) {
      throw new Error(`MCP server with ID ${server.id} already exists`);
    }
    this.mcpServers.set(server.id, server);
    this.serverStates.set(server.id, {
      capabilities: {},
      serverInfo: { name: server.name, version: 'unknown' },
      protocolVersion: '',
      tools: [],
      prompts: [],
      resources: [],
      status: 'Stopped'
    });
    await this.context.globalState.update('ollama.mcpServers', Array.from(this.mcpServers.values()));
    this.logger.info(`Added MCP server: ${server.name}`);
  }

  public async updateMcpServer(serverId: string, updatedServer: Partial<McpServer>): Promise<void> {
    const server = this.mcpServers.get(serverId);
    if (!server) {
      throw new Error(`MCP server with ID ${serverId} not found`);
    }
    const wasRunning = this.serverStates.get(serverId)?.status === 'Running';
    if (wasRunning) {
      await this.stopMcpServer(serverId);
    }
    const newServer = { ...server, ...updatedServer };
    this.mcpServers.set(serverId, newServer);
    await this.context.globalState.update('ollama.mcpServers', Array.from(this.mcpServers.values()));
    if (wasRunning) {
      await this.startMcpServer(serverId).catch((error: unknown) => {
        this.logger.error(`Failed to restart MCP server ${newServer.name}`, 'MCP', error);
      });
    }
    this.logger.info(`Updated MCP server: ${newServer.name}`);
  }

  public async removeMcpServer(serverId: string): Promise<void> {
    const server = this.mcpServers.get(serverId);
    if (!server) {
      throw new Error(`MCP server with ID ${serverId} not found`);
    }
    await this.stopMcpServer(serverId);
    this.mcpServers.delete(serverId);
    this.serverStates.delete(serverId);
    this.mcpTools.delete(serverId);
    await this.context.globalState.update('ollama.mcpServers', Array.from(this.mcpServers.values()));
    this.logger.info(`Removed MCP server: ${server.name}`);
  }

  public getMcpServer(serverId: string): McpServer | undefined {
    return this.mcpServers.get(serverId);
  }
}