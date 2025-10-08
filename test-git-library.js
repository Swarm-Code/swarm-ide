#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Custom Git Library
 *
 * Tests all components:
 * - GitClient (process spawning)
 * - All parsers (blame, diff, log, status, branch)
 * - All models (Commit, Branch, Diff, Hunk, BlameEntry, FileStatus)
 * - GitRepository (high-level API)
 */

const path = require('path');
const { GitClient, GitError } = require('./src/lib/git/GitClient');
const { GitRepository } = require('./src/lib/git/GitRepository');
const { BlameParser } = require('./src/lib/git/parsers/BlameParser');
const { DiffParser } = require('./src/lib/git/parsers/DiffParser');
const { LogParser } = require('./src/lib/git/parsers/LogParser');
const { StatusParser } = require('./src/lib/git/parsers/StatusParser');
const { BranchParser } = require('./src/lib/git/parsers/BranchParser');

// Test repository path (current directory)
const TEST_REPO = process.cwd();

console.log('='.repeat(80));
console.log('CUSTOM GIT LIBRARY - COMPREHENSIVE TEST SUITE');
console.log('='.repeat(80));
console.log(`Test Repository: ${TEST_REPO}\n`);

let testsPassed = 0;
let testsFailed = 0;

function pass(testName) {
    console.log(`✓ ${testName}`);
    testsPassed++;
}

function fail(testName, error) {
    console.log(`✗ ${testName}`);
    console.log(`  Error: ${error.message}`);
    if (error.stack) {
        console.log(`  ${error.stack.split('\n').slice(1, 3).join('\n  ')}`);
    }
    testsFailed++;
}

