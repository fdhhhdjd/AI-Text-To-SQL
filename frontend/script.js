// ==================================================
// CONFIGURATION
// ==================================================
const API_BASE_URL = 'http://localhost:8000';
const MAX_HISTORY_ITEMS = 20;
const STORAGE_KEY = 'sql_assistant_history';

// ==================================================
// STATE MANAGEMENT
// ==================================================
class AppState {
    constructor() {
        this.history = this.loadHistory();
        this.currentView = 'table';
        this.theme = localStorage.getItem('theme') || 'light';
        this.isProcessing = false;
        this.dbInfo = null;
    }

    loadHistory() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    }

    saveHistory() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
        updateHistoryUI();
    }

    addToHistory(question, sql, result, executionTime) {
        const item = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            question,
            sql: sql || null,
            resultPreview: result ? String(result).slice(0, 200) : null,
            executionTime
        };

        this.history.unshift(item);
        this.history = this.history.slice(0, MAX_HISTORY_ITEMS);
        this.saveHistory();
    }

    clearHistory() {
        if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử?')) return;
        this.history = [];
        this.saveHistory();
        showNotification('Đã xóa lịch sử', 'success');
    }
}

const state = new AppState();

// ==================================================
// INITIALIZATION
// ==================================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEvents();
    loadDatabaseInfo();
    updateHistoryUI();
    document.getElementById('questionInput')?.focus();
});

// ==================================================
// THEME
// ==================================================
function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const icon = document.querySelector('#themeToggle i');
    if (icon) {
        icon.className = state.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', state.theme);
    initTheme();
    showNotification(
        `Đã chuyển sang giao diện ${state.theme === 'dark' ? 'tối' : 'sáng'}`,
        'info'
    );
}

