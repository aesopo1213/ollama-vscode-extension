(function() {
    const testIcon = '<span class="icon"><svg aria-hidden="true" fill="currentColor" viewBox="0 0 297 297" xmlns="http://www.w3.org/2000/svg"><g><g><path d="m206.51,32c-0.269-17.718-14.706-32-32.487-32h-49.379c-17.781,0-32.219,14.282-32.487,32h-42.657v265h198v-265h-40.99zm-81.866-16h49.189 0.19c9.099,0 16.5,7.402 16.5,16.5s-7.401,16.5-16.5,16.5h-49.379c-9.099,0-16.5-7.402-16.5-16.5s7.401-16.5 16.5-16.5zm23.856,239h-66v-16h66v16zm0-50h-66v-16h66v16zm0-49h-66v-16h66v16zm0-50h-66v-16h66v16zm43.768,160.029l-19.541-16.204 10.213-12.316 7.793,6.462 12.19-13.362 11.82,10.783-22.475,24.637zm0-50l-19.541-16.204 10.213-12.316 7.793,6.462 12.19-13.362 11.82,10.783-22.475,24.637zm0-49l-19.541-16.204 10.213-12.316 7.793,6.462 12.19-13.362 11.82,10.783-22.475,24.637zm0-50l-19.541-16.204 10.213-12.316 7.793,6.462 12.19-13.362 11.82,10.783-22.475,24.637z"/></g></g></svg></span>';
    const vscode = acquireVsCodeApi();
    let isDomReady = false;
    let pendingMessages = [];

    // DOM elements
    const elements = {
    formTitle: document.getElementById('form-title'),
    serverIdInput: document.getElementById('server-id'),
    nameInput: document.getElementById('name'),
    typeSelect: document.getElementById('type'),
    commandInput: document.getElementById('command'),
    argsInput: document.getElementById('args'),
    envInput: document.getElementById('env'),
    urlInput: document.getElementById('url'),
    headersInput: document.getElementById('headers'),
    stdioOptions: document.getElementById('stdio-options'),
    sseOptions: document.getElementById('sse-options'),
    saveBtn: document.getElementById('save-btn'),
    testBtn: document.getElementById('test-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    messageDiv: document.getElementById('message')
    };

    let isSaving = false;
    let isTesting = false;

    function showMessage(text, type = 'error') {
    elements.messageDiv.textContent = text;
    elements.messageDiv.className = type;
    setTimeout(() => { elements.messageDiv.textContent = ''; elements.messageDiv.className = ''; }, 5000);
    }

    function toggleFields() {
    const isStdio = elements.typeSelect.value === 'stdio';
    elements.stdioOptions.classList.toggle('hidden', !isStdio);
    elements.sseOptions.classList.toggle('hidden', isStdio);
    }

    function validateForm() {
    const isValid = elements.nameInput.value.trim().length > 0;
    elements.saveBtn.disabled = !isValid || isSaving || isTesting;
    elements.testBtn.disabled = !isValid || isTesting || isSaving;
    return isValid;
    }

    function clearForm() {
    elements.serverIdInput.value = '';
    elements.nameInput.value = '';
    elements.typeSelect.value = 'stdio';
    elements.commandInput.value = '';
    elements.argsInput.value = '';
    elements.envInput.value = '';
    elements.urlInput.value = '';
    elements.headersInput.value = '';
    elements.formTitle.textContent = 'Add New MCP Server';
    toggleFields();
    validateForm();
    }

    function cancel() {
    vscode.postMessage({ command: 'cancel' });
    }

    function getServerConfig() {
    const server = {
        id: elements.serverIdInput.value || '',
        name: elements.nameInput.value.trim(),
        type: elements.typeSelect.value
    };
    if (elements.typeSelect.value === 'stdio') {
        server.command = elements.commandInput.value.trim() || undefined;
        server.args = elements.argsInput.value ? elements.argsInput.value.split(',').map(s => s.trim()).filter(s => s) : undefined;
        server.env = elements.envInput.value ? Object.fromEntries(
        elements.envInput.value.split(',').map(s => s.trim()).filter(s => s.includes('=')).map(s => s.split('='))
        ) : undefined;
    } else {
        server.url = elements.urlInput.value.trim() || undefined;
        server.headers = elements.headersInput.value ? Object.fromEntries(
        elements.headersInput.value.split(',').map(s => s.trim()).filter(s => s.includes('=')).map(s => s.split('='))
        ) : undefined;
    }
    return server;
    }

    function loadServer(server) {
    try {
        clearForm();
        const s = server || {};
        elements.formTitle.textContent = s.id ? 'Configure MCP Server' : 'Add New MCP Server';
        elements.serverIdInput.value = s.id || '';
        elements.nameInput.value = s.name || '';
        elements.typeSelect.value = s.type === 'stdio' || s.type === 'sse' ? s.type : 'stdio';
        elements.commandInput.value = s.command || '';
        elements.argsInput.value = Array.isArray(s.args) ? s.args.join(', ') : s.args || '';
        elements.envInput.value = s.env && typeof s.env === 'object' ? Object.entries(s.env).map(([k, v]) => `${k}=${v}`).join(', ') : '';
        elements.urlInput.value = s.url || '';
        elements.headersInput.value = s.headers && typeof s.headers === 'object' ? Object.entries(s.headers).map(([k, v]) => `${k}=${v}`).join(', ') : '';
        toggleFields();
        validateForm();
    } catch (error) {
        console.error('loadServer error:', error);
        showMessage('Failed to load server data', 'error');
    }
    }

    // Event listeners
    elements.typeSelect.addEventListener('change', toggleFields);
    elements.nameInput.addEventListener('input', validateForm);

    elements.saveBtn.addEventListener('click', () => {
    if (!validateForm()) {
        showMessage('Name is required', 'error');
        return;
    }
    isSaving = true;
    elements.saveBtn.disabled = true;
    elements.testBtn.disabled = true;
    elements.saveBtn.classList.add('loading');
    elements.saveBtn.innerHTML = '<span class="icon"><svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="18.84 18.84"/></svg></span> Saving...';
    vscode.postMessage({ command: 'saveServer', server: getServerConfig() });
    });

    elements.testBtn.addEventListener('click', () => {
    if (!validateForm()) {
        showMessage('Name is required', 'error');
        return;
    }
    isTesting = true;
    elements.testBtn.disabled = true;
    elements.saveBtn.disabled = true;
    elements.testBtn.classList.add('loading');
    elements.testBtn.innerHTML = '<span class="icon"><svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="18.84 18.84"/></svg></span> Testing...';
    showMessage('Testing connection...', 'info');
    vscode.postMessage({ command: 'testServer', server: getServerConfig() });
    });

    elements.cancelBtn.addEventListener('click', cancel);

    document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && validateForm() && !isSaving && !isTesting) {
        if (document.activeElement === elements.testBtn) {
        elements.testBtn.click();
        } else {
        elements.saveBtn.click();
        }
    } else if (e.key === 'Escape') {
        cancel();
    } else if (e.altKey && e.key.toLowerCase() === 't' && validateForm() && !isSaving && !isTesting) {
        elements.testBtn.click();
    }
    });

    // Handle messages
    function handleMessage(event) {
    const message = event.data;
    if (message.command === 'loadServer') {
        console.log('Received loadServer:', JSON.stringify(message, null, 2));
    }
    if (!isDomReady) {
        pendingMessages.push(message);
        return;
    }
    switch (message.command) {
        case 'getServer':
        vscode.postMessage({ command: 'getServer', serverId: message.serverId });
        break;
        case 'loadServer':
        loadServer(message.server);
        isSaving = false;
        isTesting = false;
        elements.saveBtn.classList.remove('loading');
        elements.testBtn.classList.remove('loading');
        elements.saveBtn.innerHTML = '<span class="icon"><svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M13.35 5.35l-6.7 6.7-3.5-3.5.71-.71 2.79 2.79 6-6z"/></svg></span> Save';
        elements.testBtn.innerHTML = testIcon + ' Test';
        break;
        case 'testResult':
        isTesting = false;
        elements.testBtn.disabled = false;
        elements.saveBtn.disabled = !validateForm();
        elements.testBtn.classList.remove('loading');
        elements.testBtn.innerHTML = testIcon + ' Test';
        if (message.success) {
            showMessage('Connection successful', 'success');
        } else {
            showMessage(`Connection failed: ${message.error}`, 'error');
        }
        break;
        case 'error':
        showMessage(`Error: ${message.error}`, 'error');
        isSaving = false;
        isTesting = false;
        elements.saveBtn.disabled = !validateForm();
        elements.testBtn.disabled = !validateForm();
        elements.saveBtn.classList.remove('loading');
        elements.testBtn.classList.remove('loading');
        elements.saveBtn.innerHTML = '<span class="icon"><svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M13.35 5.35l-6.7 6.7-3.5-3.5.71-.71 2.79 2.79 6-6z"/></svg></span> Save';
        elements.testBtn.innerHTML = testIcon + ' Test';
        break;
    }
    }

    // DOM readiness
    document.addEventListener('DOMContentLoaded', () => {
    isDomReady = true;
    clearForm();
    pendingMessages.forEach(message => handleMessage({ data: message }));
    pendingMessages = [];
    });

    window.addEventListener('message', handleMessage);

    // Dynamic font size
    function adjustFontSize() {
    const size = window.innerWidth < 400 ? 14 : window.innerWidth < 600 ? 15 : 16;
    document.documentElement.style.fontSize = `${size}px`;
    }
    adjustFontSize();
    window.addEventListener('resize', adjustFontSize);
})();