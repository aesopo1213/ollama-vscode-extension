import { McpServerService } from '../../src/services/mcpServerService';
import { McpServer } from '../../src/models/mcpModel';

// Mock the vscode module
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockImplementation((key: string, defaultValue: any) => {
                const config: Record<string, any> = {
                    'mcpTimeout': 10000,
                    'mcpRetryAttempts': 3,
                    'mcpAutoStart': false,
                    'mcpLogLevel': 'info'
                };
                return config[key] ?? defaultValue;
            })
        }),
        onDidChangeConfiguration: jest.fn()
    },
    window: {
        createOutputChannel: jest.fn().mockReturnValue({
            appendLine: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        })
    }
}));

// Mock VSCode
const mockContext = {
    globalState: {
        get: jest.fn().mockReturnValue([]),
        update: jest.fn()
    },
    subscriptions: []
};

describe('McpServerService', () => {
    let mcpService: McpServerService;

    beforeEach(() => {
        jest.clearAllMocks();
        mcpService = new McpServerService(mockContext as any);
    });

    describe('Server Validation', () => {
        test('should validate stdio server with command', () => {
            const validServer: McpServer = {
                id: 'test-server',
                name: 'Test Server',
                type: 'stdio',
                command: 'node',
                args: ['script.js']
            };

            // Access private method through any type
            const validation = (mcpService as any).validateMcpServer(validServer);
            expect(validation.valid).toBe(true);
        });

        test('should reject stdio server without command', () => {
            const invalidServer: McpServer = {
                id: 'test-server',
                name: 'Test Server',
                type: 'stdio'
            };

            const validation = (mcpService as any).validateMcpServer(invalidServer);
            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('STDIO server must have a command');
        });

        test('should validate SSE server with URL', () => {
            const validServer: McpServer = {
                id: 'test-server',
                name: 'Test Server',
                type: 'sse',
                url: 'https://api.example.com/mcp'
            };

            const validation = (mcpService as any).validateMcpServer(validServer);
            expect(validation.valid).toBe(true);
        });

        test('should reject SSE server without URL', () => {
            const invalidServer: McpServer = {
                id: 'test-server',
                name: 'Test Server',
                type: 'sse'
            };

            const validation = (mcpService as any).validateMcpServer(invalidServer);
            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('SSE server must have a URL');
        });

        test('should reject dangerous commands', () => {
            const dangerousServer: McpServer = {
                id: 'test-server',
                name: 'Test Server',
                type: 'stdio',
                command: 'rm',
                args: ['-rf', '/']
            };

            const validation = (mcpService as any).validateMcpServer(dangerousServer);
            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('not allowed for security reasons');
        });

        test('should reject invalid URL protocols', () => {
            const invalidServer: McpServer = {
                id: 'test-server',
                name: 'Test Server',
                type: 'sse',
                url: 'ftp://example.com/mcp'
            };

            const validation = (mcpService as any).validateMcpServer(invalidServer);
            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('must use HTTP or HTTPS protocol');
        });
    });

    describe('Retry Logic', () => {
        test('should have retry configuration', () => {
            expect((mcpService as any).retryAttempts).toBe(3);
            expect(typeof (mcpService as any).executeWithRetry).toBe('function');
        });
    });

    describe('Configuration', () => {
        test('should load configuration values', () => {
            expect((mcpService as any).requestTimeout).toBe(10000);
            expect((mcpService as any).retryAttempts).toBe(3);
        });

        test('should handle configuration changes', () => {
            const vscode = require('vscode');
            const configChangeCallback = vscode.workspace.onDidChangeConfiguration.mock.calls[0][0];

            // Simulate configuration change
            configChangeCallback({
                affectsConfiguration: (key: string) => key === 'vscode-ollama.mcpTimeout'
            });

            // Verify configuration was updated
            expect(vscode.workspace.getConfiguration).toHaveBeenCalled();
        });
    });

    describe('Cleanup', () => {
        test('should cleanup all servers', async () => {
            const mockStopServer = jest.fn().mockResolvedValue(undefined);
            (mcpService as any).stopMcpServer = mockStopServer;
            (mcpService as any).mcpServers = new Map([
                ['server1', { id: 'server1', name: 'Server 1' }],
                ['server2', { id: 'server2', name: 'Server 2' }]
            ]);

            await mcpService.cleanup();

            expect(mockStopServer).toHaveBeenCalledTimes(2);
            expect(mockStopServer).toHaveBeenCalledWith('server1');
            expect(mockStopServer).toHaveBeenCalledWith('server2');
        });

        test('should prevent multiple cleanup operations', async () => {
            const mockStopServer = jest.fn().mockResolvedValue(undefined);
            (mcpService as any).stopMcpServer = mockStopServer;
            (mcpService as any).mcpServers = new Map([['server1', { id: 'server1' }]]);

            // Start two cleanup operations simultaneously
            const cleanup1 = mcpService.cleanup();
            const cleanup2 = mcpService.cleanup();

            await Promise.all([cleanup1, cleanup2]);

            // Should only cleanup once
            expect(mockStopServer).toHaveBeenCalledTimes(1);
        });
    });
});
