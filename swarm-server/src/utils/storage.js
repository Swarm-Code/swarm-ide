/**
 * Simple JSON file-based storage for Swarm Server
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

const DATA_DIR = path.join(os.homedir(), '.swarm-server', 'data');

class Storage {
    constructor() {
        this.ensureDataDir();
    }

    ensureDataDir() {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            logger.info('Created data directory:', DATA_DIR);
        }
    }

    getFilePath(name) {
        return path.join(DATA_DIR, `${name}.json`);
    }

    load(name, defaultValue = {}) {
        const filePath = this.getFilePath(name);

        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            logger.error(`Failed to load ${name}:`, error.message);
        }

        return defaultValue;
    }

    save(name, data) {
        const filePath = this.getFilePath(name);

        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            logger.debug(`Saved ${name} to ${filePath}`);
            return true;
        } catch (error) {
            logger.error(`Failed to save ${name}:`, error.message);
            return false;
        }
    }

    delete(name) {
        const filePath = this.getFilePath(name);

        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logger.debug(`Deleted ${name}`);
                return true;
            }
        } catch (error) {
            logger.error(`Failed to delete ${name}:`, error.message);
            return false;
        }

        return false;
    }
}

module.exports = new Storage();
