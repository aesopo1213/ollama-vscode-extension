(function () {
    class CustomMarkdownParser {
        constructor() {
            this.rules = [
                { pattern: /^#{1,6}\s+(.+)$/gm, replace: this.parseHeaders.bind(this) },
                { pattern: /\*\*(.+?)\*\*/g, replace: '<strong>$1</strong>' },
                { pattern: /\*(.+?)\*/g, replace: '<em>$1</em>' },
                { pattern: /~~(.+?)~~/g, replace: '<del>$1</del>' },
                { pattern: /!\[([^\]]*)\]\(([^)]+)\)/g, replace: '<img src="$2" alt="$1" class="markdown-image">' },
                { pattern: /\[([^\]]*)\]\(([^)]+)\)/g, replace: '<a href="$2" class="markdown-link">$1</a>' },
                { pattern: /`([^`]+)`/g, replace: '<code class="inline-code">$1</code>' },
                { pattern: /^\s*-\s+(.+)\n?/gm, replace: '<li>$1</li>' }, // Updated for unordered lists
                { pattern: /(?:<li>.+<\/li>)+/g, replace: '<ul>$&</ul>' }, // Updated for <ul>
                { pattern: /^\s*\d+\.\s+(.+)\n?/gm, replace: '<li>$1</li>' }, // Updated for ordered lists
                { pattern: /(?:<li>.+<\/li>)+/g, replace: '<ol>$&</ol>' }, // Updated for <ol>
                { pattern: /^> (.+)$/gm, replace: '<blockquote>$1</blockquote>' },
                { pattern: /^\s*\|(.+)\|\s*$/gm, replace: this.parseTableRow.bind(this) },
                { pattern: /(?:<tr>.+<\/tr>\n?)+/g, replace: '<table>$&</table>' },
                { pattern: /^-{3,}$/gm, replace: '<hr>' },
                { pattern: /^(.+)$/gm, replace: this.wrapParagraph.bind(this) }
            ];
            this.codeBlockRules = [
                { pattern: /^```(\w+)?\n([\s\S]*?)\n```$/gm, replace: this.parseCodeBlock.bind(this) },
                { pattern: /^```(\w+)?\n([\s\S]*)$/gm, replace: this.parseCodeBlock.bind(this) }
            ];
            this.codeBlockCounter = 0;
        }

        parse(text) {
            if (!text) return '';
            
            let codeBlocks = [];
            let placeholderText = text;
            let placeholderIndex = 0;

            this.codeBlockRules.forEach(rule => {
                placeholderText = placeholderText.replace(rule.pattern, (match, lang, code) => {
                    const placeholder = `{{CODE_BLOCK_${placeholderIndex}}}`;
                    codeBlocks.push({ lang, code, placeholder });
                    placeholderIndex++;
                    return placeholder;
                });
            });

            let result = this.escapeHtml(placeholderText);

            this.rules.forEach(rule => {
                result = result.replace(rule.pattern, rule.replace);
            });

            codeBlocks.forEach(block => {
                const html = this.parseCodeBlock(null, block.lang, block.code);
                result = result.replace(block.placeholder, html);
            });

            result = result.replace(/^\s*<\/p>|<p>\s*$/g, '');
            console.log("result", result)
            return `<p>${result}</p>`;
        }

        escapeHtml(text) {
            const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '\'' };
            return text.replace(/[&<>"']/g, m => map[m]);
        }

        parseHeaders(match, content) {
            const level = match.match(/^#+/)[0].length;
            return `<h${level}>${content.trim()}</h${level}>`;
        }

        parseCodeBlock(match, lang, code) {
            const language = lang || 'text';
            const key = `code-block-${language}-${this.codeBlockCounter++}`;
            return `<div class="code-block" data-key="${key}"><span class="code-language">${this.escapeHtml(language)}</span><pre><code>${this.escapeHtml(code)}</code><button class="copy-code-button" aria-label="Copy code block" role="button">Copy</button></pre></div>`;
        }

        parseTableRow(match, row) {
            const cells = row.split('|').map(cell => cell.trim()).filter(cell => cell);
            const isHeader = cells.every(cell => /^[-:]+$/.test(cell));
            const tag = isHeader ? 'th' : 'td';
            const rowContent = cells.map(cell => `<${tag}>${cell}</${tag}>`).join('');
            return `<tr>${rowContent}</tr>`;
        }

        wrapParagraph(match, content) {
            if (content.match(/^<(h[1-6]|ul|ol|blockquote|table|hr|div)/)) {
                return content;
            }
            return content;
        }
    }

    window.CustomMarkdownParser = CustomMarkdownParser;
})();