async function runTests() {
    // ============================================
    // TEST 1: GitClient Basic Functionality
    // ============================================
    console.log('\n' + '='.repeat(80));
    console.log('TEST 1: GitClient - Core Git Process Execution');
    console.log('='.repeat(80));

    try {
        const client = new GitClient(TEST_REPO);

        // Test 1.1: Git availability
        try {
            const isAvailable = await client.isGitAvailable();
            if (isAvailable) {
                pass('1.1: Git is available on system');
            } else {
                fail('1.1: Git availability check', new Error('Git not found'));
            }
        } catch (error) {
            fail('1.1: Git availability check', error);
        }

        // Test 1.2: Repository validation
        try {
            const isRepo = await client.isRepository();
            if (isRepo) {
                pass('1.2: Current directory is a valid Git repository');
            } else {
                fail('1.2: Repository validation', new Error('Not a git repository'));
            }
        } catch (error) {
            fail('1.2: Repository validation', error);
        }

        // Test 1.3: Simple git command execution
        try {
            const version = await client.execute(['--version']);
            if (version.includes('git version')) {
                pass('1.3: Execute simple git command (--version)');
            } else {
                fail('1.3: Execute git command', new Error('Unexpected output'));
            }
        } catch (error) {
            fail('1.3: Execute git command', error);
        }

        // Test 1.4: Get repository root
        try {
            const root = await client.getRepositoryRoot();
            if (root && root.trim()) {
                pass(`1.4: Get repository root: ${root.trim()}`);
            } else {
                fail('1.4: Get repository root', new Error('Empty root path'));
            }
        } catch (error) {
            fail('1.4: Get repository root', error);
        }

    } catch (error) {
        fail('1.0: GitClient initialization', error);
    }

    // ============================================
    // TEST 2: GitRepository - High-Level API
    // ============================================
    console.log('\n' + '='.repeat(80));
    console.log('TEST 2: GitRepository - High-Level Git Operations');
    console.log('='.repeat(80));

    try {
        const repo = new GitRepository(TEST_REPO);

        // Test 2.1: Get current branch
        try {
            const branch = await repo.getCurrentBranch();
            if (branch) {
                pass(`2.1: Get current branch: ${branch}`);
            } else {
                fail('2.1: Get current branch', new Error('No branch returned'));
            }
        } catch (error) {
            fail('2.1: Get current branch', error);
        }

        // Test 2.2: Get repository status
        try {
            const status = await repo.status();
            pass(`2.2: Get repository status (${status.files.length} files)`);
            if (status.files.length > 0) {
                console.log(`     First file: ${status.files[0].path} [${status.files[0].getStatusDescription()}]`);
            }
        } catch (error) {
            fail('2.2: Get repository status', error);
        }

        // Test 2.3: Get branches
        try {
            const branches = await repo.getBranches();
            pass(`2.3: Get branches (${branches.length} branches found)`);
            const currentBranch = branches.find(b => b.isCurrent);
            if (currentBranch) {
                console.log(`     Current: ${currentBranch.name}`);
                if (currentBranch.upstream) {
                    console.log(`     Upstream: ${currentBranch.upstream} [${currentBranch.getTrackingStatus()}]`);
                }
            }
        } catch (error) {
            fail('2.3: Get branches', error);
        }

        // Test 2.4: Get commit log
        try {
            const commits = await repo.log({ limit: 5 });
            pass(`2.4: Get commit log (${commits.length} commits)`);
            if (commits.length > 0) {
                const latest = commits[0];
                console.log(`     Latest: ${latest.shortSha} - ${latest.subject}`);
                console.log(`     Author: ${latest.author} (${latest.getRelativeTime()})`);
            }
        } catch (error) {
            fail('2.4: Get commit log', error);
        }

        // Test 2.5: Get diff
        try {
            const diffs = await repo.diff();
            pass(`2.5: Get diff (${diffs.length} files with changes)`);
            if (diffs.length > 0) {
                const firstDiff = diffs[0];
                const stats = firstDiff.getStats();
                console.log(`     ${firstDiff.path}: +${stats.additions} -${stats.deletions}`);
            }
        } catch (error) {
            fail('2.5: Get diff', error);
        }

        // Test 2.6: Get blame for a file (try package.json)
        try {
            const blameEntries = await repo.blame('package.json');
            pass(`2.6: Get blame for package.json (${blameEntries.length} entries)`);
            if (blameEntries.length > 0) {
                const firstEntry = blameEntries[0];
                console.log(`     Lines ${firstEntry.lineStart}-${firstEntry.lineEnd}: ${firstEntry.author} (${firstEntry.shortSha})`);
            }
        } catch (error) {
            fail('2.6: Get blame for file', error);
        }

    } catch (error) {
        fail('2.0: GitRepository initialization', error);
    }

    // ============================================
    // TEST 3: Parser Tests
    // ============================================
    console.log('\n' + '='.repeat(80));
    console.log('TEST 3: Parsers - Git Output Parsing');
    console.log('='.repeat(80));

    // Test 3.1: StatusParser
    try {
        const sampleStatus = `# branch.oid abc123
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -1
1 M. N... 100644 100644 100644 def456 ghi789 file1.txt
1 .M N... 100644 100644 100644 jkl012 mno345 file2.txt
? file3.txt`;

        const status = StatusParser.parseV2(sampleStatus);
        if (status.branch === 'main' && status.ahead === 2 && status.behind === 1 && status.files.length === 3) {
            pass('3.1: StatusParser - Parse porcelain v2 format');
        } else {
            fail('3.1: StatusParser', new Error('Parsing mismatch'));
        }
    } catch (error) {
        fail('3.1: StatusParser', error);
    }

    // Test 3.2: BranchParser
    try {
        const sampleBranch = `main|origin/main|[ahead 2, behind 1]|abc123|2025-01-01
feature|origin/feature||def456|2025-01-02`;

        const branches = BranchParser.parse(sampleBranch, 'main');
        if (branches.length === 2 && branches[0].ahead === 2 && branches[0].behind === 1) {
            pass('3.2: BranchParser - Parse branch format with tracking');
        } else {
            fail('3.2: BranchParser', new Error('Parsing mismatch'));
        }
    } catch (error) {
        fail('3.2: BranchParser', error);
    }

    // Test 3.3: DiffParser
    try {
        const sampleDiff = `diff --git a/test.txt b/test.txt
index abc123..def456 100644
--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,4 @@
 line 1
-line 2
+line 2 modified
+line 3 added
 line 4`;

        const diffs = DiffParser.parse(sampleDiff);
        if (diffs.length === 1 && diffs[0].hunks.length === 1) {
            pass('3.3: DiffParser - Parse unified diff format');
        } else {
            fail('3.3: DiffParser', new Error('Parsing mismatch'));
        }
    } catch (error) {
        fail('3.3: DiffParser', error);
    }

    // Test 3.4: LogParser
    try {
        const sampleLog = `---COMMIT---
abc123def456||John Doe|john@example.com|1704067200|Initial commit|First commit message body`;

        const commits = LogParser.parse(sampleLog);
        if (commits.length === 1 && commits[0].author === 'John Doe') {
            pass('3.4: LogParser - Parse log format');
        } else {
            fail('3.4: LogParser', new Error('Parsing mismatch'));
        }
    } catch (error) {
        fail('3.4: LogParser', error);
    }

    // ============================================
    // TEST 4: Model Tests
    // ============================================
    console.log('\n' + '='.repeat(80));
    console.log('TEST 4: Models - Data Structures');
    console.log('='.repeat(80));

    try {
        const { Commit } = require('./src/lib/git/models/Commit');
        const commit = new Commit({
            sha: 'abc123def456',
            parents: [],
            author: 'Test User',
            authorEmail: 'test@example.com',
            authorTime: Math.floor(Date.now() / 1000) - 3600,
            subject: 'Test commit',
            body: 'Test body'
        });

        if (commit.shortSha === 'abc123d' && commit.getRelativeTime().includes('hour')) {
            pass('4.1: Commit model - Create and format');
        } else {
            fail('4.1: Commit model', new Error('Model methods failed'));
        }
    } catch (error) {
        fail('4.1: Commit model', error);
    }

    try {
        const { Branch } = require('./src/lib/git/models/Branch');
        const branch = new Branch({
            name: 'main',
            upstream: 'origin/main',
            ahead: 2,
            behind: 1,
            isCurrent: true
        });

        if (branch.hasDiverged() && branch.getTrackingStatus() === 'ahead 2, behind 1') {
            pass('4.2: Branch model - Tracking status methods');
        } else {
            fail('4.2: Branch model', new Error('Model methods failed'));
        }
    } catch (error) {
        fail('4.2: Branch model', error);
    }

    try {
        const { FileStatus } = require('./src/lib/git/models/FileStatus');
        const fileStatus = new FileStatus({
            path: 'test.txt',
            indexStatus: 'M',
            workingTreeStatus: '.',
            isStaged: true
        });

        if (fileStatus.isModified() && fileStatus.getChangeType() === 'modified') {
            pass('4.3: FileStatus model - Status detection');
        } else {
            fail('4.3: FileStatus model', new Error('Model methods failed'));
        }
    } catch (error) {
        fail('4.3: FileStatus model', error);
    }

    // ============================================
    // TEST SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${testsPassed + testsFailed}`);
    console.log(`Passed: ${testsPassed} ✓`);
    console.log(`Failed: ${testsFailed} ✗`);
    console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    console.log('='.repeat(80));

    if (testsFailed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! Git library is fully functional.\n');
        process.exit(0);
    } else {
        console.log(`\n⚠️  ${testsFailed} test(s) failed. Review errors above.\n`);
        process.exit(1);
    }
}

// Run all tests
runTests().catch(error => {
    console.error('\n❌ FATAL ERROR IN TEST SUITE:');
    console.error(error);
    process.exit(1);
});
