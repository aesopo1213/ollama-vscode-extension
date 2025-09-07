class StreamMarkdownParser {
    constructor(targetElement, options = {}) {
        this.targetElement = targetElement;
        this.buffer = '';
        this.currentLine = '';
        this.mode = options.mode || 'realtime';
        this.virtualDom = this.targetElement.cloneNode(true); // Sync initial state
        this.markdownParser = new window.CustomMarkdownParser();
        this.inCodeBlock = false;
        this.codeBlockLang = '';
        this.codeBlockContent = '';
        this.partialCodeBlockId = null;
        this.pendingChunks = '';
        this.debounceTimeout = null;
        this.debounceDelay = 100;
        this.diffDOM = new window.diffDOM.DiffDOM({ valueDiffing: true, simplifiedElementCheck: true });
    }

    debounce(func, delay) {
        return (...args) => {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    processStream(char) {
        this.buffer += char;
        this.currentLine += char;
        this.pendingChunks += char;

        if (this.mode === 'realtime') {
            this.debounceUpdate();
        } else if (char === '\n') {
            this.updateLineByLine();
            this.currentLine = '';
        }
    }

    debounceUpdate = this.debounce(() => {
        this.updateRealtime(this.pendingChunks);
        this.pendingChunks = '';
    }, this.debounceDelay);

    updateRealtime(content) {
        try {
            let html = this.markdownParser.parse(this.buffer);
            if (!html) {
                console.warn('Parsed HTML is empty');
                return;
            }

            const newVirtualDom = document.createElement('div');
            newVirtualDom.classList.add('message-content')
            newVirtualDom.innerHTML = html;

            console.log('this.virtualDom:', this.virtualDom.innerHTML);
            console.log('newVirtualDom:', newVirtualDom.innerHTML);

            const patches = this.diffDOM.diff(this.virtualDom, newVirtualDom);
            console.log('[Webview Parser] Applying patches:', patches);
            this.diffDOM.apply(this.targetElement, patches);

            console.log('targetElement after patches:', this.targetElement.innerHTML);
            this.virtualDom.innerHTML = this.targetElement.innerHTML;

        } catch (e) {
            console.error(`[Webview Parser] Realtime update error: ${e}`);
            this.targetElement.innerHTML = this.markdownParser.escapeHtml(this.buffer);
            this.virtualDom.innerHTML = this.targetElement.innerHTML;
        }
    }

    updateLineByLine() {
        if (this.currentLine.trim()) {
            try {
                let parsedLine = this.currentLine;
                if (this.inCodeBlock) {
                    if (parsedLine.trim() === '```') {
                        this.inCodeBlock = false;
                        const key = `code-block-${this.codeBlockLang}-${this.markdownParser.codeBlockCounter++}`;
                        parsedLine = `<div class="code-block" data-key="${key}"><span class="code-language">${this.markdownParser.escapeHtml(this.codeBlockLang)}</span><pre><code>${this.markdownParser.escapeHtml(this.codeBlockContent)}</code><button class="copy-code-button" aria-label="Copy code block" role="button">Copy</button></pre></div>`;
                        this.codeBlockContent = '';
                        this.partialCodeBlockId = null;
                    } else {
                        this.codeBlockContent += parsedLine;
                        parsedLine = '';
                    }
                } else if (parsedLine.match(/^```(\w+)?$/)) {
                    this.inCodeBlock = true;
                    this.codeBlockLang = parsedLine.match(/^```(\w+)?$/)[1] || 'text';
                    this.codeBlockContent = '';
                    this.partialCodeBlockId = `partial-code-block-${Math.random().toString(36).substring(7)}`;
                    parsedLine = '';
                } else {
                    parsedLine = this.markdownParser.parse(parsedLine);
                }

                if (parsedLine) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = parsedLine;
                    const newVirtualDom = document.createElement('div');
                    newVirtualDom.classList.add('message-content')
                    Array.from(this.virtualDom.childNodes).forEach(node => newVirtualDom.appendChild(node.cloneNode(true)));
                    Array.from(tempDiv.childNodes).forEach(child => newVirtualDom.appendChild(child.cloneNode(true)));

                    const patches = this.diffDOM.diff(this.virtualDom, newVirtualDom);
                    this.diffDOM.apply(this.targetElement, patches);
                    this.virtualDom.innerHTML = this.targetElement.innerHTML;
                }
            } catch (e) {
                console.error(`[Webview Parser] Line-by-line update error: ${e}`);
            }
        }
    }

    reset() {
        this.buffer = '';
        this.currentLine = '';
        this.inCodeBlock = false;
        this.codeBlockLang = '';
        this.codeBlockContent = '';
        this.partialCodeBlockId = null;
        this.pendingChunks = '';
        clearTimeout(this.debounceTimeout);
        this.virtualDom.innerHTML = '';
        while (this.targetElement.firstChild) {
            this.targetElement.removeChild(this.targetElement.firstChild);
        }
    }

    setMode(mode) {
        if (mode !== 'realtime' && mode !== 'line') {
            throw new Error('Invalid mode. Use "realtime" or "line"');
        }
        this.mode = mode;
        this.reset();
    }
}

window.StreamMarkdownParser = StreamMarkdownParser;