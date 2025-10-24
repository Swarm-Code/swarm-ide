# Local vs Remote Terminal WebSocket Comparison

## Executive Summary
**LOCAL WORKS, REMOTE DOESN'T** - The swarm-server terminal WebSocket handler attachment works perfectly on localhost but fails on the VPS.

## Test Results

### ✅ LOCAL (Arch Linux) - WORKING
```
Test: node test-local-terminal.js
Server: localhost:7777
Result: TEST PASSED

Logs show:
- numHandlers: 1 ✅
- PTY onData FIRED ✅
- onData callback triggered ✅
- WebSocket receives data ✅
- Shell prompt appears ✅
- Commands execute ✅
```

### ❌ REMOTE VPS (Ubuntu) - FAILING
```
Test: Same test via API (create-btop-via-api.js)
Server: root@155.138.218.159:7777
Result: Handlers not attached

Logs show:
- numHandlers: 0 ❌
- PTY onData FIRED ✅ (PTY generates output)
- onData callback NOT triggered ❌
- WebSocket receives 'connected' but no 'data' messages ❌
- Shell prompt never appears ❌
- No command output ❌
```

## Critical Code Comparison

### Code Versions
- **LOCAL**: Running from `/home/alejandro/Swarm/swarm-ide/swarm-server/`
- **REMOTE**: Running from `/opt/swarm-server/` (redeployed recently)

Both should be identical code, but different behavior.

## Possible Causes

### 1. Code Version Mismatch
- **Likelihood**: HIGH
- **Issue**: Remote code might still be old version despite redeployment
- **Verification**: Need to check git commit hash on both machines

### 2. node-pty Binary Issue
- **Likelihood**: MEDIUM
- **Issue**: We rebuilt node-pty on remote, but maybe didn't restart server afterward?
- **Evidence**: PTY generates data (so it works), but handlers might not be attached properly

### 3. Node.js Version Difference
- **Likelihood**: LOW
- **Local**: Node v24.9.0
- **Remote**: Unknown (need to check)
- **Issue**: JavaScript engine differences in closure/callback handling

### 4. npm Dependencies Mismatch
- **Likelihood**: MEDIUM
- **Issue**: Different versions of ws (WebSocket library)
- **Verification**: Compare package-lock.json

### 5. Environment Variables
- **Likelihood**: LOW
- **Issue**: Different LOG_LEVEL or other settings affecting code paths

## Next Steps

1. **Verify Remote Code Version**
   ```bash
   ssh root@155.138.218.159 "cd /opt/swarm-server && git log -1 --oneline"
   ```

2. **Compare Node.js Versions**
   ```bash
   node --version  # Local
   ssh root@155.138.218.159 "node --version"  # Remote
   ```

3. **Check if Remote Server Was Restarted After node-pty Rebuild**
   ```bash
   ssh root@155.138.218.159 "ps aux | grep 'node.*swarm-server'"
   ssh root@155.138.218.159 "systemctl restart swarm-server"
   ```

4. **Add More Verbose Logging to attachHandlers Function**
   - Log when handlers array is modified
   - Log the actual handler function references
   - Verify callbacks are actually being added to the array

5. **Direct Comparison Test**
   - Run test-local-terminal.js against BOTH local and remote
   - Use SSH tunnel to connect to remote: `ssh -L 8888:localhost:7777 root@155.138.218.159`
   - Then test against localhost:8888

## Code to Investigate

### `/opt/swarm-server/src/terminal-manager.js:attachHandlers`
```javascript
attachHandlers(terminalId, onDataCallback, onExitCallback) {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
        throw new Error(`Terminal ${terminalId} not found`);
    }

    // ADD MORE LOGGING HERE
    console.log(`[DEBUG] attachHandlers called for ${terminalId}`);
    console.log(`[DEBUG] Current handlers count: ${terminal.dataHandlers.length}`);

    terminal.dataHandlers.push(onDataCallback);
    terminal.exitHandlers.push(onExitCallback);

    console.log(`[DEBUG] After push handlers count: ${terminal.dataHandlers.length}`);
    console.log(`[DEBUG] onDataCallback type: ${typeof onDataCallback}`);
}
```

## Reproduction Steps

### Local (Working)
1. Start local swarm-server: `cd swarm-server && node src/index.js`
2. Run test: `node test-local-terminal.js`
3. Observe: numHandlers: 1, data flows correctly

### Remote (Not Working)
1. SSH to VPS: `ssh root@155.138.218.159`
2. Check swarm-server running: `systemctl status swarm-server`
3. From local machine, run: `node create-btop-via-api.js`
4. Check logs: `ssh root@155.138.218.159 "tail -100 /opt/swarm-server/server.log"`
5. Observe: numHandlers: 0, no data flows

## Files for Reference

- `/home/alejandro/Swarm/swarm-ide/test-local-terminal.js` - Working local test
- `/home/alejandro/Swarm/swarm-ide/create-btop-via-api.js` - Remote API test
- `/tmp/local-swarm-server.log` - Local server logs (numHandlers: 1)
- Remote logs previously showed `numHandlers: 0`

## Conclusion

The bug is **NOT** in the core swarm-server code (it works locally). The issue is either:
1. Different code version on remote
2. Different runtime environment (Node.js version, dependencies)
3. Server not restarted after fixes were deployed
4. Some Ubuntu-specific issue vs Arch Linux

**Recommendation**: Completely redeploy swarm-server to VPS from scratch, verify git commit hash matches local, and restart the service.
