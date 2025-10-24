#!/usr/bin/env node
/**
 * Test node-pty directly on the remote server
 */

const pty = require('node-pty');

console.log('🧪 Testing node-pty');
console.log('==================\n');

console.log('1. Spawning bash with NO arguments (non-interactive)...');
const test1 = pty.spawn('/bin/bash', [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
    }
});

let test1_received = false;
test1.onData((data) => {
    test1_received = true;
    console.log(`   ✅ Test 1 DATA: "${data.substring(0, 50).replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
});

// Write test command
setTimeout(() => {
    console.log('   Writing test command...');
    test1.write('echo "TEST1 OUTPUT"\\r');
}, 500);

setTimeout(() => {
    console.log(`   Result: ${test1_received ? 'SUCCESS' : 'FAILED'}`);
    test1.kill();

    console.log('\n2. Spawning bash with -i (interactive)...');
    const test2 = pty.spawn('/bin/bash', ['-i'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor'
        }
    });

    let test2_received = false;
    test2.onData((data) => {
        test2_received = true;
        console.log(`   ✅ Test 2 DATA: "${data.substring(0, 50).replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
    });

    setTimeout(() => {
        console.log(`   Result: ${test2_received ? 'SUCCESS' : 'FAILED'}`);
        test2.kill();

        console.log('\n📊 SUMMARY:');
        console.log(`  Test 1 (no args): ${test1_received ? 'PASSED ✅' : 'FAILED ❌'}`);
        console.log(`  Test 2 (-i flag): ${test2_received ? 'PASSED ✅' : 'FAILED ❌'}`);

        if (!test1_received && !test2_received) {
            console.log('\n❌ node-pty is not producing ANY output at all!');
        } else if (!test1_received && test2_received) {
            console.log('\n⚠️  Only interactive mode works - need to pass -i flag');
        } else if (test1_received) {
            console.log('\n✅ Both modes work - PTY is functioning correctly');
        }

        process.exit(0);
    }, 2000);
}, 2000);
