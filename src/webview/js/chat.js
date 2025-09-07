(function () {
    const vscode = acquireVsCodeApi();
    const viewId = document.querySelector('html').getAttribute('id');
    const messagesContainer = document.getElementById('messages-container');
    const promptTextarea = document.getElementById('prompt-textarea');
    const sendButton = document.getElementById('send-button');
    const clearButton = document.getElementById('clear-button');
    const modelSelector = document.getElementById('model-selector');
    const systemMessageToggle = document.getElementById('system-message-toggle');
    const systemPromptContainer = document.getElementById('system-prompt-container');
    const systemPrompt = document.getElementById('system-prompt');
    const headerTitle = document.getElementById('header-title');
    const toolIcon = document.getElementById('tool-icon');
    const jsUri = document.querySelector('script[nonce]').src.match(/^(.*)\/chat\.js$/)[1]; // Extract base URI

    let messages = [];
    let models = [];
    let currentModel = null;
    let isGenerating = false;
    let messageIdCounter = 1;
    let currentRequestId = null;
    let sessionId = null; // Track session ID from backend
    let systemPromptVisible = false;
    let originalTitle = '';
    let streamingParsers = {};
    let streamingBuffers = {};
    let staticParser = null; // Defer instantiation
    const loadedScripts = new Map(); // Cache for lazy-loaded scripts
    const requestToResponseIdMap = new Map(); // Map request ID to response ID

    // Function to lazy load a JavaScript file
    function loadScript(src) {
        if (loadedScripts.has(src)) {
            return loadedScripts.get(src);
        }

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${jsUri}/${src}`;
            script.nonce = viewId;
            script.async = true;
            script.onload = () => {
                console.log(`[Webview ${viewId}] Loaded ${src}`);
                resolve();
            };
            script.onerror = (err) => {
                console.error(`[Webview ${viewId}] Failed to load ${src}: ${err}`);
                vscode.postMessage({
                    command: 'error',
                    data: { message: `Failed to load ${src}: ${err}`, source: 'loadScript', lineno: 0, colno: 0, stack: err.stack || 'No stack trace', viewId }
                });
                reject(err);
            };
            document.head.appendChild(script);
        });

        loadedScripts.set(src, promise);
        return promise;
    }

    // Function to get CustomMarkdownParser (lazy loads markdown.js)
    async function getStaticParser() {
        if (!staticParser) {
            await loadScript('markdown.js');
            staticParser = new window.CustomMarkdownParser();
        }
        return staticParser;
    }

    // Function to get diffDOM (lazy loads diffdom.js)
    async function getDiffDOM() {
        await loadScript('diffdom.js');
        return window.diffDOM.DiffDOM;
    }

    // Function to get StreamMarkdownParser (lazy loads diffdom.js, markdown.js, stream.js)
    async function getStreamParser(contentElement, options) {
        await Promise.all([
            loadScript('diffdom.js'),
            loadScript('markdown.js')
        ]);
        await loadScript('stream.js');
        return new window.StreamMarkdownParser(contentElement, options);
    }

    function initialize() {
        console.log(`[Webview ${viewId}] Initializing chat interface`);
        const loadingIndicator = document.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        promptTextarea.disabled = false;
        systemPromptContainer.classList.remove('visible');
        systemMessageToggle.textContent = 'Show system message';
        setupEventListeners();
        checkModelLoadingTimeout();
        vscode.postMessage({
            command: 'getModels',
            data: { viewId }
        });
    }

    function copyToClipboard(text) {
        return navigator.clipboard.writeText(text).then(() => {
            console.log(`[Webview ${viewId}] Copied to clipboard`);
        }).catch(err => {
            console.error(`[Webview ${viewId}] Clipboard copy failed: ${err}`);
            vscode.postMessage({
                command: 'error',
                data: { message: `Failed to copy to clipboard: ${err}`, source: 'copyToClipboard', lineno: 0, colno: 0, stack: err.stack || 'No stack trace', viewId }
            });
        });
    }

    function setupEventListeners() {
        promptTextarea.addEventListener('input', () => {
            sendButton.disabled = !promptTextarea.value.trim() || isGenerating || !currentModel;
            if (!isGenerating) {
                sendButton.textContent = 'Send';
                sendButton.classList.remove('stop-button');
            }
        });
        promptTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && promptTextarea.value.trim()) {
                e.preventDefault();
                if (!isGenerating) sendMessage();
            }
        });
        sendButton.addEventListener('click', () => {
            if (isGenerating) {
                stopMessage();
            } else {
                sendMessage();
            }
        });
        clearButton.addEventListener('click', clearChat);
        modelSelector.addEventListener('change', () => {
            currentModel = modelSelector.value;
            console.log(`[Webview ${viewId}] Selected model: ${currentModel}`);
            updateToolIcon();
            vscode.postMessage({
                command: 'updateModel',
                data: { model: currentModel, viewId }
            });
        });
        systemMessageToggle.addEventListener('click', toggleSystemPrompt);
        headerTitle.addEventListener('click', startTitleEdit);
        headerTitle.addEventListener('keydown', handleTitleKeydown);
        headerTitle.addEventListener('blur', saveTitle);
        window.addEventListener('message', handleMessages);

        messagesContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-code-button')) {
                const pre = e.target.closest('pre');
                const code = pre.querySelector('code')?.textContent || '';
                copyToClipboard(code).then(() => {
                    e.target.textContent = 'Copied!';
                    e.target.setAttribute('aria-label', 'Code copied');
                    e.target.classList.add('copied');
                    setTimeout(() => {
                        e.target.textContent = 'Copy';
                        e.target.setAttribute('aria-label', 'Copy code block');
                        e.target.classList.remove('copied');
                    }, 1500);
                    e.stopPropagation();
                });
            } else if (e.target.classList.contains('edit-message-button')) {
                const messageDiv = e.target.closest('.user-message');
                const messageId = messageDiv.id.replace('user-message-', '');
                startMessageEdit(messageDiv, messageId);
            } else if (e.target.classList.contains('save-message-button')) {
                const messageDiv = e.target.closest('.user-message');
                const messageId = messageDiv.id.replace('user-message-', '');
                saveMessageEdit(messageDiv, messageId);
            } else if (e.target.classList.contains('cancel-message-button')) {
                const messageDiv = e.target.closest('.user-message');
                const messageId = messageDiv.id.replace('user-message-', '');
                cancelMessageEdit(messageDiv, messageId);
            } else if (e.target.classList.contains('copy-message-button')) {
                const messageDiv = e.target.closest('.user-message');
                const messageId = messageDiv.id.replace('user-message-', '');
                const message = messages.find(m => m.id === messageId);
                if (message) {
                    copyToClipboard(message.content).then(() => {
                        e.target.textContent = 'Copied!';
                        e.target.setAttribute('aria-label', 'Message copied');
                        setTimeout(() => {
                            e.target.textContent = 'Copy';
                            e.target.setAttribute('aria-label', 'Copy message');
                        }, 1500);
                    });
                }
            } else if (e.target.classList.contains('regenerate-message-button')) {
                const messageDiv = e.target.closest('.ai-message, .tool-message');
                const messageId = messageDiv.id.replace(/^(ai|tool)-message-/, '');
                regenerateMessage(messageId);
            } else if (e.target.classList.contains('copy-ai-message-button')) {
                const messageDiv = e.target.closest('.ai-message, .tool-message');
                const messageId = messageDiv.id.replace(/^(ai|tool)-message-/, '');
                const message = messages.find(m => m.id === messageId);
                if (message) {
                    copyToClipboard(message.content).then(() => {
                        e.target.textContent = 'Copied!';
                        e.target.setAttribute('aria-label', `${message.role === 'tool' ? 'Tool' : 'AI'} message copied`);
                        setTimeout(() => {
                            e.target.textContent = 'Copy';
                            e.target.setAttribute('aria-label', `Copy ${message.role === 'tool' ? 'tool' : 'AI'} message`);
                        }, 1500);
                    });
                }
            }
        });

        messagesContainer.addEventListener('keydown', (e) => {
            if (e.target.classList.contains('copy-code-button') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.target.click();
            } else if (e.target.classList.contains('edit-message-button') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.target.click();
            } else if (e.target.classList.contains('save-message-button') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.target.click();
            } else if (e.target.classList.contains('cancel-message-button') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.target.click();
            } else if (e.target.classList.contains('copy-message-button') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.target.click();
            } else if (e.target.classList.contains('regenerate-message-button') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.target.click();
            } else if (e.target.classList.contains('copy-ai-message-button') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.target.click();
            } else if (e.target.classList.contains('edit-message-textarea') && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const messageDiv = e.target.closest('.user-message');
                const messageId = messageDiv.id.replace('user-message-', '');
                saveMessageEdit(messageDiv, messageId);
            } else if (e.target.classList.contains('edit-message-textarea') && e.key === 'Escape') {
                const messageDiv = e.target.closest('.user-message');
                const messageId = messageDiv.id.replace('user-message-', '');
                cancelMessageEdit(messageDiv, messageId);
            }
        });
    }

    function startMessageEdit(messageDiv, messageId) {
        const message = messages.find(m => m.id === messageId);
        if (!message) {
            console.error(`[Webview ${viewId}] Message not found for ID: ${messageId}`);
            return;
        }
        const contentDiv = messageDiv.querySelector('.message-content');
        const originalContent = message.content;
        contentDiv.innerHTML = '';

        const textarea = document.createElement('textarea');
        textarea.classList.add('edit-message-textarea');
        textarea.value = originalContent;
        contentDiv.appendChild(textarea);

        const toolbox = messageDiv.querySelector('.toolbox');
        toolbox.innerHTML = '';
        const saveButton = document.createElement('button');
        saveButton.classList.add('toolbox-button', 'save-message-button');
        saveButton.textContent = 'Save';
        saveButton.setAttribute('aria-label', 'Save edited message');
        toolbox.appendChild(saveButton);

        const cancelButton = document.createElement('button');
        cancelButton.classList.add('toolbox-button', 'cancel-message-button');
        cancelButton.textContent = 'Cancel';
        cancelButton.setAttribute('aria-label', 'Cancel edit');
        toolbox.appendChild(cancelButton);

        textarea.focus();
        console.log(`[Webview ${viewId}] Started editing message ID: ${messageId}`);
    }

    function removeErrorMessages() {
        messages = messages.filter(m => m.role !== 'error');
        const errorElements = messagesContainer.querySelectorAll('.error-message');
        errorElements.forEach(element => element.remove());
        console.log(`[Webview ${viewId}] Removed error messages from UI and messages array`);
    }

    async function sendChatMessage(messageId, messagesToSend, isEdit = false) {
        if (isGenerating || !currentModel) {
            console.warn(`[Webview ${viewId}] Cannot send message: ${isGenerating ? 'Generation in progress' : 'No model selected'}`);
            return false;
        }

        stopMessage();
        removeErrorMessages();

        const system = systemPrompt.value.trim();
        if (system) {
            const systemMessageIndex = messagesToSend.findIndex(m => m.role === 'system');
            if (systemMessageIndex >= 0) {
                messagesToSend[systemMessageIndex].content = system;
            } else {
                messagesToSend.unshift({ role: 'system', content: system, id: 'system-0' });
            }
        }

        isGenerating = true;
        currentRequestId = messageId;
        sendButton.disabled = false;
        sendButton.textContent = 'Stop';
        sendButton.classList.add('stop-button');

        const typingIndicator = document.createElement('div');
        typingIndicator.classList.add('typing-indicator');
        typingIndicator.id = `typing-indicator`;
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.classList.add('typing-dot');
            typingIndicator.appendChild(dot);
        }
        messagesContainer.appendChild(typingIndicator);
        autoScroll();

        vscode.postMessage({
            command: 'ollamaChat',
            data: { viewId, id: messageId, model: currentModel, messages: messagesToSend, system: system || undefined, sessionId }
        });
        console.log(`[Webview ${viewId}] ${isEdit ? 'Regenerating response for edited message' : 'Sending new message'} ID: ${messageId}`);
        return true;
    }

    async function regenerateMessage(messageId) {
        const messageIndex = messages.findIndex(m => m.id === messageId && (m.role === 'assistant' || m.role === 'tool'));
        if (messageIndex === -1) {
            console.error(`[Webview ${viewId}] Message not found for ID: ${messageId}`);
            return;
        }

        let userMessageIndex = -1;
        for (let i = messageIndex - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                userMessageIndex = i;
                break;
            }
        }
        if (userMessageIndex === -1) {
            console.error(`[Webview ${viewId}] No preceding user message found for message ID: ${messageId}`);
            return;
        }

        const userMessage = messages[userMessageIndex];
        const messagesToSend = messages.slice(0, userMessageIndex + 1);
        const systemMessage = messages.find(m => m.role === 'system');
        if (systemMessage && !messagesToSend.some(m => m.role === 'system')) {
            messagesToSend.unshift(systemMessage);
        }

        messages = messages.slice(0, userMessageIndex + 1);
        const messageElements = messagesContainer.querySelectorAll('.message');
        messageElements.forEach(element => {
            const elementId = element.id.match(/^(user|ai|tool)-message-(\d+)$/)?.[2];
            if (elementId && Number(elementId) > Number(userMessage.id)) {
                element.remove();
            }
        });

        const success = await sendChatMessage(userMessage.id, messagesToSend, true);
        if (!success) {
            console.warn(`[Webview ${viewId}] Failed to regenerate message ID: ${userMessage.id}`);
        }
    }

    async function saveMessageEdit(messageDiv, messageId) {
        const textarea = messageDiv.querySelector('.edit-message-textarea');
        const newContent = textarea.value.trim();
        if (!newContent) {
            console.warn(`[Webview ${viewId}] Empty message content for ID: ${messageId}, not saving`);
            vscode.postMessage({
                command: 'error',
                data: { message: 'Message content cannot be empty', source: 'saveMessageEdit', lineno: 0, colno: 0, stack: 'No stack trace', viewId }
            });
            return;
        }

        const messageIndex = messages.findIndex(m => m.id === messageId);
        const message = messages[messageIndex];
        if (!message) {
            console.error(`[Webview ${viewId}] Message not found for ID: ${messageId}`);
            return;
        }

        message.content = newContent;

        const systemMessage = messages.find(m => m.role === 'system');
        messages = messages.slice(0, messageIndex + 1);
        if (systemMessage && !messages.some(m => m.role === 'system')) {
            messages.unshift(systemMessage);
        }

        const messageElements = messagesContainer.querySelectorAll('.message');
        messageElements.forEach(element => {
            const elementId = element.id.match(/^(user|ai|tool)-message-(\d+)$/)?.[2];
            if (elementId && Number(elementId) > Number(messageId)) {
                element.remove();
            }
        });

        const parser = await getStaticParser();
        messageDiv.querySelector('.message-content').innerHTML = parser.escapeHtml(newContent);

        const toolbox = messageDiv.querySelector('.toolbox');
        toolbox.innerHTML = '';
        const editButton = document.createElement('button');
        editButton.classList.add('toolbox-button', 'edit-message-button');
        editButton.textContent = 'Edit';
        editButton.setAttribute('aria-label', 'Edit message');
        toolbox.appendChild(editButton);

        const copyButton = document.createElement('button');
        copyButton.classList.add('toolbox-button', 'copy-message-button');
        copyButton.textContent = 'Copy';
        copyButton.setAttribute('aria-label', 'Copy message');
        toolbox.appendChild(copyButton);

        const success = await sendChatMessage(messageId, messages, true);
        if (!success) {
            vscode.postMessage({
                command: 'updateMessage',
                data: { viewId, messageId, content: newContent, sessionId }
            });
        }
    }

    async function cancelMessageEdit(messageDiv, messageId) {
        const message = messages.find(m => m.id === messageId);
        if (!message) {
            console.error(`[Webview ${viewId}] Message not found for ID: ${messageId}`);
            return;
        }

        const parser = await getStaticParser();
        messageDiv.querySelector('.message-content').innerHTML = parser.escapeHtml(message.content);

        const toolbox = messageDiv.querySelector('.toolbox');
        toolbox.innerHTML = '';
        const editButton = document.createElement('button');
        editButton.classList.add('toolbox-button', 'edit-message-button');
        editButton.textContent = 'Edit';
        editButton.setAttribute('aria-label', 'Edit message');
        toolbox.appendChild(editButton);

        const copyButton = document.createElement('button');
        copyButton.classList.add('toolbox-button', 'copy-message-button');
        copyButton.textContent = 'Copy';
        copyButton.setAttribute('aria-label', 'Copy message');
        toolbox.appendChild(copyButton);

        console.log(`[Webview ${viewId}] Canceled editing message ID: ${messageId}`);
    }

    async function sendMessage() {
        const userInput = promptTextarea.value.trim();
        if (!userInput) return;

        if (!Array.isArray(messages)) {
            console.error(`[Webview ${viewId}] Messages array invalid, resetting`);
            messages = [];
        }

        const messageId = (messageIdCounter++).toString();
        messages.push({ role: 'user', content: userInput, id: messageId });
        addMessageToUI('user', userInput, messageId);
        promptTextarea.value = '';
        streamingBuffers[messageId] = '';

        await sendChatMessage(messageId, messages);
    }

    function stopMessage() {
        if (!isGenerating) {
            console.warn(`[Webview ${viewId}] No generation in progress to stop`);
            return;
        }
        console.log(`[Webview ${viewId}] Stopping chat generation`);
        vscode.postMessage({
            command: 'stopOllamaChat',
            data: { viewId }
        });
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        isGenerating = false;
        currentRequestId = null;
        sendButton.textContent = 'Send';
        sendButton.classList.remove('stop-button');
        sendButton.disabled = !promptTextarea.value.trim() || !currentModel;
        promptTextarea.disabled = false;
        promptTextarea.focus();
        autoScroll();
    }

    function handleMessages(event) {
        const message = event.data;
        if (message.viewId !== viewId) return;
        console.log(`[Webview ${viewId}] Processing message: ${JSON.stringify(message)}`);
        switch (message.command) {
            case 'setModels':
                handleSetModels(message.data.models);
                break;
            case 'updateResponse':
                handleUpdateResponse(message.data?.message);
                break;
            case 'completeResponse':
                handleCompleteResponse(message.data?.message);
                break;
            case 'error':
                handleError(message.data);
                break;
            case 'setPrompt':
                handle_setPrompt(message.data);
                break;
            case 'setTitle':
                handleSetTitle(message.data.title);
                break;
            case 'chatSaved':
                handleChatSaved();
                break;
            case 'restoreChat':
                handleRestoreChat(message.data);
                break;
            case 'setModel':
                handleSetModel(message.data.model);
                break;
            case 'stopResponse':
                handleStopResponse();
                break;
            case 'updateMessage':
                handleUpdateMessage(message.data);
                break;
        }
    }

    async function handleUpdateMessage(data) {
        const { messageId, content } = data;
        const message = messages.find(m => m.id === messageId);
        if (!message) {
            console.error(`[Webview ${viewId}] Message not found for ID: ${messageId}`);
            return;
        }
        message.content = content;
        const messageDiv = document.getElementById(`user-message-${messageId}`);
        if (messageDiv) {
            const parser = await getStaticParser();
            messageDiv.querySelector('.message-content').innerHTML = parser.escapeHtml(content);
        }
        console.log(`[Webview ${viewId}] Updated message ID: ${messageId} in UI`);
        autoScroll();
    }

    function checkModelLoadingTimeout() {
        setTimeout(() => {
            if (modelSelector.options.length === 1 && modelSelector.options[0].text === 'Loading models...') {
                console.error(`[Webview ${viewId}] Model loading timeout after 5s`);
                modelSelector.innerHTML = '';
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Failed to load models';
                option.disabled = true;
                modelSelector.appendChild(option);
                sendButton.disabled = true;
                updateToolIcon();
            }
        }, 5000);
    }

    function handleSetModel(model) {
        console.log(`[Webview ${viewId}] Setting model to: ${model}`);
        currentModel = model;
        if (modelSelector) {
            modelSelector.value = model;
            updateToolIcon();
            sendButton.disabled = !promptTextarea.value.trim() || isGenerating;
        } else {
            console.error(`[Webview ${viewId}] Model selector element not found`);
        }
    }

    function updateToolIcon() {
        const selectedModel = models.find(model => model.name === currentModel);
        toolIcon.classList.remove('tool-supported', 'no-tool');
        if (selectedModel?.supportsTools) {
            toolIcon.classList.add('tool-supported');
            toolIcon.setAttribute('data-tooltip', 'This model supports tool calling.');
        } else {
            toolIcon.classList.add('no-tool');
            toolIcon.setAttribute('data-tooltip', currentModel ? 'This model does not support tool calling.' : 'No model selected.');
        }
    }

    function handleSetModels(modelsList) {
        models = modelsList || [];
        console.log(`[Webview ${viewId}] Loaded models: ${models.map(m => m.name).join(', ')}`);
        modelSelector.innerHTML = '';
        if (models.length > 0) {
            models.sort((a, b) => a.name.localeCompare(b.name));
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.name;
                modelSelector.appendChild(option);
            });
            if (currentModel && models.some(m => m.name === currentModel)) {
                modelSelector.value = currentModel;
            }
            if (!currentModel) {
                currentModel = models[0].name;
            }
            sendButton.disabled = !promptTextarea.value.trim() || isGenerating;
        } else {
            console.warn(`[Webview ${viewId}] No models available`);
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No models available';
            option.disabled = true;
            modelSelector.appendChild(option);
            sendButton.disabled = true;
        }
        updateToolIcon();
    }

    function startTitleEdit() {
        originalTitle = headerTitle.textContent.trim();
        headerTitle.contentEditable = 'true';
        headerTitle.focus();
        const range = document.createRange();
        range.selectNodeContents(headerTitle);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function handleTitleKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        } else if (e.key === 'Escape') {
            headerTitle.textContent = originalTitle;
            headerTitle.contentEditable = 'false';
            headerTitle.blur();
        }
    }

    function saveTitle() {
        const newTitle = headerTitle.textContent.trim();
        if (newTitle && newTitle !== originalTitle) {
            console.log(`[Webview ${viewId}] Updating title to: ${newTitle}`);
            vscode.postMessage({
                command: 'updateTitle',
                data: { title: newTitle, viewId }
            });
        }
        headerTitle.contentEditable = 'false';
    }

    function handleSetTitle(title) {
        headerTitle.textContent = title || 'Ollama Chat';
        originalTitle = headerTitle.textContent;
        console.log(`[Webview ${viewId}] Title set to: ${headerTitle.textContent}`);
    }

    function handleStopResponse() {
        console.log(`[Webview ${viewId}] Received stop response from backend`);
        isGenerating = false;
        currentRequestId = null;
        sendButton.textContent = 'Send';
        sendButton.classList.remove('stop-button');
        sendButton.disabled = !promptTextarea.value.trim() || !currentModel;
        promptTextarea.disabled = false;
        promptTextarea.focus();
        autoScroll();
    }

    function handleChatSaved() {
        console.log(`[Webview ${viewId}] Chat saved successfully`);
    }

    function handleRestoreChat(data) {
        sessionId = data.sessionId || null;
        messages = (data.messages || []).map((msg, index) => ({
            role: msg.role,
            content: msg.content,
            tool_calls: msg.tool_calls,
            id: msg.id || index.toString()
        }));
        const maxId = messages.length > 0 ? Math.max(...messages.map(m => Number(m.id) || 0)) : 0;
        messageIdCounter = (maxId > 0 ? maxId : 0) + 1;
        console.log(`[Webview ${viewId}] Restored ${messages.length} messages, set messageIdCounter to ${messageIdCounter}`);
        currentModel = data.model;
        if (modelSelector && currentModel) {
            modelSelector.value = currentModel;
            console.log(`[Webview ${viewId}] Restored model: ${currentModel}`);
        }
        messagesContainer.innerHTML = '';
        messages.forEach(msg => {
            addMessageToUI(msg.role, msg.content, msg.id, msg.tool_calls);
        });
        autoScroll();
        promptTextarea.disabled = false;
        sendButton.disabled = true;
        sendButton.textContent = 'Send';
        sendButton.classList.remove('stop-button');
        isGenerating = false;
    }

    async function handleUpdateResponse(chatMessage) {
        if (!chatMessage.id) {
            console.error(`[Webview ${viewId}] Missing message ID in updateResponse`);
            vscode.postMessage({
                command: 'error',
                data: { message: 'Missing message ID in updateResponse', source: 'handleUpdateResponse', lineno: 0, colno: 0, stack: 'No stack trace', viewId }
            });
            return;
        }
        const { id: responseId, role, content, tool_calls, tool_call_id } = chatMessage;
        if (!requestToResponseIdMap.has(currentRequestId)) {
            requestToResponseIdMap.set(currentRequestId, responseId);
        }
        let message = messages.find(m => m.id === responseId);

        console.log(`[Webview ${viewId}] [Streaming ${responseId}] Received content (length: ${content ? content.length : 0}): "${content ? content.replace(/\n/g, '\\n') : 'No content'}"${tool_calls ? `, Tool calls: ${JSON.stringify(tool_calls)}` : ''}${tool_call_id ? `, Tool call ID: ${tool_call_id}` : ''}`);

        if (!message) {
            message = {
                role: role,
                content: content || '',
                tool_calls: tool_calls || [],
                tool_call_id: tool_call_id || null,
                id: responseId
            };
            messages.push(message);
        } else {
            if (content) {
                message.content = (message.content || '') + content;
            }
            if (tool_calls && tool_calls.length > 0) {
                message.tool_calls = message.tool_calls || [];
                tool_calls.forEach(tc => {
                    if (!message.tool_calls.some(existing => existing.id === tc.id)) {
                        message.tool_calls.push(tc);
                    }
                });
            }
            if (tool_call_id) {
                message.tool_call_id = tool_call_id;
            }
        }

        let parser = streamingParsers[responseId];
        let existingMessage = document.getElementById(`${role === 'tool' ? 'tool' : 'ai'}-message-${responseId}`);

        // Always call addMessageToUI to ensure toolbox is updated correctly
        addMessageToUI(role, message.content || '', responseId, message.tool_calls, message.tool_call_id);

        if (role === 'assistant' && content) {
            existingMessage = document.getElementById(`ai-message-${responseId}`);
            if (!parser && existingMessage) {
                const contentElement = existingMessage.querySelector('.message-content');
                try {
                    parser = await getStreamParser(contentElement, { mode: 'realtime' });
                    streamingParsers[responseId] = parser;
                    streamingBuffers[responseId] = message.content || '';
                } catch (err) {
                    console.error(`[Webview ${viewId}] Failed to load StreamMarkdownParser: ${err}`);
                    existingMessage.querySelector('.message-content').innerHTML = (await getStaticParser()).escapeHtml(message.content || '');
                }
            }
            if (parser) {
                streamingBuffers[responseId] = message.content;
                try {
                    parser.processStream(content);
                } catch (e) {
                    console.error(`[Webview ${viewId}] [Streaming ${responseId}] Parser error: ${e}`);
                    vscode.postMessage({
                        command: 'error',
                        data: { message: `Parser error: ${e}`, source: 'handleUpdateResponse', lineno: 0, colno: 0, stack: e.stack || 'No stack trace', viewId }
                    });
                    const contentElement = existingMessage.querySelector('.message-content');
                    contentElement.innerHTML = (await getStaticParser()).escapeHtml(streamingBuffers[responseId]);
                }
            }
        }
        autoScroll();
    }

    async function handleCompleteResponse(messageFromBackend) {
        if (!messageFromBackend || typeof messageFromBackend !== 'object') {
            console.error(`[Webview ${viewId}] Invalid message object in completeResponse`);
            return;
        }
        console.log(`[Webview ${viewId}] Completing response for message ID: ${messageFromBackend.id}`);

        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }

        const msg = messageFromBackend;
        const existingMessage = messages.find(m => m.id === msg.id);
        if (existingMessage) {
            existingMessage.content = msg.content || existingMessage.content || '';
            existingMessage.tool_calls = msg.tool_calls || existingMessage.tool_calls || [];
            existingMessage.tool_call_id = msg.tool_call_id || existingMessage.tool_call_id || null;
            existingMessage.role = msg.role || existingMessage.role;
        } else {
            messages.push({
                role: msg.role || 'assistant',
                content: msg.content || '',
                tool_calls: msg.tool_calls || [],
                tool_call_id: msg.tool_call_id || null,
                id: msg.id
            });
        }

        // Always call addMessageToUI to ensure toolbox is updated correctly
        addMessageToUI(msg.role || 'assistant', msg.content || streamingBuffers[msg.id] || '', msg.id, msg.tool_calls, msg.tool_call_id);

        const parser = streamingParsers[msg.id];
        const messageElement = document.getElementById(`${msg.role === 'tool' ? 'tool' : 'ai'}-message-${msg.id}`);
        if (parser && messageElement && msg.role === 'assistant') {
            try {
                parser.updateRealtime('');
                console.log(`[Webview ${viewId}] [Streaming ${msg.id}] Finalized output`);
            } catch (e) {
                console.error(`[Webview ${viewId}] [Streaming ${msg.id}] Completion error: ${e}`);
                const contentElement = messageElement.querySelector('.message-content');
                contentElement.innerHTML = (await getStaticParser()).escapeHtml(streamingBuffers[msg.id] || '');
            }
        }

        isGenerating = false;
        currentRequestId = null;
        promptTextarea.disabled = false;
        sendButton.disabled = !promptTextarea.value.trim() || !currentModel;
        sendButton.textContent = 'Send';
        sendButton.classList.remove('stop-button');
        promptTextarea.focus();
        autoScroll();

        delete streamingParsers[msg.id];
        delete streamingBuffers[msg.id];
    }

    async function handleError(data) {
        console.error(`[Webview ${viewId}] Error: ${data.error}`);
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
        const errorDiv = document.createElement('div');
        errorDiv.classList.add('message', 'ai-message', 'error-message');
        errorDiv.style.color = 'red';
        try {
            const parser = await getStaticParser();
            errorDiv.innerHTML = `<p class="message-content">${parser.escapeHtml(data.error)}</p>`;
        } catch (err) {
            console.error(`[Webview ${viewId}] Failed to load CustomMarkdownParser: ${err}`);
            errorDiv.innerHTML = `<p class="message-content">${data.error.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')}</p>`;
        }
        messagesContainer.appendChild(errorDiv);
        messages.push({
            role: 'error',
            content: data.error,
            id: (messageIdCounter++).toString()
        });
        isGenerating = false;
        currentRequestId = null;
        promptTextarea.disabled = false;
        sendButton.disabled = !promptTextarea.value.trim() || !currentModel;
        sendButton.textContent = 'Send';
        sendButton.classList.remove('stop-button');
        autoScroll();
        if (data.id) {
            delete streamingParsers[data.id];
            delete streamingBuffers[data.id];
        }
    }

    function handle_setPrompt(data) {
        promptTextarea.value = data.prompt || '';
        sendButton.disabled = !promptTextarea.value.trim() || isGenerating || !currentModel;
        sendButton.textContent = 'Send';
        sendButton.classList.remove('stop-button');
        promptTextarea.focus();
        console.log(`[Webview ${viewId}] Prompt set: ${data.prompt ? 'Non-empty' : 'Empty'}`);
    }

    async function addMessageToUI(role, content, id, toolCalls = null, toolCallId = null) {
        let messageDiv = document.getElementById(`${role === 'user' ? 'user' : role === 'tool' ? 'tool' : 'ai'}-message-${id}`);
        const isNewMessage = !messageDiv;

        if (isNewMessage) {
            messageDiv = document.createElement('div');
            messageDiv.classList.add('message');
            if (role === 'user') {
                messageDiv.classList.add('user-message');
            } else if (role === 'tool') {
                messageDiv.classList.add('tool-message');
            } else {
                messageDiv.classList.add('ai-message');
            }
            messageDiv.id = `${role === 'user' ? 'user' : role === 'tool' ? 'tool' : 'ai'}-message-${id}`;
            const contentDiv = document.createElement('div');
            contentDiv.classList.add('message-content');
            messageDiv.appendChild(contentDiv);
            messagesContainer.appendChild(messageDiv);
        }

        const contentDiv = messageDiv.querySelector('.message-content');
        let parser;
        try {
            parser = await getStaticParser();
        } catch (err) {
            console.error(`[Webview ${viewId}] Failed to load CustomMarkdownParser: ${err}`);
            parser = {
                parse: text => text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>'),
                escapeHtml: text => text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
            };
        }

        if (role === 'user') {
            contentDiv.innerHTML = parser.escapeHtml(content);
            let toolbox = messageDiv.querySelector('.toolbox');
            if (!toolbox) {
                toolbox = document.createElement('div');
                toolbox.classList.add('toolbox');
                messageDiv.appendChild(toolbox);
            }
            if (isNewMessage || !toolbox.hasChildNodes()) {
                toolbox.innerHTML = '';
                const editButton = document.createElement('button');
                editButton.classList.add('toolbox-button', 'edit-message-button');
                editButton.textContent = 'Edit';
                editButton.setAttribute('aria-label', 'Edit message');
                toolbox.appendChild(editButton);

                const copyButton = document.createElement('button');
                copyButton.classList.add('toolbox-button', 'copy-message-button');
                copyButton.textContent = 'Copy';
                copyButton.setAttribute('aria-label', 'Copy message');
                toolbox.appendChild(copyButton);
            }
        } else if (role === 'tool') {
            const header = document.createElement('div');
            header.classList.add('tool-call-header');
            header.textContent = `Tool Response:`;
            const toolContentDiv = document.createElement('div');
            toolContentDiv.classList.add('tool-call-content');
            toolContentDiv.innerHTML = parser.parse(content || '');
            contentDiv.innerHTML = '';
            messageDiv.prepend(header);
            contentDiv.appendChild(toolContentDiv);

            header.addEventListener('click', () => {
                const isExpanded = header.classList.toggle('expanded');
                toolContentDiv.classList.toggle('visible', isExpanded);
            });
        } else {
            contentDiv.innerHTML = parser.parse(content || '');
            if (toolCalls && toolCalls.length > 0) {
                toolCalls.forEach((toolCall, index) => {
                    const toolCallDiv = document.createElement('div');
                    toolCallDiv.classList.add('tool-call');
                    toolCallDiv.innerHTML = '<p>Tool Call Requested:</p>';
                    const header = document.createElement('div');
                    header.classList.add('tool-call-header');
                    header.textContent = `Tool: ${parser.escapeHtml(toolCall.function.name)}`;
                    const argsStr = JSON.stringify(toolCall.function.arguments, null, 2);
                    const toolContentDiv = document.createElement('div');
                    toolContentDiv.classList.add('tool-call-content');
                    toolContentDiv.innerHTML = `<pre><code>${parser.escapeHtml(argsStr)}</code></pre>`;
                    toolCallDiv.appendChild(header);
                    toolCallDiv.appendChild(toolContentDiv);
                    contentDiv.appendChild(toolCallDiv);

                    header.addEventListener('click', () => {
                        const isExpanded = header.classList.toggle('expanded');
                        toolContentDiv.classList.toggle('visible', isExpanded);
                    });
                });
            }
        }

        // Handle toolbox for assistant and tool messages
        if (role === 'assistant' || role === 'tool') {
            // Find the sequence of assistant and tool messages
            const messageIndex = messages.findIndex(m => m.id === id && (m.role === 'assistant' || m.role === 'tool'));
            let sequenceStartIndex = messageIndex;
            let sequenceEndIndex = messageIndex;

            // Find the start of the sequence
            for (let i = messageIndex - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant' || messages[i].role === 'tool') {
                    sequenceStartIndex = i;
                } else {
                    break;
                }
            }

            // Find the end of the sequence
            for (let i = messageIndex + 1; i < messages.length; i++) {
                if (messages[i].role === 'assistant' || messages[i].role === 'tool') {
                    sequenceEndIndex = i;
                } else {
                    break;
                }
            }

            // Remove toolboxes from all assistant and tool messages in the current sequence
            for (let i = sequenceStartIndex; i <= sequenceEndIndex; i++) {
                const msg = messages[i];
                const msgDiv = document.getElementById(`${msg.role === 'tool' ? 'tool' : 'ai'}-message-${msg.id}`);
                if (msgDiv) {
                    const toolbox = msgDiv.querySelector('.toolbox');
                    if (toolbox) {
                        toolbox.remove();
                    }
                }
            }

            // Add toolbox only to the last message in the sequence
            const isLastInSequence = messageIndex === sequenceEndIndex;
            if (isLastInSequence) {
                let toolbox = messageDiv.querySelector('.toolbox');
                if (!toolbox) {
                    toolbox = document.createElement('div');
                    toolbox.classList.add('toolbox');
                    messageDiv.appendChild(toolbox);
                }
                toolbox.innerHTML = '';
                const regenerateButton = document.createElement('button');
                regenerateButton.classList.add('toolbox-button', 'regenerate-message-button');
                regenerateButton.textContent = 'Regenerate';
                regenerateButton.setAttribute('aria-label', 'Regenerate response');
                toolbox.appendChild(regenerateButton);

                const copyButton = document.createElement('button');
                copyButton.classList.add('toolbox-button', 'copy-ai-message-button');
                copyButton.textContent = 'Copy';
                copyButton.setAttribute('aria-label', `Copy ${role === 'tool' ? 'tool' : 'AI'} message`);
                toolbox.appendChild(copyButton);
            }
        }
        autoScroll();
    }

    function clearChat() {
        messages = messages.filter(m => m.role === 'system') || [];
        messagesContainer.innerHTML = '';
        isGenerating = false;
        currentRequestId = null;
        requestToResponseIdMap.clear();
        sendButton.disabled = true;
        sendButton.textContent = 'Send';
        sendButton.classList.remove('stop-button');
        streamingParsers = {};
        streamingBuffers = {};
        console.log(`[Webview ${viewId}] Chat cleared`);
        autoScroll();
    }

    function toggleSystemPrompt() {
        systemPromptVisible = !systemPromptVisible;
        console.log(`[Webview ${viewId}] Toggling system prompt to ${systemPromptVisible ? 'visible' : 'hidden'}`);
        if (systemPromptVisible) {
            systemPromptContainer.classList.add('visible');
            systemMessageToggle.className = 'system-message-toggle hide';
            systemMessageToggle.textContent = 'Hide system message';
            systemPrompt.focus();
        } else {
            systemPromptContainer.classList.remove('visible');
            systemMessageToggle.className = 'system-message-toggle show';
            systemMessageToggle.textContent = 'Show system message';
        }
    }

    function autoScroll() {
        const container = messagesContainer;
        const scrollPosition = container.scrollTop + container.clientHeight;
        const scrollHeight = container.scrollHeight;
        const threshold = 100; // Pixels from bottom to trigger auto-scroll

        if (scrollHeight - scrollPosition <= threshold) {
            container.scrollTop = scrollHeight;
        }
    }

    window.onerror = function (message, source, lineno, colno, error) {
        console.error(`[Webview ${viewId}] Global error: ${message} at ${source}:${lineno}:${colno}`);
        vscode.postMessage({
            command: 'error',
            data: { message, source, lineno, colno, stack: error?.stack || 'No stack trace', viewId }
        });
    };

    initialize();
})();