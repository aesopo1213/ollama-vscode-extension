# Contributing to Ollama for VS Code

Thank you for your interest in contributing to Ollama for VS Code! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- VS Code 1.85.0 or higher
- Git
- Ollama installed and running locally

### Development Setup

1. **Fork and Clone**:
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
   - Open the project in VS Code
   - Press F5 to launch a new Extension Development Host window
   - The extension will be loaded in the new window

## 🛠️ Development Workflow

### Making Changes

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**:
   - Write your code following the project's style guidelines
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**:
   ```bash
   npm run lint
   npm test
   ```

4. **Commit Your Changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push and Create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Style Guidelines

- **TypeScript**: Use strict TypeScript with proper typing
- **Naming**: Use camelCase for variables and functions, PascalCase for classes
- **Comments**: Add JSDoc comments for public APIs
- **Formatting**: Use the project's ESLint configuration
- **Imports**: Use relative imports for local files, absolute for external packages

### Project Structure

```
src/
├── extension.ts              # Main extension entry point
├── models/                   # Type definitions and interfaces
├── services/                 # Core business logic
├── provider/                 # VS Code providers (tree views, etc.)
├── webview/                  # Web UI components
├── ui/                      # UI components and managers
└── utils/                   # Utility functions
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Place test files in the `test/` directory
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies

### Manual Testing

1. **Load Extension**: Use F5 to launch Extension Development Host
2. **Test Features**: Manually test all functionality
3. **Check Logs**: Monitor the Output panel for any errors
4. **Test Edge Cases**: Try various user scenarios

## 📝 Documentation

### Code Documentation

- Add JSDoc comments for all public functions and classes
- Include parameter types and return types
- Provide usage examples for complex functions

### README Updates

- Update the README.md for new features
- Include screenshots for UI changes
- Update installation and usage instructions

### API Documentation

- Document any new public APIs
- Include examples and use cases
- Update type definitions

## 🐛 Bug Reports

### Before Reporting

1. Check existing issues
2. Try the latest version
3. Reproduce the issue
4. Check the logs

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
- OS: [e.g. Windows 10, macOS 12, Ubuntu 20.04]
- VS Code Version: [e.g. 1.85.0]
- Extension Version: [e.g. 0.2.0]
- Ollama Version: [e.g. 0.1.25]

**Additional context**
Any other context about the problem.
```

## ✨ Feature Requests

### Before Requesting

1. Check existing feature requests
2. Consider if it fits the project's scope
3. Think about implementation complexity

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of what the problem is.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Alternative solutions or features you've considered.

**Additional context**
Any other context or screenshots about the feature request.
```

## 🔄 Pull Request Process

### Before Submitting

1. **Code Quality**:
   - Run `npm run lint:fix`
   - Ensure all tests pass
   - Add tests for new features

2. **Documentation**:
   - Update README if needed
   - Add JSDoc comments
   - Update CHANGELOG.md

3. **Testing**:
   - Test manually in Extension Development Host
   - Verify no regressions
   - Test edge cases

### PR Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass
- [ ] Manual testing completed
- [ ] No regressions found

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

### Review Process

1. **Automated Checks**: CI/CD pipeline runs tests and linting
2. **Code Review**: Maintainers review the code
3. **Testing**: Manual testing by maintainers
4. **Approval**: Once approved, the PR is merged

## 🏷️ Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Steps

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create release tag
4. Publish to VS Code Marketplace

## 🤝 Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Provide constructive feedback
- Focus on the issue, not the person

### Communication

- Use GitHub Issues for bug reports and feature requests
- Use GitHub Discussions for questions and general discussion
- Be clear and concise in your communication
- Provide context and examples

## 📚 Resources

### Documentation

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Ollama Documentation](https://ollama.ai/docs)
- [Model Context Protocol](https://modelcontextprotocol.io)

### Tools

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [ESLint Rules](https://eslint.org/docs/rules/)
- [VS Code Extension Generator](https://code.visualstudio.com/api/get-started/your-first-extension)

## 🆘 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Documentation**: Check the README and inline help
- **Code Comments**: Look at existing code for examples

## 🙏 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- GitHub contributors page

Thank you for contributing to Ollama for VS Code! 🎉
