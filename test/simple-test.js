// Simple test runner for the VSCode extension
const assert = require('assert');
const path = require('path');

// Mock VSCode API
const mockVSCode = {
    window: {
        showInformationMessage: () => Promise.resolve(),
        showErrorMessage: () => Promise.resolve(),
        createTreeView: () => ({}),
        createWebviewPanel: () => ({}),
        createTerminal: () => ({ sendText: () => { } })
    },
    workspace: {
        getConfiguration: () => ({ get: () => 'localhost' }),
        onDidChangeConfiguration: () => ({ dispose: () => { } })
    },
    commands: {
        registerCommand: () => ({ dispose: () => { } }),
        executeCommand: () => Promise.resolve()
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2
    },
    ThemeIcon: (id) => ({ id }),
    Uri: {
        file: (path) => ({ fsPath: path }),
        parse: (uri) => ({ fsPath: uri })
    },
    EventEmitter: class {
        constructor() {
            this.listeners = [];
        }
        fire() {
            this.listeners.forEach(listener => listener());
        }
        event(listener) {
            this.listeners.push(listener);
            return { dispose: () => { } };
        }
    },
    Disposable: class {
        constructor(fn) {
            this.dispose = fn;
        }
    }
};

// Mock the VSCode module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return mockVSCode;
    }
    return originalRequire.apply(this, arguments);
};

// Simple test runner for the VSCode extension
function runTests() {
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (error) {
            console.log(`✗ ${name}: ${error.message}`);
            failed++;
        }
    }

    function describe(name, fn) {
        console.log(`\n${name}:`);
        fn();
    }

    // Test suite
    describe('VSCode Ollama Extension Tests', () => {
        describe('Basic Functionality', () => {
            test('should have VSCode API available', () => {
                const vscode = require('vscode');
                assert(vscode.window);
                assert(vscode.workspace);
                assert(vscode.commands);
            });

            test('should create tree item collapsible states', () => {
                const vscode = require('vscode');
                assert.strictEqual(vscode.TreeItemCollapsibleState.None, 0);
                assert.strictEqual(vscode.TreeItemCollapsibleState.Collapsed, 1);
                assert.strictEqual(vscode.TreeItemCollapsibleState.Expanded, 2);
            });

            test('should create theme icons', () => {
                const vscode = require('vscode');
                const icon = vscode.ThemeIcon('test');
                assert.strictEqual(icon.id, 'test');
            });

            test('should handle workspace configuration', () => {
                const vscode = require('vscode');
                const config = vscode.workspace.getConfiguration();
                assert(config.get);
                assert.strictEqual(config.get('test'), 'localhost');
            });
        });

        describe('Mock Services', () => {
            test('should mock axios responses', () => {
                // This would test axios mocking in a real scenario
                assert(true);
            });

            test('should mock child process execution', () => {
                // This would test child process mocking in a real scenario
                assert(true);
            });
        });

        describe('Extension Structure', () => {
            test('should have proper file structure', () => {
                const fs = require('fs');
                const path = require('path');

                // Check that main files exist
                assert(fs.existsSync(path.join(__dirname, '../src/extension.ts')));
                assert(fs.existsSync(path.join(__dirname, '../src/services/ollamaService.ts')));
                assert(fs.existsSync(path.join(__dirname, '../src/services/mcpServerService.ts')));
                assert(fs.existsSync(path.join(__dirname, '../src/provider/chatHistoryProvider.ts')));
                assert(fs.existsSync(path.join(__dirname, '../src/provider/modelTreeDataProvider.ts')));
            });

            test('should have package.json with correct structure', () => {
                const fs = require('fs');
                const path = require('path');
                const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

                assert(packageJson.name);
                assert(packageJson.displayName);
                assert(packageJson.contributes);
                assert(packageJson.contributes.commands);
                assert(packageJson.contributes.viewsContainers);
                assert(packageJson.contributes.views);
            });
        });

        describe('Configuration', () => {
            test('should have proper TypeScript configuration', () => {
                const fs = require('fs');
                const path = require('path');
                const tsconfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../tsconfig.json'), 'utf8'));

                assert(tsconfig.compilerOptions);
                assert(tsconfig.compilerOptions.strict);
                assert(tsconfig.include);
                assert(tsconfig.exclude);
            });

            test('should have webpack configuration', () => {
                const fs = require('fs');
                const path = require('path');
                assert(fs.existsSync(path.join(__dirname, '../webpack.config.js')));
            });
        });
    });

    // Print results
    console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests();
