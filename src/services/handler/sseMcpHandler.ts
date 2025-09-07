import axios from 'axios';
import { Logger } from '../logger';
import { IMcpHandler, JsonRpcRequest, JsonRpcResponse, McpServer } from '../../models/mcpModel';

export class SseMcpHandler implements IMcpHandler {
  private sessions: Map<string, { sessionId: string | null; stream: EventSource | null; lastEventId: string | null }> = new Map();
  private notificationListeners: Map<string, (notification: JsonRpcRequest) => void> = new Map();
  private logger: Logger = Logger.getInstance();

  isRunning(serverId: string): boolean {
    return this.sessions.has(serverId) && !!this.sessions.get(serverId)?.stream;
  }

  async start(serverId: string, server: McpServer): Promise<void> {
    if (!server.url) {
      throw new Error(`No URL specified for SSE MCP server: ${server.name}`);
    }

    this.sessions.set(serverId, { sessionId: null, stream: null, lastEventId: null });
    await this.openSseStream(serverId, server);
  }

  async stop(serverId: string, server: McpServer): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session || !server.url) return;

    if (session.sessionId) {
      try {
        await axios.delete(`${server.url}/messages`, {
          headers: {
            'MCP-Protocol-Version': '2025-06-18',
            'Mcp-Session-Id': session.sessionId,
            ...server.headers
          },
          timeout: 5000
        });
        this.logger.info(`Terminated session ${session.sessionId} for MCP server ${server.name}`);
      } catch (error: any) {
        if (error.response?.status === 405) {
          this.logger.debug(`Server ${server.name} does not support session termination`);
        } else {
          this.logger.error(`Failed to terminate session for MCP server ${server.name}`, 'MCP', error);
        }
      }
    }

    if (session.stream) {
      session.stream.close();
      this.logger.info(`Closed SSE stream for MCP server ${server.name}`);
    }
    this.sessions.delete(serverId);
  }

  async sendMessage(serverId: string, server: McpServer, message: JsonRpcRequest, timeout: number = 10000): Promise<JsonRpcResponse> {
    if (!server.url) {
      throw new Error(`No URL specified for SSE MCP server: ${server.name}`);
    }

    const session = this.sessions.get(serverId);
    if (!session) {
      throw new Error(`No session for MCP server ${server.name}`);
    }

    const headers = {
      ...server.headers,
      'MCP-Protocol-Version': '2025-06-18',
      'Accept': 'application/json',
      'Mcp-Session-Id': session.sessionId || undefined
    };

    try {
      const response = await axios.post<JsonRpcResponse>(
        `${server.url}/messages`,
        message,
        {
          headers,
          timeout,
          validateStatus: (status) => status < 500 // Don't throw for 4xx errors
        }
      );

      if (response.headers['mcp-session-id']) {
        session.sessionId = response.headers['mcp-session-id'] as string;
        this.sessions.set(serverId, session);
      }

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404 && session.sessionId) {
        this.logger.info(`Session expired for server ${server.name}, restarting`, 'MCP');
        await this.stop(serverId, server);
        await this.start(serverId, server);
        throw new Error('Session expired, please retry');
      }

      if (error.code === 'ECONNABORTED') {
        throw new Error(`Request timeout for MCP server ${server.name}`);
      }

      if (error.response?.status) {
        throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      }

      throw error;
    }
  }

  registerNotificationListener(serverId: string, listener: (notification: JsonRpcRequest) => void): void {
    this.notificationListeners.set(serverId, listener);
  }

  private async openSseStream(serverId: string, server: McpServer): Promise<void> {
    if (!server.url) return;

    const session = this.sessions.get(serverId);
    if (!session) return;

    if (session.stream) {
      session.stream.close();
    }

    const headers: Record<string, string> = {
      ...server.headers,
      'MCP-Protocol-Version': '2025-06-18',
      'Accept': 'text/event-stream'
    };
    if (session.sessionId) {
      headers['Mcp-Session-Id'] = session.sessionId;
    }
    if (session.lastEventId) {
      headers['Last-Event-ID'] = session.lastEventId;
    }

    const url = new URL(`${server.url}/messages`);
    Object.entries(headers).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });

    const stream = new EventSource(url.toString());
    session.stream = stream;
    this.sessions.set(serverId, session);

    stream.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.jsonrpc !== '2.0') return;

        if (!data.id) {
          this.notificationListeners.get(serverId)?.(data);
        }

        if (event.lastEventId) {
          session.lastEventId = event.lastEventId;
          this.sessions.set(serverId, session);
        }
      } catch (error) {
        this.logger.debug(`Invalid SSE message from server ${server.name}: ${event.data}`);
      }
    };

    stream.onerror = () => {
      this.logger.error(`SSE stream error for server ${server.name}`, 'MCP', new Error('Stream error'));
      stream.close();
      this.sessions.set(serverId, { ...session, stream: null });
      setTimeout(() => this.openSseStream(serverId, server), 1000);
    };
  }
}