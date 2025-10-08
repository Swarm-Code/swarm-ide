/**
 * SQLiteViewer - Component for viewing and editing SQLite databases
 *
 * Provides a full-featured database viewer with:
 * - Table listing
 * - Schema viewing
 * - Data browsing with pagination
 * - Custom SQL queries
 *
 * Usage:
 *   const viewer = new SQLiteViewer(container, dbPath, sqliteService);
 */

const eventBus = require('../modules/EventBus');

class SQLiteViewer {
    constructor(container, dbPath, sqliteService) {
        this.container = container;
        this.dbPath = dbPath;
        this.sqlite = sqliteService;
        this.currentTable = null;
        this.currentPage = 0;
        this.pageSize = 100;
        this.totalRows = 0;

        this.init();
    }

    /**
     * Initialize the viewer
     */
    async init() {
        try {
            console.log('[SQLiteViewer] Initializing with database:', this.dbPath);
            this.renderLoading();
            await this.loadTables();
            this.renderUI();
        } catch (error) {
            console.error('[SQLiteViewer] Initialization error:', error);
            this.renderError(error.message);
        }
    }

    /**
     * Load tables from database
     */
    async loadTables() {
        this.tables = await this.sqlite.listTables(this.dbPath);
        console.log('[SQLiteViewer] Loaded tables:', this.tables);
    }

    /**
     * Render loading state
     */
    renderLoading() {
        this.container.innerHTML = '<div class="sqlite-loading">Loading database...</div>';
    }

    /**
     * Render error state
     * @param {string} message - Error message
     */
    renderError(message) {
        this.container.innerHTML = `
            <div class="sqlite-error">
                <h3>Database Error</h3>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
    }

    /**
     * Render main UI
     */
    renderUI() {
        this.container.innerHTML = `
            <div class="sqlite-viewer">
                <div class="sqlite-sidebar">
                    <div class="sqlite-header">
                        <div class="sqlite-header-title">DATABASE</div>
                        <div class="sqlite-db-name">${this.escapeHtml(this.getDbName())}</div>
                    </div>
                    <div class="sqlite-tables-header">
                        <span class="sqlite-tables-label">TABLES</span>
                        <span class="sqlite-tables-count">${this.tables.length}</span>
                    </div>
                    <div class="sqlite-tables-list"></div>
                </div>
                <div class="sqlite-content">
                    <div class="sqlite-content-header">
                        <span class="sqlite-table-name">Select a table</span>
                        <div class="sqlite-actions">
                            <button class="sqlite-btn sqlite-refresh-btn" title="Refresh">Refresh</button>
                        </div>
                    </div>
                    <div class="sqlite-content-body">
                        <div class="sqlite-empty-state">
                            Select a table from the sidebar to view its data
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.renderTablesList();
        this.setupEventListeners();
    }

