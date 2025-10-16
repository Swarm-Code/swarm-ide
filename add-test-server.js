/**
 * Add test SSH server to configuration
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Simulate app paths for config storage
const userDataPath = path.join(process.env.HOME || process.env.USERPROFILE, '.swarm-ide');
const configPath = path.join(userDataPath, 'config.json');

console.log('Config path:', configPath);

// Ensure directory exists
if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}

// Load existing config
let config = {};
if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
    console.log('✓ Loaded existing config');
} else {
    console.log('✓ Creating new config');
}

// Get existing servers
const servers = config.sshServers || [];
console.log('Current servers:', servers.length);

// Check if test server already exists
const existingServer = servers.find(s => s.host === '155.138.218.159');

if (existingServer) {
    console.log('⚠️  Test server already exists:', existingServer.name);
} else {
    // Add test server
    const testServer = {
        id: 'ssh_test_' + Date.now(),
        name: 'Vultr Test Server',
        host: '155.138.218.159',
        port: 22,
        username: 'root',
        authMethod: 'password',
        defaultPath: '/root',
        status: 'disconnected',
        lastConnected: null,
        createdAt: Date.now()
    };

    servers.push(testServer);
    config.sshServers = servers;

    // Save config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    console.log('✅ Test server added successfully!');
    console.log('Server ID:', testServer.id);
    console.log();
    console.log('⚠️  NOTE: Password must be stored separately using keytar');
    console.log('The IDE will prompt for password on first connection.');
}

console.log();
console.log('Done!');
