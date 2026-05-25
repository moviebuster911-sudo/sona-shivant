const chatFile = document.getElementById('chatFile');
const pasteText = document.getElementById('pasteText');
const driveLinkInput = document.getElementById('driveLink');
const parseBtn = document.getElementById('parseBtn');
const clearBtn = document.getElementById('clearBtn');
const errorMessage = document.getElementById('errorMessage');
const authorSelectContainer = document.getElementById('authorSelectContainer');
const authorSelect = document.getElementById('authorSelect');
const chatFrame = document.getElementById('chatFrame');
const chatContainer = document.getElementById('chatContainer');
const chatSummary = document.getElementById('chatSummary');
const swapBtn = document.getElementById('swapBtn');
const contactName = document.getElementById('contactName');
const contactStatus = document.getElementById('contactStatus');
const messageInput = document.getElementById('messageInput');

// Search elements
const searchHeaderBtn = document.getElementById('searchHeaderBtn');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const searchCloseBtn = document.getElementById('searchCloseBtn');
const searchResultsInfo = document.getElementById('searchResultsInfo');
const searchPrevBtn = document.getElementById('searchPrevBtn');
const searchNextBtn = document.getElementById('searchNextBtn');

let currentMessages = [];
let currentUsers = [];
let activeUser = null;
let swapped = false;

// Initialize search handler
let searchHandler = null;

const messagePattern = /^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4},?\s\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?)\s-\s([^:]+):\s(.*)$/;

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function parseChat(text) {
    const lines = text.split(/\r?\n/);
    const messages = [];
    let current = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const match = line.match(messagePattern);
        if (match) {
            if (current) messages.push(current);
            current = {
                datetime: match[1],
                author: match[2].trim(),
                text: match[3].trim(),
                isEdited: /<This message was edited>|\(edited\)/i.test(match[3]),
            };
        } else if (current) {
            current.text += '\n' + rawLine;
            if (/edited/i.test(rawLine)) {
                current.isEdited = true;
            }
        }
    }
    if (current) messages.push(current);
    return messages;
}

function buildAuthorList(messages) {
    const authors = [];
    for (const msg of messages) {
        if (!authors.includes(msg.author)) {
            authors.push(msg.author);
        }
    }
    return authors;
}

/**
 * WhatsApp-style Message Search Handler
 */
class MessageSearchHandler {
    constructor(options = {}) {
        this.options = {
            debounceDelay: 200,
            scrollBehavior: 'smooth',
            highlightClass: 'search-highlight',
            currentHighlightClass: 'current',
            ...options
        };

        this.state = {
            query: '',
            results: [],
            messageResults: [],
            currentIndex: 0,
            isActive: false,
        };

        this.elements = {
            searchBtn: null,
            searchBar: null,
            searchInput: null,
            searchCloseBtn: null,
            searchResultsInfo: null,
            searchPrevBtn: null,
            searchNextBtn: null,
            searchEmptyState: null,
            searchEmptyStateText: null,
            chatContainer: null
        };

        this.messages = [];
        this.debounceTimer = null;
        this.isInitialized = false;
    }

    init(elements) {
        this.elements = { ...this.elements, ...elements };
        this.attachEventListeners();
        this.isInitialized = true;
    }

    setMessages(messages) {
        this.messages = messages || [];
    }