    /**
     * Render tables list
     */
    renderTablesList() {
        const tablesList = this.container.querySelector('.sqlite-tables-list');

        if (this.tables.length === 0) {
            tablesList.innerHTML = '<div class="sqlite-empty">No tables found</div>';
            return;
        }

        tablesList.innerHTML = this.tables.map(table => `
            <div class="sqlite-table-item" data-table="${this.escapeHtml(table)}">
                <span class="sqlite-table-icon"></span>
                <span class="sqlite-table-text">${this.escapeHtml(table)}</span>
            </div>
        `).join('');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Table selection
        const tableItems = this.container.querySelectorAll('.sqlite-table-item');
        tableItems.forEach(item => {
            item.addEventListener('click', () => {
                const tableName = item.dataset.table;
                this.selectTable(tableName);
            });
        });

        // Refresh button
        const refreshBtn = this.container.querySelector('.sqlite-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (this.currentTable) {
                    this.loadTableData(this.currentTable, this.currentPage);
                }
            });
        }
    }

    /**
     * Select and display a table
     * @param {string} tableName - Table name
     */
    async selectTable(tableName) {
        try {
            console.log('[SQLiteViewer] Selecting table:', tableName);

            // Update selection UI
            const items = this.container.querySelectorAll('.sqlite-table-item');
            items.forEach(item => {
                if (item.dataset.table === tableName) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });

            this.currentTable = tableName;
            this.currentPage = 0;

            // Update header
            const headerName = this.container.querySelector('.sqlite-table-name');
            if (headerName) {
                headerName.textContent = tableName;
            }

            await this.loadTableData(tableName, 0);
        } catch (error) {
            console.error('[SQLiteViewer] Error selecting table:', error);
            this.showTableError(error.message);
        }
    }

    /**
     * Load table data
     * @param {string} tableName - Table name
     * @param {number} page - Page number
     */
    async loadTableData(tableName, page) {
        try {
            const contentBody = this.container.querySelector('.sqlite-content-body');
            contentBody.innerHTML = '<div class="sqlite-loading">Loading data...</div>';

            // Load schema and data in parallel
            const [schema, queryResult] = await Promise.all([
                this.sqlite.getTableSchema(this.dbPath, tableName),
                this.sqlite.queryTable(this.dbPath, tableName, this.pageSize, page * this.pageSize)
            ]);

            this.totalRows = queryResult.total;
            this.currentPage = page;

            this.renderTableData(schema, queryResult.data);
            this.renderPagination();
        } catch (error) {
            console.error('[SQLiteViewer] Error loading table data:', error);
            this.showTableError(error.message);
        }
    }

    /**
     * Render table data
     * @param {Array} schema - Table schema
     * @param {Array} data - Table data
     */
    renderTableData(schema, data) {
        const contentBody = this.container.querySelector('.sqlite-content-body');

        if (data.length === 0) {
            contentBody.innerHTML = '<div class="sqlite-empty-state">No data in this table</div>';
            return;
        }

        // Build table HTML
        const columns = schema.map(col => col.name);

        const tableHTML = `
            <div class="sqlite-table-wrapper">
                <table class="sqlite-data-table">
                    <thead>
                        <tr>
                            <th class="sqlite-row-num">#</th>
                            ${columns.map(col => `
                                <th>
                                    <div class="sqlite-col-header">
                                        <span class="sqlite-col-name">${this.escapeHtml(col)}</span>
                                        <span class="sqlite-col-type">${this.getColumnType(schema, col)}</span>
                                    </div>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((row, idx) => `
                            <tr>
                                <td class="sqlite-row-num">${this.currentPage * this.pageSize + idx + 1}</td>
                                ${columns.map(col => `
                                    <td title="${this.escapeHtml(String(row[col] !== null ? row[col] : 'NULL'))}">
                                        ${this.formatCellValue(row[col])}
                                    </td>
                                `).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        contentBody.innerHTML = tableHTML;
    }

    /**
     * Render pagination controls
     */
    renderPagination() {
        const contentBody = this.container.querySelector('.sqlite-content-body');
        const totalPages = Math.ceil(this.totalRows / this.pageSize);

        if (totalPages <= 1) return;

        const paginationHTML = `
            <div class="sqlite-pagination">
                <button class="sqlite-btn" ${this.currentPage === 0 ? 'disabled' : ''} data-page="first">⏮️ First</button>
                <button class="sqlite-btn" ${this.currentPage === 0 ? 'disabled' : ''} data-page="prev">◀️ Prev</button>
                <span class="sqlite-page-info">
                    Page ${this.currentPage + 1} of ${totalPages}
                    (${this.totalRows} rows)
                </span>
                <button class="sqlite-btn" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''} data-page="next">Next ▶️</button>
                <button class="sqlite-btn" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''} data-page="last">Last ⏭️</button>
            </div>
        `;

        contentBody.insertAdjacentHTML('beforeend', paginationHTML);

        // Add event listeners
        const buttons = contentBody.querySelectorAll('.sqlite-pagination button');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.page;
                let newPage = this.currentPage;

                switch (action) {
                    case 'first':
                        newPage = 0;
                        break;
                    case 'prev':
                        newPage = Math.max(0, this.currentPage - 1);
                        break;
                    case 'next':
                        newPage = Math.min(totalPages - 1, this.currentPage + 1);
                        break;
                    case 'last':
                        newPage = totalPages - 1;
                        break;
                }

                if (newPage !== this.currentPage && this.currentTable) {
                    this.loadTableData(this.currentTable, newPage);
                }
            });
        });
    }

    /**
     * Get column type from schema
     * @param {Array} schema - Table schema
     * @param {string} colName - Column name
     * @returns {string} Column type
     */
    getColumnType(schema, colName) {
        const col = schema.find(c => c.name === colName);
        return col ? col.type.toLowerCase() : '';
    }

    /**
     * Format cell value for display
     * @param {*} value - Cell value
     * @returns {string} Formatted value
     */
    formatCellValue(value) {
        if (value === null) {
            return '<span class="sqlite-null">NULL</span>';
        }

        if (typeof value === 'boolean') {
            return value ? '✓' : '✗';
        }

        const str = String(value);
        if (str.length > 100) {
            return this.escapeHtml(str.substring(0, 100)) + '...';
        }

        return this.escapeHtml(str);
    }

    /**
     * Show table error
     * @param {string} message - Error message
     */
    showTableError(message) {
        const contentBody = this.container.querySelector('.sqlite-content-body');
        if (contentBody) {
            contentBody.innerHTML = `
                <div class="sqlite-table-error">
                    ❌ Error: ${this.escapeHtml(message)}
                </div>
            `;
        }
    }

    /**
     * Get database name from path
     * @returns {string} Database name
     */
    getDbName() {
        const parts = this.dbPath.split('/');
        return parts[parts.length - 1];
    }

    /**
     * Escape HTML
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Cleanup
     */
    destroy() {
        this.container.innerHTML = '';
    }
}

module.exports = SQLiteViewer;
