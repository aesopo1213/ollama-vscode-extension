export interface McpServer {
  id: string;
  name: string;
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: { [key: string]: string };
  url?: string;
  headers?: { [key: string]: string };
}

export interface McpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: number;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: { code: number; message: string; data?: any };
  id?: number;
}

export interface OllamaToolRequest {
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface OllamaToolResponse {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}


export interface IMcpHandler {
  isRunning(serverId: string): boolean;
  start(serverId: string, server: McpServer): Promise<void>;
  stop(serverId: string, server: McpServer): Promise<void>;
  sendMessage(serverId: string, server: McpServer, message: JsonRpcRequest, timeout?: number): Promise<JsonRpcResponse>;
  registerNotificationListener(serverId: string, listener: (notification: JsonRpcRequest) => void): void;
}

export interface McpCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: {};
  elicitation?: {};
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  logging?: {};
  completions?: {};
  experimental?: Record<string, any>;
}

export interface McpServerInfo {
  name: string;
  title?: string;
  version: string;
}

export interface ServerState {
  capabilities: McpCapabilities;
  serverInfo: McpServerInfo;
  protocolVersion: string;
  tools: McpTool[];
  prompts: { name: string; title: string; description: string; arguments: { name: string; description: string; required: boolean }[] }[];
  resources: { uri: string; name: string; title: string; description: string; mimeType: string }[];
  status: 'Stopped' | 'Running';
}