    attachEventListeners() {
        const { searchBtn, searchInput, searchCloseBtn, searchPrevBtn, searchNextBtn } = this.elements;

        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.openSearch());
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.navigateNext();
                }
            });
        }

        if (searchCloseBtn) {
            searchCloseBtn.addEventListener('click', () => this.closeSearch());
        }

        if (searchPrevBtn) {
            searchPrevBtn.addEventListener('click', () => this.navigatePrev());
        }

        if (searchNextBtn) {
            searchNextBtn.addEventListener('click', () => this.navigateNext());
        }
    }

    openSearch() {
        if (!this.elements.searchBar) return;
        this.elements.searchBar.classList.remove('hidden');
        this.state.isActive = true;
        if (this.elements.searchInput) {
            this.elements.searchInput.value = this.state.query;
            this.elements.searchInput.focus();
        }
    }

    closeSearch() {
        if (!this.elements.searchBar) return;
        this.elements.searchBar.classList.add('hidden');
        this.state.isActive = false;
        this.clearSearch();
    }

    handleSearchInput(value) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.performSearch(value);
        }, this.options.debounceDelay);
    }

    normalizeQuery(query) {
        return query.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    createNormalizedIndexMap(text) {
        const map = [];
        let normalized = '';
        let lastWasSpace = false;

        for (let i = 0; i < text.length; i += 1) {
            const char = text[i];
            if (/\s/.test(char)) {
                if (!lastWasSpace) {
                    normalized += ' ';
                    map.push(i);
                    lastWasSpace = true;
                }
            } else {
                normalized += char.toLowerCase();
                map.push(i);
                lastWasSpace = false;
            }
        }

        return { normalized, map };
    }

    getMatchRanges(text, query) {
        const normalizedQuery = this.normalizeQuery(query);
        if (!normalizedQuery || !text) return [];

        const { normalized, map } = this.createNormalizedIndexMap(text);
        const ranges = [];
        let searchIndex = 0;

        while (searchIndex < normalized.length) {
            const foundIndex = normalized.indexOf(normalizedQuery, searchIndex);
            if (foundIndex === -1) break;

            const start = map[foundIndex];
            const end = map[foundIndex + normalizedQuery.length - 1] + 1;
            ranges.push({ start, end });
            searchIndex = foundIndex + 1;
        }

        return ranges;
    }

    performSearch(query) {
        this.state.query = this.normalizeQuery(query.toString());
        if (!this.state.query) {
            this.clearSearch();
            return;
        }

        this.state.results = [];
        this.state.messageResults = [];
        this.state.currentIndex = 0;

        this.messages.forEach((msg, messageIndex) => {
            const ranges = this.getMatchRanges(msg.text, this.state.query);
            if (!ranges.length) return;

            const messageElement = this.elements.chatContainer?.children[messageIndex] || null;
            const textElement = messageElement?.querySelector('.text') || null;
            const matches = ranges.map((range, matchIndex) => ({
                messageIndex,
                messageElement,
                textElement,
                range,
                matchIndexInMessage: matchIndex
            }));

            this.state.messageResults.push({
                messageIndex,
                messageElement,
                textElement,
                ranges,
                matches
            });
            this.state.results.push(...matches);
        });

        if (this.state.currentIndex >= this.state.results.length) {
            this.state.currentIndex = 0;
        }

        this.updateSearchUI();
        this.applyHighlights();
        this.scrollToCurrentResult();
    }

    updateSearchUI() {
        const { searchResultsInfo, searchPrevBtn, searchNextBtn, searchEmptyState, searchEmptyStateText } = this.elements;
        const totalMatches = this.state.results.length;
        const totalMessages = this.state.messageResults.length;

        if (searchResultsInfo) {
            if (!this.state.query) {
                searchResultsInfo.textContent = '';
            } else if (totalMatches === 0) {
                searchResultsInfo.textContent = `No messages found for '${this.state.query}'`;
            } else {
                searchResultsInfo.textContent = `${this.state.currentIndex + 1}/${totalMatches} result${totalMatches === 1 ? '' : 's'} in ${totalMessages} message${totalMessages === 1 ? '' : 's'}`;
            }
        }

        if (searchPrevBtn) searchPrevBtn.disabled = totalMatches === 0;
        if (searchNextBtn) searchNextBtn.disabled = totalMatches === 0;

        if (searchEmptyState) {
            if (this.state.query && totalMatches === 0) {
                searchEmptyState.classList.remove('hidden');
                if (searchEmptyStateText) {
                    searchEmptyStateText.textContent = `No messages found for '${this.state.query}'`;
                }
            } else {
                searchEmptyState.classList.add('hidden');
            }
        }
    }

    applyHighlights() {
        this.clearHighlights();

        if (this.state.results.length === 0) {
            return;
        }

        const allMessages = this.elements.chatContainer?.querySelectorAll('.message') || [];
        allMessages.forEach((msgEl) => msgEl.classList.add('search-dimmed'));

        this.state.messageResults.forEach((messageResult) => {
            const { messageElement, textElement, ranges } = messageResult;
            if (!messageElement || !textElement) return;

            const currentMessageIndex = this.state.results[this.state.currentIndex]?.messageIndex;
            const isCurrentMessage = currentMessageIndex === messageResult.messageIndex;
            const currentMatchInMessage = isCurrentMessage ? this.state.results[this.state.currentIndex].matchIndexInMessage : -1;

            messageElement.classList.remove('search-dimmed');
            messageElement.classList.add('search-match');
            messageElement.classList.toggle('search-current', isCurrentMessage);
            textElement.innerHTML = this.buildMessageHighlightHtml(textElement.textContent || '', ranges, currentMatchInMessage);
        });
    }

    buildMessageHighlightHtml(rawText, ranges, currentMatchIndex) {
        if (!ranges.length) {
            return escapeHtml(rawText).replace(/\n/g, '<br>');
        }

        let html = '';
        let lastIndex = 0;

        ranges.forEach((range, index) => {
            html += escapeHtml(rawText.slice(lastIndex, range.start)).replace(/\n/g, '<br>');

            const matchedText = rawText.slice(range.start, range.end);
            const classes = ['search-highlight'];
            if (index === currentMatchIndex) {
                classes.push('current');
            }
            html += `<span class="${classes.join(' ')}">${escapeHtml(matchedText).replace(/\n/g, '<br>')}</span>`;
            lastIndex = range.end;
        });

        html += escapeHtml(rawText.slice(lastIndex)).replace(/\n/g, '<br>');
        return html;
    }

    clearHighlights() {
        const allMessages = this.elements.chatContainer?.querySelectorAll('.message') || [];
        allMessages.forEach((msgEl) => {
            msgEl.classList.remove('search-dimmed', 'search-match', 'search-current');
            const textEl = msgEl.querySelector('.text');
            if (textEl) {
                const originalIndex = Number(msgEl.dataset.messageIndex);
                const originalText = this.messages[originalIndex]?.text;
                if (typeof originalText === 'string') {
                    textEl.innerHTML = escapeHtml(originalText).replace(/\n/g, '<br>');
                }
            }
        });
    }

    navigatePrev() {
        if (this.state.results.length === 0) return;
        this.state.currentIndex = (this.state.currentIndex - 1 + this.state.results.length) % this.state.results.length;
        this.updateSearchUI();
        this.applyHighlights();
        this.scrollToCurrentResult();
    }

    navigateNext() {
        if (this.state.results.length === 0) return;
        this.state.currentIndex = (this.state.currentIndex + 1) % this.state.results.length;
        this.updateSearchUI();
        this.applyHighlights();
        this.scrollToCurrentResult();
    }

    scrollToCurrentResult() {
        if (this.state.results.length === 0) return;
        const currentResult = this.state.results[this.state.currentIndex];
        const messageElement = currentResult.messageElement;
        if (messageElement && this.elements.chatContainer) {
            messageElement.scrollIntoView({ behavior: this.options.scrollBehavior, block: 'center' });
        }
    }

    clearSearch() {
        this.state.query = '';
        this.state.results = [];
        this.state.messageResults = [];
        this.state.currentIndex = 0;
        this.clearHighlights();
        this.updateSearchUI();

        if (this.elements.searchInput) {
            this.elements.searchInput.value = '';
        }

        if (this.elements.searchEmptyState) {
            this.elements.searchEmptyState.classList.add('hidden');
        }
    }

    restoreSearch() {
        if (this.state.query) {
            this.performSearch(this.state.query);
        }
    }

    destroy() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.isInitialized = false;
    }
}

