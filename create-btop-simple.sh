#!/bin/bash
# Simple approach: Use SSH to create tmux session with btop

echo "Creating tmux session with btop on remote VPS..."
echo "========================================"

sshpass -p '+gQ4!i,!!*b_B2-L' ssh -o StrictHostKeyChecking=no root@155.138.218.159 << 'ENDSSH'
echo "1. Creating new tmux session 'btop-session'..."
tmux new-session -d -s btop-session

echo "2. Starting btop in the tmux session..."
tmux send-keys -t btop-session "btop" C-m

echo "3. Checking tmux sessions..."
tmux list-sessions

echo ""
echo "✅ Done! To attach to the session from SSH:"
echo "   tmux attach -t btop-session"
echo ""
echo "To attach from this connection:"
echo "   sshpass -p '+gQ4!i,!!*b_B2-L' ssh -t root@155.138.218.159 'tmux attach -t btop-session'"
ENDSSH
