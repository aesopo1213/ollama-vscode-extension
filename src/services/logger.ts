import * as vscode from 'vscode';

export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Ollama Extension');
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private isProduction(): boolean {
        // Check environment variable or VS Code configuration for production mode
        const env = process.env['NODE_ENV'] || 'development';
        const config = vscode.workspace.getConfiguration('vscode-ollama');
        return env === 'production' || config.get('productionMode', false);
    }

    private formatMessage(level: string, message: string, category?: string): string {
        const timestamp = new Date().toISOString();
        const categoryTag = category ? `[${category}] ` : '';
        return `[${timestamp}] [${level}] ${categoryTag}${message}`;
    }

    private isDebugEnabled(): boolean {
        return !this.isProduction() && vscode.workspace.getConfiguration('vscode-ollama').get('enableDebugLogs', false);
    }

    private isErrorStackTraceEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('vscode-ollama');
        return config.get('enableErrorStackTraces', this.isDebugEnabled());
    }

    public info(message: string, ...args: any[]): void {
        if (this.isProduction()) {
            return; // Suppress info logs in production
        }
        const category = this._getCategory(args);
        const logMessage = this._convertToLogMessage(message, args);
        this.outputChannel.appendLine(this.formatMessage('INFO', logMessage, category));
    }

    public warn(message: string, ...args: any[]): void {
        if (this.isProduction()) {
            return; // Suppress warn logs in production
        }
        const category = this._getCategory(args);
        const logMessage = this._convertToLogMessage(message, args);
        this.outputChannel.appendLine(this.formatMessage('WARN', logMessage, category));
    }

    public error(message: string | Error, ...args: any[]): void {
        const category = this._getCategory(args);
        const logMessage = this._convertToLogMessage(message, args);
        this.outputChannel.appendLine(this.formatMessage('ERROR', logMessage, category));
    }

    public debug(message: string, ...args: any[]): void {
        if (this.isDebugEnabled()) {
            const category = this._getCategory(args);
            const logMessage = this._convertToLogMessage(message, args);
            this.outputChannel.appendLine(this.formatMessage('DEBUG', logMessage, category));
        }
    }

    public show(): void {
        this.outputChannel.show(true);
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }

    private _getCategory(args: any[]): string | undefined {
        return typeof args[0] === 'string' ? args.shift() : undefined;
    }

    private _getMetaData(args: any[]): string | undefined {
        return args.length > 0 && typeof args[args.length - 1] === 'object' ? args.pop() : undefined;
    }

    private _convertToLogMessage(message: Error | string, args: any[]): string {
        let logMessage = '';
        if (message instanceof Error) {
            logMessage = message.message;
            if (this.isErrorStackTraceEnabled() && message.stack) {
                logMessage += `\nStack Trace:\n${message.stack}`;
            }
        } else {
            logMessage = message;
        }
        const metadata = this._getMetaData(args);
        // Append additional arguments
        if (args.length > 0) {
            logMessage += ' ' + args.map(arg => {
                try {
                    return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
                } catch {
                    return '[Unserializable Object]';
                }
            }).join(' ');
        }

        // Append metadata if provided
        if (metadata) {
            try {
                logMessage += `\nMetadata: ${JSON.stringify(metadata, null, 2)}`;
            } catch {
                logMessage += '\nMetadata: [Unserializable Object]';
            }
        }
        return logMessage;
    }
}