function renderChat(messages, user) {
    chatContainer.innerHTML = '';
    currentMessages = messages;
    activeUser = user;
    currentUsers = buildAuthorList(messages);
    authorSelectContainer.classList.toggle('hidden', currentUsers.length === 0);
    authorSelect.innerHTML = '';

    // Update contact info header
    if (user) {
        contactName.textContent = user;
        const userMessageCount = messages.filter(msg => msg.author === user).length;
        const totalMessages = messages.length;
        contactStatus.textContent = `${userMessageCount} messages · online`;
    }

    currentUsers.forEach((author, index) => {
        const option = document.createElement('option');
        option.value = author;
        option.textContent = author;
        if (author === user) option.selected = true;
        authorSelect.appendChild(option);
    });

    messages.forEach((msg, index) => {
        const isUser = swapped ? msg.author !== user : msg.author === user;
        const side = isUser ? 'right' : 'left';
        const messageEl = document.createElement('div');
        messageEl.className = `message ${side}`;
        messageEl.dataset.messageIndex = index;
        
        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        const authorEl = document.createElement('div');
        authorEl.className = 'author';
        authorEl.textContent = msg.author;

        const textEl = document.createElement('div');
        textEl.className = 'text';
        textEl.innerHTML = escapeHtml(msg.text).replace(/\n/g, '<br>');

        const timestampEl = document.createElement('div');
        timestampEl.className = 'timestamp';
        let timestampText = msg.datetime;
        if (msg.isEdited) timestampText += ' · Edited';
        
        // Add status icon for outgoing messages
        if (isUser) {
            timestampEl.innerHTML = escapeHtml(timestampText) + ' <span class="message-status">✓✓</span>';
        } else {
            timestampEl.textContent = timestampText;
        }

        bubble.appendChild(authorEl);
        bubble.appendChild(textEl);
        bubble.appendChild(timestampEl);
        messageEl.appendChild(bubble);
        chatContainer.appendChild(messageEl);
    });

    chatFrame.classList.remove('hidden');
    
    // Initialize or update search handler after rendering
    if (!searchHandler) {
        searchHandler = new MessageSearchHandler();
        searchHandler.init({
            searchBtn: searchHeaderBtn,
            searchBar: searchBar,
            searchInput: searchInput,
            searchCloseBtn: searchCloseBtn,
            searchResultsInfo: searchResultsInfo,
            searchPrevBtn: searchPrevBtn,
            searchNextBtn: searchNextBtn,
            searchEmptyState: document.getElementById('searchEmptyState'),
            searchEmptyStateText: document.getElementById('searchEmptyStateText'),
            chatContainer: chatContainer
        });
    }
    searchHandler.setMessages(messages);
    if (searchHandler.state.query) {
        searchHandler.restoreSearch();
    }

    // Auto-scroll to bottom
    setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 100);
}

