/**
 * Test GitClient to ensure it works correctly
 */

const { GitClient } = require('./src/lib/git/GitClient');

async function test() {
    console.log('Testing GitClient...');

    const client = new GitClient('/home/alejandro/Swarm/swarm-ide');

    try {
        // Test 1: Get current branch
        console.log('\n1. Testing git branch --show-current');
        const branch = await client.execute('git', ['branch', '--show-current']);
        console.log('✓ Current branch:', branch.trim());

        // Test 2: Get commit history
        console.log('\n2. Testing git log');
        const log = await client.execute('git', [
            'log',
            '--max-count=5',
            '--format=%H|%an|%ae|%ad|%s',
            '--date=iso'
        ]);

        const commits = log.split('\n').filter(l => l.trim());
        console.log(`✓ Got ${commits.length} commits:`);
        commits.forEach((commit, i) => {
            const [hash, author, email, date, message] = commit.split('|');
            console.log(`  ${i+1}. ${message} (${author})`);
        });

        // Test 3: Get branches
        console.log('\n3. Testing git branch list');
        const branches = await client.execute('git', [
            'branch',
            '--format=%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname:short)|%(committerdate:iso8601)'
        ]);
        console.log('✓ Branches:', branches.trim());

        console.log('\n✅ All tests passed!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

test();
