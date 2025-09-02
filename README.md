# Ollama for VS Code

A powerful VS Code extension that brings Ollama language models directly into your development environment with full MCP (Model Context Protocol) server support.

![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ Features

### 🤖 **Local AI Integration**
- Run Ollama language models locally within VS Code
- Support for all Ollama-compatible models (Llama, Mistral, CodeLlama, etc.)
- Real-time streaming responses
- Context-aware conversations with your code

### 💬 **Interactive Chat Interface**
- Clean, modern chat interface with markdown support
- System prompt configuration
- Chat history management with search and organization
- Multiple concurrent chat sessions

### 🔧 **MCP Server Support**
- Full Model Context Protocol (MCP) integration
- Connect to external MCP servers for enhanced capabilities
- Tool calling support for models that support it
- Automatic tool discovery and management

### 🎯 **Developer-Focused Features**
- Generate code from selected text
- Insert AI-generated content directly into your editor
- Model switching on the fly
- Configurable API settings
- Comprehensive logging and debugging

### 📊 **Smart Model Management**
- Automatic model discovery and status tracking
- Tool support detection for each model
- Model details and metadata display
- Easy model switching between conversations

## 🚀 Quick Start

### Prerequisites

1. **Install Ollama**: Download and install [Ollama](https://ollama.ai) on your system
2. **Pull a Model**: Install at least one model using the Ollama CLI:
   ```bash
   ollama pull llama2
   # or
   ollama pull codellama
   # or
   ollama pull mistral
   ```

### Installation

1. **Install the Extension**:
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
   - Search for "Ollama for VS Code"
   - Click Install

2. **Start Ollama**:
   - Run `ollama serve` in your terminal, or
   - Use the extension's "Ollama: Start" command

3. **Begin Chatting**:
   - Click the Ollama icon in the activity bar
   - Click "Start New Chat" or use Ctrl+Shift+P → "Ollama: Start New Chat"

## 📖 Usage Guide

### Basic Chat

1. **Start a New Chat**:
   - Click the Ollama icon in the activity bar
   - Click the "+" button or use "Ollama: Start New Chat"
   - Select your preferred model from the dropdown

2. **Chat Interface**:
   - Type your message in the input field
   - Use the system prompt field to set AI behavior
   - Click "Send" or press Enter to send your message
   - View streaming responses in real-time

3. **Manage Conversations**:
   - Access chat history from the sidebar
   - Rename chats by right-clicking
   - Delete unwanted conversations
   - Search through your chat history

### Code Generation

1. **From Selection**:
   - Select code in your editor
   - Right-click and choose "Ollama: Generate from Selection"
   - Or use the command palette (Ctrl+Shift+P)

2. **Insert Generated Code**:
   - Review the AI's response
   - Click "Insert" to add the code to your editor
   - Modify as needed

### MCP Server Integration

1. **Add MCP Servers**:
   - Go to the "MCP Servers" section in the sidebar
   - Click the "+" button to add a new server
   - Configure server details (name, type, command, etc.)

2. **Configure Servers**:
   - Right-click on a server to configure it
   - Set up stdio or SSE connections
   - Test server connectivity

3. **Use MCP Tools**:
   - Start an MCP server
   - Available tools will be automatically integrated
   - Models with tool support can use these tools in conversations

## ⚙️ Configuration

### Extension Settings

Access settings via `File > Preferences > Settings` and search for "ollama":

| Setting | Description | Default |
|---------|-------------|---------|
| `vscode-ollama.apiHost` | Ollama API host | `localhost` |
| `vscode-ollama.apiPort` | Ollama API port | `11434` |
| `vscode-ollama.defaultModel` | Default model for new chats | `llama2` |
| `vscode-ollama.showStreamingOutput` | Enable real-time streaming | `true` |
| `vscode-ollama.enableDebugLogs` | Enable debug logging | `true` |
| `vscode-ollama.enableErrorStackTraces` | Include stack traces in errors | `false` |
| `vscode-ollama.productionMode` | Suppress non-error logs | `false` |

### MCP Server Configuration

MCP servers can be configured with the following options:

- **Name**: Display name for the server
- **Type**: Connection type (stdio or sse)
- **Command**: Command to start the server
- **Arguments**: Command-line arguments
- **Environment**: Environment variables
- **Working Directory**: Working directory for the server

## 🛠️ Development

### Building from Source

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/vscode-ollama.git
   cd vscode-ollama
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build the Extension**:
   ```bash
   npm run build
   ```

4. **Run in Development Mode**:
   - Press F5 in VS Code to launch a new Extension Development Host window
   - Or use the "Run Extension" configuration in the debugger

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run compile` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch for changes and recompile |
| `npm run build` | Clean and compile |
| `npm run build:prod` | Production build with optimizations |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues automatically |
| `npm run test` | Run tests |
| `npm run package` | Create VSIX package |

### Project Structure

```
vscode-ollama/
├── src/
│   ├── extension.ts              # Main extension entry point
│   ├── models/                   # Type definitions
│   │   ├── ollamaModel.ts        # Ollama API models
│   │   └── mcpModel.ts          # MCP protocol models
│   ├── services/                 # Core services
│   │   ├── ollamaService.ts      # Ollama API integration
│   │   ├── mcpServerService.ts   # MCP server management
│   │   ├── logger.ts            # Logging service
│   │   └── handler/             # MCP connection handlers
│   ├── provider/                 # VS Code providers
│   │   ├── chatViewProvider.ts   # Chat webview provider
│   │   ├── modelTreeDataProvider.ts # Models tree view
│   │   ├── chatHistoryProvider.ts # Chat history management
│   │   └── mcpTreeDataProvider.ts # MCP servers tree view
│   ├── webview/                  # Web UI components
│   │   ├── chat.html            # Chat interface
│   │   ├── mcpSettings.html     # MCP configuration UI
│   │   ├── css/                 # Stylesheets
│   │   └── js/                  # Frontend JavaScript
│   ├── ui/                      # UI components
│   └── utils/                   # Utility functions
├── media/                       # Extension icons and assets
├── .vscode/                     # VS Code configuration
├── package.json                 # Extension manifest
├── tsconfig.json               # TypeScript configuration
└── webpack.config.js           # Webpack build configuration
```

### Debugging

1. **Set Breakpoints**: Add breakpoints in your TypeScript code
2. **Launch Debugger**: Press F5 or use "Run Extension" configuration
3. **Debug Console**: Use the Debug Console to inspect variables
4. **Extension Host Logs**: Check the Output panel for extension logs

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

1. Check existing issues first
2. Provide detailed reproduction steps
3. Include system information (OS, VS Code version, Ollama version)
4. Attach relevant logs

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests if applicable
5. Run linting: `npm run lint:fix`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use meaningful commit messages
- Add JSDoc comments for public APIs
- Ensure all tests pass
- Update documentation as needed

### Testing

The extension includes a comprehensive test suite following VSCode extension testing standards:

- **Run basic tests**: `npm test`
- **Run full test suite**: `npm run test:full`
- **Run tests in watch mode**: `npm run test:watch`
- **Run with coverage**: `npm run test:coverage`

#### Test Structure

```
test/
├── simple-test.js          # Basic functionality tests
├── fixtures/               # Test data and mock objects
├── mocks/                  # Mock implementations
└── suite/                  # Comprehensive test suites
    ├── services/           # Service layer tests
    ├── provider/           # Provider tests
    └── utils/              # Utility function tests
```

#### Test Categories

- **Unit Tests**: Test individual functions and classes in isolation
- **Integration Tests**: Test component interactions and workflows
- **Mock Tests**: Test with mocked VSCode APIs and external services
- **Structure Tests**: Verify project structure and configuration

For detailed testing information, see [test/README.md](test/README.md).

## 📋 Requirements

- **VS Code**: 1.85.0 or higher
- **Node.js**: 18.x or higher (for development)
- **Ollama**: Latest version with at least one model installed

## 🔒 Privacy & Security

- **Local Processing**: All AI interactions happen locally on your machine
- **No Data Collection**: No user data is sent to external services
- **Secure Communication**: MCP servers use secure local connections
- **Configurable Logging**: Control what information is logged

## 🆘 Troubleshooting

### Common Issues

**Ollama not starting**:
- Ensure Ollama is installed and in your PATH
- Check if port 11434 is available
- Try running `ollama serve` manually

**Models not loading**:
- Verify models are installed: `ollama list`
- Check Ollama service is running
- Refresh models using the extension command

**MCP servers not connecting**:
- Verify server configuration
- Check server logs for errors
- Test server connectivity manually
- Ensure proper permissions for server commands

**Extension not activating**:
- Check VS Code version compatibility
- Reload the window (Ctrl+Shift+P → "Developer: Reload Window")
- Check the Output panel for error messages

### Getting Help

- **Documentation**: Check this README and inline help
- **Issues**: Search existing issues on GitHub
- **Discussions**: Use GitHub Discussions for questions
- **Logs**: Enable debug logging for detailed information

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai) for the amazing local AI platform
- [Model Context Protocol](https://modelcontextprotocol.io) for the MCP specification
- VS Code team for the excellent extension API
- All contributors and users who help improve this extension

---

**Made with ❤️ for the developer community**

For more information, visit our [GitHub repository](https://github.com/your-username/vscode-ollama).