function showError(message) {
    errorMessage.textContent = message;
}

function clearError() {
    errorMessage.textContent = '';
}

function processContent(content) {
    const messages = parseChat(content);
    if (messages.length === 0) {
        showError('No valid WhatsApp messages found. Please use a proper exported .txt chat file.');
        return;
    }
    const authors = buildAuthorList(messages);
    if (authors.length === 0) {
        showError('Unable to detect any authors in the chat file.');
        return;
    }
    activeUser = authors[0];
    authorSelectContainer.classList.toggle('hidden', false);
    authorSelect.innerHTML = '';
    authors.forEach((author, index) => {
        const option = document.createElement('option');
        option.value = author;
        option.textContent = author;
        if (index === 0) option.selected = true;
        authorSelect.appendChild(option);
    });
    chatSummary.textContent = `${messages.length} messages from ${authors.length} author${authors.length === 1 ? '' : 's'}.`;
    renderChat(messages, activeUser);
}

parseBtn.addEventListener('click', async () => {
    clearError();
    // Try client-side Drive fetch first (works only if Google allows CORS for the file)
    const driveLink = driveLinkInput ? driveLinkInput.value.trim() : '';
    if (driveLink) {
        try {
            parseBtn.disabled = true;
            parseBtn.textContent = 'Downloading...';

            // extract file id and build direct-download URL
            const fileId = extractDriveFileId(driveLink);
            if (!fileId) throw new Error('Invalid Google Drive share link.');
            const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

            // Attempt fetch (may fail due to Google CORS restrictions)
            const resp = await fetch(downloadUrl, { method: 'GET', mode: 'cors' });
            if (!resp.ok) {
                throw new Error(`Download failed (status ${resp.status}).`);
            }
            const text = await resp.text();

            // Quick sanity check: ensure it looks like a WhatsApp export
            const messages = parseChat(text);
            if (!messages || messages.length === 0) {
                throw new Error('Downloaded file does not contain valid WhatsApp messages.');
            }
            const users = buildAuthorList(messages);
            const firstUser = users.length ? users[0] : null;
            chatSummary.textContent = `${messages.length} messages from ${users.length} author${users.length === 1 ? '' : 's'}.`;
            renderChat(messages, firstUser);
            return;
        } catch (err) {
            // Common cause: CORS blocked by Google. Show actionable guidance.
            const msg = err.message || 'Failed to download from Google Drive.';
            showError(msg + '\nIf you see a CORS or cross-origin error, GitHub Pages (static hosting) cannot fetch the file directly from Google Drive.\n\nOptions:\n• Make the file publicly accessible\n• Use the server backend\n• Paste the file contents directly');
            parseBtn.disabled = false;
            parseBtn.textContent = 'Parse Chat';
            return;
        }
    }

    let content = pasteText.value.trim();
    if (!content && chatFile.files.length > 0) {
        const file = chatFile.files[0];
        const reader = new FileReader();
        reader.onload = () => {
            content = reader.result;
            processContent(content);
        };
        reader.onerror = () => showError('Could not read the selected text file.');
        reader.readAsText(file, 'utf-8');
        return;
    }
    if (!content) {
        showError('Please upload a WhatsApp .txt file, paste the exported text, or provide a Drive share link.');
        return;
    }
    processContent(content);
});

function extractDriveFileId(url) {
    try {
        const u = new URL(url);
        if (u.hostname.includes('drive.google.com')) {
            // /file/d/FILEID or /open?id=FILEID
            const parts = u.pathname.split('/');
            const dIndex = parts.indexOf('d');
            if (dIndex >= 0 && parts.length > dIndex + 1) return parts[dIndex + 1];
            const qs = new URLSearchParams(u.search);
            if (qs.has('id')) return qs.get('id');
        }
    } catch (e) {
        return null;
    }
    return null;
}

// Event listeners
clearBtn.addEventListener('click', () => {
    chatFile.value = '';
    pasteText.value = '';
    driveLinkInput.value = '';
    clearError();
});

authorSelect.addEventListener('change', (e) => {
    activeUser = e.target.value;
    renderChat(currentMessages, activeUser);
});

swapBtn.addEventListener('click', () => {
    swapped = !swapped;
    renderChat(currentMessages, activeUser);
    swapBtn.textContent = swapped ? 'Swap Users (Swapped)' : 'Swap Users';
});

// Prevent default behavior for composer
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
    }
});

document.querySelectorAll('.send-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Send button is just for UI - actual sending would require backend
        console.log('Send button clicked - demo only');
    });
});
