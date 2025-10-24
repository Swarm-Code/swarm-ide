/**
 * Swarm Server Deployer
 * Automatically deploys and starts swarm-server on remote SSH machines
 * Inspired by VSCode Remote-SSH architecture
 */

const logger = require('../utils/Logger');
const path = require('path');
const fs = require('fs');

class SwarmServerDeployer {
    constructor() {
        this.serverVersion = '1.0.0';
        this.serverPath = '/tmp/.swarm-server'; // Remote installation path
    }

    /**
     * Ensure swarm-server is installed and running on remote machine
     * @param {Object} sshConnection - SSH connection object from SSHConnectionManager
     * @returns {Promise<boolean>} - True if server is running
     */
    async ensureServerRunning(sshConnection) {
        if (!sshConnection || !sshConnection.ssh) {
            throw new Error('Invalid SSH connection');
        }

        logger.info('swarmServerDeployer', `Ensuring swarm-server is running on ${sshConnection.config.host}`);

        try {
            // Step 1: Check if server is already running
            const isRunning = await this.checkServerRunning(sshConnection);

            if (isRunning) {
                logger.info('swarmServerDeployer', 'Swarm-server already running');
                return true;
            }

            // Step 2: Check if Node.js is installed
            const hasNode = await this.checkNodeInstalled(sshConnection);

            if (!hasNode) {
                logger.error('swarmServerDeployer', 'Node.js not found on remote machine');
                throw new Error('Node.js is not installed on the remote machine. Please install Node.js v18+ first.');
            }

            // Step 3: Check if server is installed
            const isInstalled = await this.checkServerInstalled(sshConnection);

            if (!isInstalled) {
                logger.info('swarmServerDeployer', 'Installing swarm-server on remote machine...');
                await this.installServer(sshConnection);
            }

            // Step 4: Start the server
            logger.info('swarmServerDeployer', 'Starting swarm-server...');
            await this.startServer(sshConnection);

            // Step 5: Verify server started
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for startup
            const isNowRunning = await this.checkServerRunning(sshConnection);

            if (!isNowRunning) {
                throw new Error('Server started but health check failed');
            }

            logger.info('swarmServerDeployer', '✅ Swarm-server is running');
            return true;

        } catch (error) {
            logger.error('swarmServerDeployer', 'Failed to ensure server running:', error);
            throw error;
        }
    }

    /**
     * Check if server is running by testing health endpoint
     */
    async checkServerRunning(sshConnection) {
        try {
            const result = await sshConnection.ssh.execCommand(
                'curl -s http://localhost:7777/health || echo "FAILED"'
            );

            if (result.stdout && result.stdout.includes('"status":"ok"')) {
                return true;
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if Node.js is installed
     */
    async checkNodeInstalled(sshConnection) {
        try {
            const result = await sshConnection.ssh.execCommand('node --version');

            if (result.code === 0 && result.stdout) {
                const version = result.stdout.trim();
                logger.info('swarmServerDeployer', `Node.js version: ${version}`);

                // Check if version is >= 18
                const majorVersion = parseInt(version.replace('v', '').split('.')[0]);
                if (majorVersion >= 18) {
                    return true;
                }

                logger.warn('swarmServerDeployer', `Node.js version ${version} is too old. Need v18+`);
                return false;
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if server is installed
     */
    async checkServerInstalled(sshConnection) {
        try {
            const result = await sshConnection.ssh.execCommand(
                `test -f ${this.serverPath}/package.json && echo "EXISTS" || echo "NOT_FOUND"`
            );

            return result.stdout && result.stdout.includes('EXISTS');
        } catch (error) {
            return false;
        }
    }

    /**
     * Install server on remote machine
     */
    async installServer(sshConnection) {
        try {
            // Get local swarm-server directory
            const localServerPath = path.join(__dirname, '../../swarm-server');

            if (!fs.existsSync(localServerPath)) {
                throw new Error('Local swarm-server directory not found');
            }

            logger.info('swarmServerDeployer', `Uploading swarm-server to ${this.serverPath}...`);

            // Create remote directory
            await sshConnection.ssh.execCommand(`mkdir -p ${this.serverPath}`);

            // Upload server files using SFTP
            const sftp = await sshConnection.ssh.requestSFTP();

            await this.uploadDirectory(sftp, localServerPath, this.serverPath);

            logger.info('swarmServerDeployer', 'Installing dependencies...');

            // Install npm dependencies
            const installResult = await sshConnection.ssh.execCommand(
                `cd ${this.serverPath} && npm install --production`,
                { options: { pty: false } }
            );

            if (installResult.code !== 0) {
                logger.error('swarmServerDeployer', 'npm install failed:', installResult.stderr);
                throw new Error(`Failed to install dependencies: ${installResult.stderr}`);
            }

            // Make executable
            await sshConnection.ssh.execCommand(`chmod +x ${this.serverPath}/bin/swarm-server.js`);
            await sshConnection.ssh.execCommand(`chmod +x ${this.serverPath}/src/index.js`);

            logger.info('swarmServerDeployer', '✅ Server installed successfully');

        } catch (error) {
            logger.error('swarmServerDeployer', 'Installation failed:', error);
            throw error;
        }
    }

    /**
     * Start server on remote machine
     */
    async startServer(sshConnection) {
        try {
            // Start server in background using nohup
            const startCmd = `cd ${this.serverPath} && nohup node src/index.js > ~/.swarm-server/server.log 2>&1 &`;

            await sshConnection.ssh.execCommand(startCmd);

            logger.info('swarmServerDeployer', 'Server start command sent');

        } catch (error) {
            logger.error('swarmServerDeployer', 'Failed to start server:', error);
            throw error;
        }
    }

    /**
     * Upload directory recursively via SFTP
     */
    async uploadDirectory(sftp, localPath, remotePath) {
        return new Promise((resolve, reject) => {
            const upload = async () => {
                try {
                    // Get list of files
                    const files = fs.readdirSync(localPath);

                    for (const file of files) {
                        // Skip node_modules and .git
                        if (file === 'node_modules' || file === '.git' || file === '.gitignore') {
                            continue;
                        }

                        const localFilePath = path.join(localPath, file);
                        const remoteFilePath = `${remotePath}/${file}`;
                        const stat = fs.statSync(localFilePath);

                        if (stat.isDirectory()) {
                            // Create remote directory
                            await new Promise((res, rej) => {
                                sftp.mkdir(remoteFilePath, (err) => {
                                    if (err && err.code !== 4) { // 4 = already exists
                                        rej(err);
                                    } else {
                                        res();
                                    }
                                });
                            });

                            // Recursively upload directory
                            await this.uploadDirectory(sftp, localFilePath, remoteFilePath);
                        } else {
                            // Upload file
                            await new Promise((res, rej) => {
                                sftp.fastPut(localFilePath, remoteFilePath, (err) => {
                                    if (err) {
                                        rej(err);
                                    } else {
                                        res();
                                    }
                                });
                            });
                        }
                    }

                    resolve();
                } catch (error) {
                    reject(error);
                }
            };

            upload();
        });
    }

    /**
     * Stop server on remote machine
     */
    async stopServer(sshConnection) {
        try {
            // Kill server process
            await sshConnection.ssh.execCommand('pkill -f "node src/index.js"');

            logger.info('swarmServerDeployer', 'Server stopped');

        } catch (error) {
            logger.error('swarmServerDeployer', 'Failed to stop server:', error);
        }
    }
}

module.exports = new SwarmServerDeployer();
