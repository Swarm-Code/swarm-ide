/**
 * SSH File Explorer Integration Test
 *
 * This test simulates the complete flow:
 * 1. SSH connection established
 * 2. SSHConnectionManager stores connection with SFTP
 * 3. Event emitted to FileExplorer
 * 4. FileExplorer calls IPC handler to list directory
 * 5. Main process uses SSHConnectionManager to list files
 * 6. Files are returned and displayed
 */

const { Client } = require('ssh2');

// Test configuration
const testConfig = {
    host: '155.138.218.159',
    port: 22,
    username: 'root',
    password: '+gQ4!i,!!*b_B2-L',
    defaultPath: '/root'
};

console.log('=================================================');
console.log('SSH File Explorer Integration Test');
console.log('=================================================');
console.log();

// Simulate SSHConnectionManager
class MockSSHConnectionManager {
    constructor() {
        this.connections = new Map();
    }

    async createAndConnect(config) {
        const connectionId = 'conn_' + Date.now();
        console.log('📡 [SSHConnectionManager] Creating connection:', connectionId);

        return new Promise((resolve, reject) => {
            const conn = new Client();

            conn.on('ready', () => {
                console.log('✅ [SSHConnectionManager] SSH connection ready');

                // Request SFTP session
                conn.sftp((err, sftp) => {
                    if (err) {
                        console.error('❌ [SSHConnectionManager] SFTP error:', err);
                        reject(err);
                        return;
                    }

                    console.log('✅ [SSHConnectionManager] SFTP session established');

                    // Store connection with SFTP
                    this.connections.set(connectionId, {
                        id: connectionId,
                        config: config,
                        client: conn,
                        sftp: sftp,
                        status: 'connected'
                    });

                    resolve(connectionId);
                });
            });

            conn.on('error', (err) => {
                console.error('❌ [SSHConnectionManager] Connection error:', err);
                reject(err);
            });

            console.log('🔄 [SSHConnectionManager] Connecting to SSH...');
            conn.connect(config);
        });
    }

    getConnection(connectionId) {
        return this.connections.get(connectionId);
    }

    // Simulate the IPC handler for ssh-list-directory
    async handleListDirectory(connectionId, remotePath) {
        console.log('📂 [IPC Handler] ssh-list-directory called');
        console.log('   connectionId:', connectionId);
        console.log('   remotePath:', remotePath);

        try {
            const connection = this.getConnection(connectionId);

            if (!connection) {
                console.error('❌ [IPC Handler] Connection not found!');
                return { success: false, error: 'SSH connection not found' };
            }

            console.log('✅ [IPC Handler] Connection found');
            console.log('   status:', connection.status);
            console.log('   has SFTP:', !!connection.sftp);

            if (!connection.sftp) {
                console.error('❌ [IPC Handler] SFTP not available!');
                return { success: false, error: 'SFTP not available for this connection' };
            }

            console.log('🔍 [IPC Handler] Calling sftp.readdir...');

            return new Promise((resolve) => {
                connection.sftp.readdir(remotePath, (err, list) => {
                    if (err) {
                        console.error('❌ [IPC Handler] SFTP readdir error:', err);
                        resolve({ success: false, error: err.message });
                    } else {
                        console.log('✅ [IPC Handler] SFTP readdir succeeded');
                        console.log('   entries found:', list.length);

                        const entries = list.map(item => ({
                            name: item.filename,
                            isDirectory: item.attrs.isDirectory(),
                            isFile: item.attrs.isFile(),
                            size: item.attrs.size,
                            mode: item.attrs.mode,
                            mtime: new Date(item.attrs.mtime * 1000),
                            path: remotePath.endsWith('/')
                                ? remotePath + item.filename
                                : remotePath + '/' + item.filename
                        }));

                        console.log('✅ [IPC Handler] Returning', entries.length, 'entries');
                        resolve({ success: true, entries });
                    }
                });
            });
        } catch (error) {
            console.error('❌ [IPC Handler] Exception:', error);
            return { success: false, error: error.message };
        }
    }
}