// ==================================================
// DATABASE INFO FUNCTIONS
// ==================================================
async function loadDatabaseInfo() {
    const dbInfoContent = document.getElementById('dbInfoContent');
    if (!dbInfoContent) return;
    
    try {
        const res = await axios.get(`${API_BASE_URL}/api/health`);
        const data = res.data;
        state.dbInfo = data;
        
        // Update status indicators in footer
        updateStatus('apiStatus', true);
        updateStatus('dbStatus', data.database?.connected || false);
        
        // Update database info card
        let html = '';
        
        if (data.database?.connected) {
            html = `
                <div class="db-info-grid">
                    <div class="db-info-item">
                        <span class="db-info-label"><i class="fas fa-plug"></i> Status:</span>
                        <span class="db-info-value success">Connected</span>
                    </div>
                    <div class="db-info-item">
                        <span class="db-info-label"><i class="fas fa-table"></i> Schema:</span>
                        <span class="db-info-value">${data.database.schema_available ? 'Available' : 'Not Available'}</span>
                    </div>
                    <div class="db-info-item">
                        <span class="db-info-label"><i class="fas fa-robot"></i> AI Model:</span>
                        <span class="db-info-value">${data.ai_model ? data.ai_model.split('/').pop() : 'N/A'}</span>
                    </div>
                    <div class="db-info-item">
                        <span class="db-info-label"><i class="fas fa-clock"></i> Timestamp:</span>
                        <span class="db-info-value">${new Date(data.timestamp * 1000).toLocaleTimeString()}</span>
                    </div>
                </div>
                <div class="db-info-actions">
                    <button onclick="viewSchema()" class="btn-schema">
                        <i class="fas fa-database"></i> View Schema
                    </button>
                    <button onclick="testConnection()" class="btn-test">
                        <i class="fas fa-bolt"></i> Test Connection
                    </button>
                </div>
            `;
        } else {
            html = `
                <div class="db-info-grid">
                    <div class="db-info-item">
                        <span class="db-info-label"><i class="fas fa-plug"></i> Status:</span>
                        <span class="db-info-value error">Disconnected</span>
                    </div>
                    <div class="db-info-item">
                        <span class="db-info-label"><i class="fas fa-exclamation-triangle"></i> Error:</span>
                        <span class="db-info-value">Cannot connect to database</span>
                    </div>
                </div>
                <div class="db-info-actions">
                    <button onclick="loadDatabaseInfo()" class="btn-schema">
                        <i class="fas fa-sync-alt"></i> Retry Connection
                    </button>
                </div>
            `;
        }
        
        dbInfoContent.innerHTML = html;
        
    } catch (err) {
        updateStatus('apiStatus', false);
        updateStatus('dbStatus', false);
        
        dbInfoContent.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Cannot connect to API</p>
                <small>${err.message}</small>
            </div>
            <div class="db-info-actions">
                <button onclick="loadDatabaseInfo()" class="btn-schema">
                    <i class="fas fa-sync-alt"></i> Retry Connection
                </button>
            </div>
        `;
    }
}

async function viewSchema() {
    try {
        const res = await axios.get(`${API_BASE_URL}/api/schema`);
        const data = res.data;
        
        // Show schema in SQL output area
        document.getElementById('sqlOutput').textContent = `-- Database Schema\n\n${data.schema}`;
        showNotification('Database schema loaded successfully', 'success');
    } catch (err) {
        showNotification(`Error loading schema: ${err.message}`, 'danger');
    }
}

async function testConnection() {
    try {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        btn.disabled = true;
        
        const startTime = Date.now();
        const res = await axios.get(`${API_BASE_URL}/api/health`);
        const endTime = Date.now();
        
        const pingTime = endTime - startTime;
        
        if (res.data.database?.connected) {
            showNotification(`✅ Connection test successful! (${pingTime}ms)`, 'success');
        } else {
            showNotification('❌ Database connection failed', 'danger');
        }
        
        // Reload database info
        await loadDatabaseInfo();
        
    } catch (err) {
        showNotification(`Connection test failed: ${err.message}`, 'danger');
    }
}

// ==================================================
// MODAL FUNCTIONS
// ==================================================
function showDbInfoModal() {
    const modal = document.getElementById('dbInfoModal');
    modal.classList.add('show');
    
    // Load database info into modal
    loadModalDbInfo();
}

async function loadModalDbInfo() {
    const modalContent = document.getElementById('modalDbInfo');
    
    try {
        const res = await axios.get(`${API_BASE_URL}/api/health`);
        const data = res.data;
        
        modalContent.innerHTML = `
            <div class="modal-db-info">
                <div class="info-grid">
                    <div class="info-item">
                        <label><i class="fas fa-server"></i> API Status</label>
                        <span class="status ${data.status === 'online' ? 'success' : 'error'}">
                            ${data.status}
                        </span>
                    </div>
                    <div class="info-item">
                        <label><i class="fas fa-database"></i> Database</label>
                        <span class="status ${data.database?.connected ? 'success' : 'error'}">
                            ${data.database?.connected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                    <div class="info-item">
                        <label><i class="fas fa-robot"></i> AI Model</label>
                        <span>${data.ai_model || 'Not Available'}</span>
                    </div>
                    <div class="info-item">
                        <label><i class="fas fa-table"></i> Tables Available</label>
                        <span>${data.database?.schema_available ? 'Yes' : 'No'}</span>
                    </div>
                </div>
                ${data.database?.connected ? `
                <div class="modal-actions">
                    <button onclick="viewFullSchema()" class="btn-primary">
                        <i class="fas fa-code"></i> View Full Schema
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    } catch (err) {
        modalContent.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Cannot load database information</p>
                <small>${err.message}</small>
            </div>
        `;
    }
}

function initModalEvents() {
    // Close modal when clicking X
    document.querySelector('.close-modal')?.addEventListener('click', closeModal);
    
    // Close modal when clicking outside
    document.getElementById('dbInfoModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('dbInfoModal')) {
            closeModal();
        }
    });
    
    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

async function viewFullSchema() {
    try {
        const res = await axios.get(`${API_BASE_URL}/api/schema`);
        const modalContent = document.getElementById('modalDbInfo');
        
        modalContent.innerHTML = `
            <div class="modal-full-schema">
                <div class="schema-header">
                    <h4><i class="fas fa-database"></i> Complete Database Schema</h4>
                    <button onclick="copyToClipboard(document.getElementById('fullSchemaText').innerText)" class="btn-icon">
                        <i class="far fa-copy"></i>
                    </button>
                </div>
                <pre id="fullSchemaText">${res.data.schema}</pre>
                <div class="schema-stats">
                    <span><i class="fas fa-table"></i> ${res.data.tables} tables found</span>
                </div>
            </div>
        `;
        
        showNotification('Full schema loaded', 'info');
    } catch (err) {
        showNotification(`Error: ${err.message}`, 'danger');
    }
}

function closeModal() {
    const modal = document.getElementById('dbInfoModal');
    modal.classList.remove('show');
}

// ==================================================
// QUERY PROCESSING
// ==================================================
async function processQuery(isAdvanced = false) {
    const input = document.getElementById('questionInput');
    const question = input.value.trim();

    if (!question) {
        showNotification('Please enter a question', 'warning');
        input.focus();
        return;
    }

    if (state.isProcessing) {
        showNotification('Processing previous query', 'warning');
        return;
    }

    resetResultUI();

    state.isProcessing = true;
    const btn = document.getElementById('sendQuery');
    const oldText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    try {
        const endpoint = '/api/query';
        const payload = { question };

        const res = await axios.post(`${API_BASE_URL}${endpoint}`, payload);
        const data = res.data;

        if (!data.success) {
            throw new Error(data.error || 'Query failed');
        }

        renderQueryResult(data);
        state.addToHistory(
            question,
            data.sql_query,
            data.result,
            data.execution_time
        );

        updateStats(data.execution_time, true);
        showNotification('Query executed successfully', 'success');

    } catch (err) {
        const msg = err.response?.data?.error || err.response?.data?.detail || err.message;
        renderError(msg);
        updateStats(0, false, msg);
        showNotification(`Error: ${msg}`, 'danger');
    } finally {
        state.isProcessing = false;
        btn.innerHTML = oldText;
        btn.disabled = false;
        input.focus();
    }
}

// ==================================================
// RENDER RESULTS
// ==================================================
function renderQueryResult(data) {
    document.getElementById('sqlOutput').textContent = data.sql_query;
    
    // Check if result is an array
    if (Array.isArray(data.result)) {
        if (data.result.length === 0) {
            document.getElementById('jsonOutput').textContent = JSON.stringify({ message: "No results found" }, null, 2);
        } else {
            document.getElementById('jsonOutput').textContent = JSON.stringify(data.result, null, 2);
            
            // Also render as table
            renderTableFromArray(data.result);
        }
    } else if (typeof data.result === 'string') {
        document.getElementById('jsonOutput').textContent = data.result;
        renderTableFromString(data.result);
    } else {
        document.getElementById('jsonOutput').textContent = JSON.stringify(data.result, null, 2);
    }
    
    // Show explanation if checkbox is checked
    if (document.getElementById('explainCheckbox').checked && data.sql_query) {
        document.getElementById('explanationContent').innerHTML = `
            <div class="explanation-section">
                <div class="explanation-title">
                    <i class="fas fa-lightbulb"></i> SQL Explanation
                </div>
                <div class="explanation-text">
                    This query ${data.sql_query.toLowerCase().includes('select') ? 'selects data from the database' : ''}
                    ${data.sql_query.toLowerCase().includes('where') ? 'with specific conditions' : ''}
                    ${data.sql_query.toLowerCase().includes('order by') ? 'sorted by certain columns' : ''}.
                    ${data.result && data.result.length ? `Found ${data.result.length} record(s).` : ''}
                </div>
            </div>
        `;
    }
}

function renderTableFromArray(result) {
    if (!result || result.length === 0) return;
    
    const headers = Object.keys(result[0]);
    const body = document.getElementById('tableBody');
    const head = document.getElementById('tableHeaders');
    
    head.innerHTML = '';
    body.innerHTML = '';
    
    // Create headers
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        head.appendChild(th);
    });
    
    // Create rows (limit to 100 for performance)
    result.slice(0, 100).forEach(row => {
        const tr = document.createElement('tr');
        headers.forEach(header => {
            const td = document.createElement('td');
            const value = row[header];
            td.textContent = value === null ? 'NULL' : String(value);
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });
    
    // Show table view
    showTableView();
    
    // Update result count
    if (result.length > 100) {
        document.getElementById('jsonOutput').textContent += `\n\n// Note: Showing first 100 of ${result.length} records`;
    }
}

function renderTableFromString(result) {
    const rows = result.split('\n').filter(Boolean);
    if (rows.length === 0) return;

    const headers = rows[0].split('|').map(h => h.trim());
    const body = document.getElementById('tableBody');
    const head = document.getElementById('tableHeaders');

    head.innerHTML = '';
    body.innerHTML = '';

    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        head.appendChild(th);
    });

    rows.slice(1, 101).forEach(row => {
        const tr = document.createElement('tr');
        row.split('|').forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell.trim();
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });

    showTableView();
}

