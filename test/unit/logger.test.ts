import { Logger } from '../../src/services/logger';

// Mock output channel
const mockOutputChannel = {
    appendLine: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
};

describe('Logger Service', () => {
    let logger: Logger;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Mock the output channel creation
        ((global as any).mockVSCode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);

        logger = Logger.getInstance();
    });

    test('should create singleton instance', () => {
        const logger1 = Logger.getInstance();
        const logger2 = Logger.getInstance();
        expect(logger1).toBe(logger2);
    });

    test('should log info messages in development mode', () => {
        // Mock environment to be development
        const originalEnv = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'development';

        // Mock workspace configuration
        ((global as any).mockVSCode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockReturnValue(false) // productionMode = false
        });

        logger.info('Test info message', 'TestCategory');

        expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
        const logCall = (mockOutputChannel.appendLine as jest.Mock).mock.calls[0][0];
        expect(logCall).toContain('Test info message');
        expect(logCall).toContain('[TestCategory]');

        // Restore environment
        process.env['NODE_ENV'] = originalEnv;
    });

    test('should log error messages in production mode', () => {
        // Mock environment to be production
        const originalEnv = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'production';

        // Mock workspace configuration
        ((global as any).mockVSCode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockReturnValue(true) // productionMode = true
        });

        logger.error('Test error message', 'TestCategory');

        expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
        const errorCall = (mockOutputChannel.appendLine as jest.Mock).mock.calls[0][0];
        expect(errorCall).toContain('Test error message');
        expect(errorCall).toContain('[TestCategory]');

        // Restore environment
        process.env['NODE_ENV'] = originalEnv;
    });

    test('should not log info messages in production mode', () => {
        // Mock environment to be production
        const originalEnv = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'production';

        // Mock workspace configuration
        ((global as any).mockVSCode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockReturnValue(true) // productionMode = true
        });

        logger.info('Test info message', 'TestCategory');

        expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();

        // Restore environment
        process.env['NODE_ENV'] = originalEnv;
    });

    test('should format messages with timestamp and category', () => {
        const originalEnv = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'development';

        ((global as any).mockVSCode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockReturnValue(false)
        });

        logger.info('Test message', 'TestCategory');

        expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
        const logCall = (mockOutputChannel.appendLine as jest.Mock).mock.calls[0][0];
        const message = logCall;

        // Check for timestamp format (ISO string)
        expect(message).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
        // Check for log level
        expect(message).toContain('[INFO]');
        // Check for category
        expect(message).toContain('[TestCategory]');
        // Check for message content
        expect(message).toContain('Test message');

        process.env['NODE_ENV'] = originalEnv;
    });

    test('should log debug messages when debug logs are enabled', () => {
        ((global as any).mockVSCode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockImplementation((key: string) => {
                if (key === 'enableDebugLogs') return true;
                return false;
            })
        });

        logger.debug('Test debug message', 'TestCategory');

        expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(1);
        const logCall = (mockOutputChannel.appendLine as jest.Mock).mock.calls[0][0];
        expect(logCall).toContain('Test debug message');
    });

    test('should not log debug messages when debug logs are disabled', () => {
        ((global as any).mockVSCode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockImplementation((key: string) => {
                if (key === 'enableDebugLogs') return false;
                return false;
            })
        });

        logger.debug('Test debug message', 'TestCategory');

        expect(mockOutputChannel.appendLine).not.toHaveBeenCalled();
    });
});