// Simulate FileExplorer receiving the event
async function simulateFileExplorer(connectionId, connectionConfig, sshManager) {
    console.log();
    console.log('📱 [FileExplorer] ========================================');
    console.log('📱 [FileExplorer] Received explorer:directory-opened event');
    console.log('📱 [FileExplorer] path: ssh://' + connectionConfig.host);
    console.log('📱 [FileExplorer] type: ssh');
    console.log('📱 [FileExplorer] connectionId:', connectionId);
    console.log('📱 [FileExplorer] defaultPath:', connectionConfig.defaultPath);

    // FileExplorer sets up SSH context
    const sshContext = {
        isSSH: true,
        connectionId: connectionId,
        connectionConfig: connectionConfig,
        remotePath: connectionConfig.defaultPath || '/'
    };

    console.log('📱 [FileExplorer] SSH context configured:');
    console.log('   connectionId:', sshContext.connectionId);
    console.log('   remotePath:', sshContext.remotePath);

    // FileExplorer calls openSSHDirectory
    console.log('📱 [FileExplorer] Calling openSSHDirectory...');
    console.log();

    // Simulate IPC call
    const result = await sshManager.handleListDirectory(
        sshContext.connectionId,
        sshContext.remotePath
    );

    console.log();
    console.log('📱 [FileExplorer] ========================================');
    console.log('📱 [FileExplorer] IPC result received:');
    console.log('   success:', result.success);
    console.log('   error:', result.error);
    console.log('   entries:', result.entries ? result.entries.length : 0);

    if (result.success) {
        console.log();
        console.log('📁 [FileExplorer] Rendering directory tree:');
        console.log('---------------------------------------------------');

        // Display first 15 entries
        const entriesToShow = result.entries.slice(0, 15);
        entriesToShow.forEach(entry => {
            const icon = entry.isDirectory ? '📁' : '📄';
            const type = entry.isDirectory ? 'DIR ' : 'FILE';
            const size = entry.isDirectory ? '' : `(${entry.size} bytes)`;
            console.log(`   ${icon} ${type} ${entry.name} ${size}`);
        });

        if (result.entries.length > 15) {
            console.log(`   ... and ${result.entries.length - 15} more`);
        }

        console.log('---------------------------------------------------');

        // Test navigating into a subdirectory
        const firstDir = result.entries.find(e => e.isDirectory && e.name !== '.' && e.name !== '..');

        if (firstDir) {
            console.log();
            console.log('🔍 Testing navigation to subdirectory:', firstDir.name);
            const subdirPath = firstDir.path;

            const subdirResult = await sshManager.handleListDirectory(
                connectionId,
                subdirPath
            );

            console.log();
            console.log('📱 [FileExplorer] Subdirectory result:');
            console.log('   success:', subdirResult.success);
            console.log('   entries:', subdirResult.entries ? subdirResult.entries.length : 0);

            if (subdirResult.success && subdirResult.entries) {
                console.log();
                console.log('📁 Contents of', subdirPath, ':');
                subdirResult.entries.slice(0, 10).forEach(entry => {
                    const icon = entry.isDirectory ? '📁' : '📄';
                    console.log(`   ${icon} ${entry.name}`);
                });
            }
        }

        // Test reading a file (if there are any files)
        const firstFile = result.entries.find(e => e.isFile && !e.name.startsWith('.'));

        if (firstFile) {
            console.log();
            console.log('📄 Testing file reading:', firstFile.name);

            const connection = sshManager.getConnection(connectionId);
            if (connection && connection.sftp) {
                await new Promise((resolve) => {
                    connection.sftp.readFile(firstFile.path, 'utf8', (err, data) => {
                        if (err) {
                            console.log('❌ Failed to read file:', err.message);
                        } else {
                            const preview = data.substring(0, 200);
                            console.log('✅ File read successfully!');
                            console.log('   Size:', data.length, 'bytes');
                            console.log('   Preview:');
                            console.log('   ---');
                            console.log('   ' + preview.split('\n').join('\n   '));
                            if (data.length > 200) {
                                console.log('   ...');
                            }
                            console.log('   ---');
                        }
                        resolve();
                    });
                });
            }
        }
    }

    return result;
}

// Run the integration test
async function runTest() {
    const manager = new MockSSHConnectionManager();

    try {
        // Step 1: Simulate SSH connection
        console.log('Step 1: Creating SSH connection...');
        console.log();
        const connectionId = await manager.createAndConnect(testConfig);

        console.log();
        console.log('✅ Connection established with ID:', connectionId);
        console.log();

        // Step 2: Simulate the event being emitted to FileExplorer
        console.log('Step 2: Simulating explorer:directory-opened event...');
        await simulateFileExplorer(connectionId, testConfig, manager);

        console.log();
        console.log('=================================================');
        console.log('✅ Integration test completed successfully!');
        console.log('=================================================');

        // Close connection
        const connection = manager.getConnection(connectionId);
        if (connection && connection.client) {
            connection.client.end();
        }

        process.exit(0);

    } catch (error) {
        console.error();
        console.error('=================================================');
        console.error('❌ Integration test failed!');
        console.error('=================================================');
        console.error('Error:', error);
        process.exit(1);
    }
}

// Run the test
runTest();
