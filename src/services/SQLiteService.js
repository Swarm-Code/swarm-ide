/**
 * SQLiteService - Encapsulates SQLite database operations
 *
 * Provides a clean API for database operations, communicating with the main
 * process through IPC. This service handles error management and caching.
 *
 * Usage:
 *   await sqliteService.listTables('/path/to/database.db');
 *   await sqliteService.queryTable('/path/to/database.db', 'users', 100, 0);
 */

const eventBus = require('../modules/EventBus');

class SQLiteService {
    constructor() {
        this.api = null;
        this.tableCache = new Map();
        this.schemaCache = new Map();
    }

    /**
     * Initialize the service with the Electron API
     * @param {Object} electronAPI - The API exposed via preload script
     */
    initialize(electronAPI) {
        this.api = electronAPI;
        eventBus.emit('sqlite:initialized');
    }

    /**
     * List all tables in a database
     * @param {string} dbPath - Database file path
     * @returns {Promise<Array>} List of table names
     */
    async listTables(dbPath) {
        try {
            // Check cache
            if (this.tableCache.has(dbPath)) {
                return this.tableCache.get(dbPath);
            }

            const result = await this.api.sqliteListTables(dbPath);

            if (!result.success) {
                throw new Error(result.error);
            }

            // Cache the result
            this.tableCache.set(dbPath, result.tables);

            eventBus.emit('sqlite:tables-listed', { dbPath, tables: result.tables });

            return result.tables;
        } catch (error) {
            console.error('[SQLiteService] Error listing tables:', error);
            eventBus.emit('sqlite:error', { operation: 'listTables', dbPath, error });
            throw error;
        }
    }

    /**
     * Get table schema (columns and types)
     * @param {string} dbPath - Database file path
     * @param {string} tableName - Table name
     * @returns {Promise<Array>} Table schema
     */
    async getTableSchema(dbPath, tableName) {
        try {
            const cacheKey = `${dbPath}:${tableName}`;

            // Check cache
            if (this.schemaCache.has(cacheKey)) {
                return this.schemaCache.get(cacheKey);
            }

            const result = await this.api.sqliteGetSchema(dbPath, tableName);

            if (!result.success) {
                throw new Error(result.error);
            }

            // Cache the result
            this.schemaCache.set(cacheKey, result.schema);

            eventBus.emit('sqlite:schema-retrieved', { dbPath, tableName, schema: result.schema });

            return result.schema;
        } catch (error) {
            console.error('[SQLiteService] Error getting schema:', error);
            eventBus.emit('sqlite:error', { operation: 'getTableSchema', dbPath, tableName, error });
            throw error;
        }
    }

    /**
     * Query table data with pagination
     * @param {string} dbPath - Database file path
     * @param {string} tableName - Table name
     * @param {number} limit - Number of rows to return
     * @param {number} offset - Offset for pagination
     * @returns {Promise<Object>} Query result with data and total count
     */
    async queryTable(dbPath, tableName, limit = 100, offset = 0) {
        try {
            const result = await this.api.sqliteQueryTable(dbPath, tableName, limit, offset);

            if (!result.success) {
                throw new Error(result.error);
            }

            eventBus.emit('sqlite:table-queried', {
                dbPath,
                tableName,
                rowCount: result.data.length,
                total: result.total
            });

            return {
                data: result.data,
                total: result.total,
                limit,
                offset
            };
        } catch (error) {
            console.error('[SQLiteService] Error querying table:', error);
            eventBus.emit('sqlite:error', { operation: 'queryTable', dbPath, tableName, error });
            throw error;
        }
    }

    /**
     * Execute custom SQL query
     * @param {string} dbPath - Database file path
     * @param {string} query - SQL query to execute
     * @returns {Promise<Object>} Query result
     */
    async executeQuery(dbPath, query) {
        try {
            const result = await this.api.sqliteExecuteQuery(dbPath, query);

            if (!result.success) {
                throw new Error(result.error);
            }

            // Clear cache on write operations
            if (!query.trim().toUpperCase().startsWith('SELECT')) {
                this.clearCache(dbPath);
            }

            eventBus.emit('sqlite:query-executed', { dbPath, query, result });

            return result;
        } catch (error) {
            console.error('[SQLiteService] Error executing query:', error);
            eventBus.emit('sqlite:error', { operation: 'executeQuery', dbPath, query, error });
            throw error;
        }
    }

    /**
     * Clear cache for a specific database
     * @param {string} dbPath - Database file path
     */
    clearCache(dbPath) {
        this.tableCache.delete(dbPath);

        // Clear schema cache for all tables in this database
        for (const key of this.schemaCache.keys()) {
            if (key.startsWith(dbPath + ':')) {
                this.schemaCache.delete(key);
            }
        }

        eventBus.emit('sqlite:cache-cleared', { dbPath });
    }

    /**
     * Clear all caches
     */
    clearAllCaches() {
        this.tableCache.clear();
        this.schemaCache.clear();
        eventBus.emit('sqlite:all-caches-cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            tables: this.tableCache.size,
            schemas: this.schemaCache.size
        };
    }
}

// Export singleton instance
const sqliteService = new SQLiteService();
module.exports = sqliteService;