function showTableView() {
    document.getElementById('resultsTable').style.display = 'block';
    document.getElementById('resultsJson').style.display = 'none';
    state.currentView = 'table';
}

function showJsonView() {
    document.getElementById('resultsTable').style.display = 'none';
    document.getElementById('resultsJson').style.display = 'block';
    state.currentView = 'json';
}

function renderError(message) {
    document.getElementById('sqlOutput').textContent = `-- Error: ${message}`;
    document.getElementById('explanationContent').innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
        </div>
    `;
}

// ==================================================
// STATS & STATUS
// ==================================================
function updateStats(executionTime, success, error = null) {
    const time = Number(executionTime) || 0;
    document.getElementById('executionTime').textContent = `${time.toFixed(3)}s`;
    const status = document.getElementById('queryStatus');
    status.textContent = success ? 'Success' : 'Failed';
    status.style.color = success ? 'var(--success)' : 'var(--danger)';
    if (error) status.title = error;
}

function updateStatus(id, connected) {
    const el = document.getElementById(id);
    if (!el) return;
    
    const dot = el.querySelector('.status-dot');
    const text = connected ? 'Connected' : 'Disconnected';
    
    if (dot) {
        dot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
    }
    
    el.innerHTML = `<span class="status-dot ${connected ? 'connected' : 'disconnected'}"></span> ${id === 'apiStatus' ? 'API' : 'Database'}: ${text}`;
}

// ==================================================
// HISTORY
// ==================================================
function updateHistoryUI() {
    const list = document.getElementById('historyList');
    const count = document.getElementById('historyCount');
    count.textContent = state.history.length;

    if (!state.history.length) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-history fa-2x"></i><p>Your query history will appear here</p></div>';
        return;
    }

    list.innerHTML = state.history.map(item => `
        <div class="history-item" onclick="loadHistoryItem('${item.id}')">
            <div class="history-header">
                <span class="history-time">${new Date(item.timestamp).toLocaleTimeString()}</span>
                <span class="history-status ${item.executionTime ? 'success' : 'error'}">
                    ${item.executionTime ? '✓' : '✗'}
                </span>
            </div>
            <div class="history-question" title="${item.question}">${item.question}</div>
            <div class="history-sql" title="${item.sql || ''}">${item.sql ? item.sql.substring(0, 80) + (item.sql.length > 80 ? '...' : '') : '--'}</div>
        </div>
    `).join('');
}

function loadHistoryItem(id) {
    const item = state.history.find(h => h.id === id);
    if (!item) return;
    document.getElementById('questionInput').value = item.question;
    showNotification('Question loaded from history', 'info');
}

// ==================================================
// UTILITIES
// ==================================================
function resetResultUI() {
    document.getElementById('sqlOutput').textContent = '-- Generating SQL...';
    document.getElementById('tableBody').innerHTML = '';
    document.getElementById('jsonOutput').textContent = '{}';
    document.getElementById('explanationContent').innerHTML = `
        <div class="empty-state">
            <i class="fas fa-info-circle fa-2x"></i>
            <p>Enable "Explain SQL" to see breakdown of generated queries</p>
        </div>
    `;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => showNotification('Copied to clipboard', 'success'))
        .catch(() => showNotification('Failed to copy', 'danger'));
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification');
    existing.forEach(n => n.remove());
    
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(n);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (n.parentNode) n.remove();
    }, 3000);
}

function toggleView() {
    if (state.currentView === 'table') {
        showJsonView();
    } else {
        showTableView();
    }
}

// ==================================================
// EVENTS
// ==================================================
function initEvents() {
    // Theme toggle
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    
    // Query buttons
    document.getElementById('sendQuery')?.addEventListener('click', () => processQuery(false));
    document.getElementById('advancedQuery')?.addEventListener('click', () => processQuery(true));
    
    // Clear history
    document.getElementById('clearHistory')?.addEventListener('click', () => state.clearHistory());
    
    // Database info
    document.getElementById('dbInfoBtn')?.addEventListener('click', showDbInfoModal);
      // Initialize modal events
    initModalEvents();
    document.getElementById('refreshDbInfo')?.addEventListener('click', loadDatabaseInfo);
    
    // Close modal
    document.querySelector('.close-modal')?.addEventListener('click', closeModal);
    document.getElementById('dbInfoModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('dbInfoModal')) {
            closeModal();
        }
    });
    
    // Copy SQL
    document.getElementById('copySql')?.addEventListener('click', () => {
        const sql = document.getElementById('sqlOutput').textContent;
        copyToClipboard(sql);
    });
    
    // Toggle view
    document.getElementById('toggleView')?.addEventListener('click', toggleView);
    
    // Export CSV
    document.getElementById('exportCsv')?.addEventListener('click', () => {
        showNotification('Export feature coming soon!', 'info');
    });
    
    // Enter key in textarea
    document.getElementById('questionInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            processQuery(false);
        }
    });
    
    // Auto-refresh database info every 60 seconds
    setInterval(loadDatabaseInfo, 60000);
}