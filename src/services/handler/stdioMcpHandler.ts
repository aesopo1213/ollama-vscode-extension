import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';
import { Logger } from '../logger';
import { IMcpHandler, JsonRpcRequest, JsonRpcResponse, McpServer } from '../../models/mcpModel';

export class StdioMcpHandler implements IMcpHandler {
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private notificationListeners: Map<string, (notification: JsonRpcRequest) => void> = new Map();
  private logger: Logger = Logger.getInstance();

  constructor(private context: vscode.ExtensionContext) { }

  isRunning(serverId: string): boolean {
    return this.runningProcesses.has(serverId);
  }

  async start(serverId: string, server: McpServer): Promise<void> {
    if (!server.command) {
      throw new Error(`No command specified for stdio MCP server: ${server.name}`);
    }
    const childProcess: ChildProcess = spawn(server.command, server.args ?? [], {
      env: { ...process.env, ...(server.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.runningProcesses.set(serverId, childProcess);

    childProcess.on('error', (error: Error) => {
      this.logger.error(`MCP server ${server.name} error`, 'MCP', error);
      this.stop(serverId, server).catch((err: unknown) => {
        this.logger.error(`Failed to stop MCP server ${server.name}`, 'MCP', err);
      });
    });

    childProcess.on('close', (code: number | null) => {
      this.logger.info(`MCP server ${server.name} stopped with code ${code ?? 'unknown'}`);
      this.runningProcesses.delete(serverId);
      this.context.globalState.update(`ollama.mcpServerStatus.${serverId}`, 'Stopped');
    });

    if (childProcess.stdout) {
      let output: string = '';
      childProcess.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        const lines = output.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const message: JsonRpcRequest = JSON.parse(line);
            if (message.jsonrpc === '2.0' && !message.id) {
              this.handleNotification(serverId, message);
            }
          } catch (error) {
            this.logger.debug(`Invalid JSON line: ${line}`);
          }
        }
        output = '';
      });
    }
  }

  async stop(serverId: string, server: McpServer): Promise<void> {
    const process: ChildProcess | undefined = this.runningProcesses.get(serverId);
    if (process && process.stdin) {
      process.stdin.end();
      await new Promise<void>((resolve, reject) => {
        let resolved = false;
        process.on('close', () => {
          resolved = true;
          resolve();
        });
        process.on('error', (err: Error) => {
          resolved = true;
          reject(err);
        });
        setTimeout(() => {
          if (!resolved) {
            process.kill('SIGTERM');
            setTimeout(() => {
              if (!resolved) {
                process.kill('SIGKILL');
                resolved = true;
                resolve();
              }
            }, 1000);
          }
        }, 2000);
      }).catch((err: unknown) => {
        this.logger.error(`Error during MCP server ${server.name} shutdown`, 'MCP', err);
      });
      this.runningProcesses.delete(serverId);
    }
  }

  async sendMessage(serverId: string, server: McpServer, message: JsonRpcRequest, timeout: number = 10000): Promise<JsonRpcResponse> {
    const process = this.runningProcesses.get(serverId);
    if (!process || !process.stdin || !process.stdout) {
      throw new Error(`MCP server ${server.name} not running`);
    }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      let output: string = '';
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        process.stdout?.off('data', onData);
      };

      const onData = (data: Buffer) => {
        output += data.toString();
        const lines = output.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const response: JsonRpcResponse = JSON.parse(line);
            if (response.jsonrpc === '2.0' && response.id === message.id) {
              cleanup();
              resolve(response);
              return;
            }
          } catch (error) {
            this.logger.debug(`Invalid JSON line: ${line}`, 'MCP');
          }
        }
        output = '';
      };

      process.stdout?.on('data', onData);

      this.logger.debug(`Sending JSON-RPC message: ${JSON.stringify(message)}`, 'MCP');
      process.stdin?.write(JSON.stringify(message) + '\n');

      timeoutId = setTimeout(() => {
        cleanup();
        this.logger.warn(`Timeout waiting for response from MCP server ${server.name}`, 'MCP');
        reject(new Error(`Timeout waiting for response from MCP server ${server.name}`));
      }, timeout);
    });
  }

  registerNotificationListener(serverId: string, listener: (notification: JsonRpcRequest) => void): void {
    this.notificationListeners.set(serverId, listener);
  }

  private handleNotification(serverId: string, notification: JsonRpcRequest): void {
    const listener = this.notificationListeners.get(serverId);
    if (listener) {
      listener(notification);
    }
  }
}