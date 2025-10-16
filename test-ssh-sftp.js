/**
 * Standalone SSH SFTP Test Script
 *
 * This script tests SSH connection and SFTP directory listing
 * to verify the functionality works before integrating into the IDE.
 */

const { Client } = require('ssh2');

// Test configuration
const testConfig = {
    host: '155.138.218.159',
    port: 22,
    username: 'root',
    password: '+gQ4!i,!!*b_B2-L'
};

console.log('=================================================');
console.log('SSH SFTP Test Script');
console.log('=================================================');
console.log('Testing connection to:', testConfig.username + '@' + testConfig.host);
console.log();

const conn = new Client();

conn.on('ready', () => {
    console.log('✅ SSH Connection established successfully!');
    console.log();

    console.log('🔧 Requesting SFTP session...');
    conn.sftp((err, sftp) => {
        if (err) {
            console.error('❌ SFTP Error:', err);
            conn.end();
            return;
        }

        console.log('✅ SFTP session established!');
        console.log();

        // Test listing root directory
        const testPath = '/';
        console.log('📂 Listing directory:', testPath);
        console.log('---');

        sftp.readdir(testPath, (err, list) => {
            if (err) {
                console.error('❌ readdir Error:', err);
                console.error('Error code:', err.code);
                console.error('Error message:', err.message);
                conn.end();
                return;
            }

            console.log('✅ Directory listing successful!');
            console.log('Found', list.length, 'entries:');
            console.log();

            // Display entries in a formatted table
            console.log('Type      | Size       | Name');
            console.log('----------|------------|----------------------------------');

            list.forEach(item => {
                const type = item.attrs.isDirectory() ? 'DIR ' : 'FILE';
                const size = item.attrs.isDirectory() ? '-' : item.attrs.size.toString().padStart(10);
                const name = item.filename;

                console.log(`${type.padEnd(9)} | ${size.padStart(10)} | ${name}`);
            });

            console.log();
            console.log('=================================================');
            console.log('Test completed successfully!');
            console.log('=================================================');

            // Test listing another directory if /root exists
            const hasRoot = list.find(item => item.filename === 'root' && item.attrs.isDirectory());

            if (hasRoot) {
                console.log();
                console.log('📂 Testing nested directory: /root');
                console.log('---');

                sftp.readdir('/root', (err, rootList) => {
                    if (err) {
                        console.error('❌ Failed to list /root:', err.message);
                    } else {
                        console.log('✅ /root listing successful!');
                        console.log('Found', rootList.length, 'entries in /root:');

                        rootList.slice(0, 10).forEach(item => {
                            const type = item.attrs.isDirectory() ? 'DIR ' : 'FILE';
                            const name = item.filename;
                            console.log(`  ${type} ${name}`);
                        });

                        if (rootList.length > 10) {
                            console.log(`  ... and ${rootList.length - 10} more`);
                        }
                    }

                    conn.end();
                });
            } else {
                conn.end();
            }
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection Error:', err);
    console.error('Error code:', err.code);
    console.error('Error level:', err.level);
});

conn.on('close', () => {
    console.log();
    console.log('🔌 Connection closed');
});

console.log('🔄 Connecting...');
conn.connect(testConfig);
