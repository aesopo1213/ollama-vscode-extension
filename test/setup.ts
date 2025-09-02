// Jest setup file for VSCode extension testing

// Mock VSCode API
const mockVSCode = {
    window: {
        showInformationMessage: jest.fn().mockResolvedValue(undefined),
        showErrorMessage: jest.fn().mockResolvedValue(undefined),
        showInputBox: jest.fn().mockResolvedValue(undefined),
        createTreeView: jest.fn().mockReturnValue({
            onDidChangeSelection: jest.fn(),
            onDidChangeVisibility: jest.fn(),
            reveal: jest.fn(),
            dispose: jest.fn(),
        }),
        createWebviewPanel: jest.fn().mockReturnValue({
            webview: {
                html: '',
                onDidReceiveMessage: jest.fn(),
                postMessage: jest.fn(),
            },
            onDidDispose: jest.fn(),
            reveal: jest.fn(),
            dispose: jest.fn(),
        }),
        createTerminal: jest.fn().mockReturnValue({
            sendText: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn(),
        }),
        createOutputChannel: jest.fn().mockReturnValue({
            appendLine: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
        }),
        activeTextEditor: undefined,
        onDidChangeActiveTextEditor: jest.fn(),
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue('localhost'),
            update: jest.fn(),
        }),
        onDidChangeConfiguration: jest.fn(),
    },
    commands: {
        registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
    },
    ThemeIcon: jest.fn().mockImplementation((id) => ({ id })),
    Uri: {
        file: jest.fn().mockImplementation((path) => ({ fsPath: path })),
        parse: jest.fn().mockImplementation((uri) => ({ fsPath: uri })),
    },
    EventEmitter: jest.fn().mockImplementation(() => ({
        fire: jest.fn(),
        event: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        dispose: jest.fn(),
    })),
    Disposable: jest.fn().mockImplementation((fn) => ({ dispose: fn })),
    extensions: {
        getExtension: jest.fn().mockReturnValue({
            isActive: true,
            activate: jest.fn().mockResolvedValue(undefined),
        }),
    },
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3,
    },
    ProgressLocation: {
        SourceControl: 1,
        Window: 10,
        Notification: 15,
    },
};

// Mock the vscode module
jest.mock('vscode', () => mockVSCode, { virtual: true });

// Mock axios
jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    create: jest.fn().mockReturnThis(),
}));

// Mock child_process
jest.mock('child_process', () => ({
    exec: jest.fn(),
}));

// Global test utilities
(global as any).mockVSCode = mockVSCode;
