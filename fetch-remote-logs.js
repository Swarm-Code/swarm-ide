const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    console.log('[SSH] Connected!');

    conn.exec('ps aux | grep -E "node.*swarm-server|swarm.*server.js" | grep -v grep && echo "---" && ls -la /opt/swarm-server/ 2>&1 && echo "---" && cat /opt/swarm-server/server.log 2>&1 | tail -100', (err, stream) => {
        if (err) {
            console.error('[ERROR]', err);
            conn.end();
            return;
        }

        stream.on('close', (code, signal) => {
            console.log('[STREAM] Stream closed');
            conn.end();
        }).on('data', (data) => {
            console.log(data.toString());
        }).stderr.on('data', (data) => {
            console.error('[STDERR]', data.toString());
        });
    });
}).connect({
    host: '155.138.218.159',
    port: 22,
    username: 'root',
    password: '+gQ4!i,!!*b_B2-L'
});
