# Antigravity IDE - Complete Architecture & Feature Reference

**Version**: Google Gemini 3 Pro Agent-First IDE (Fork of VS Code)
**Release Date**: Announced alongside Gemini 3 Pro
**Status**: Free public preview (Mac, Windows, Linux)

---

## Table of Contents

1. [Overview & Philosophy](#overview)
2. [Core Architecture](#architecture)
3. [Agent System](#agents)
4. [UI Screens & Interfaces](#screens)
5. [AI Integration (Gemini 3 Pro)](#ai-integration)
6. [Agentic Workflows](#workflows)
7. [Browser Automation](#browser)
8. [File Structure](#filestructure)
9. [Configuration & Tools](#configuration)
10. [Execution Models](#execution)

---

## Overview & Philosophy {#overview}

### Core Concept: Agent-First Development

Antigravity introduces a paradigm shift in AI-assisted coding:

- **Agent Elevation**: Agents are elevated from being passive assistants to **first-class citizens** with their own dedicated surface
- **Autonomy**: Agents can **autonomously plan and execute** complex, end-to-end software tasks
- **Direct Access**: Agents have **direct access to the editor, terminal, and browser** simultaneously
- **Parallel Execution**: Multiple agents can work on different tasks in parallel
- **Self-Validation**: Agents validate their own code before presenting changes to users

### Key Innovation: The Cascade Panel

Instead of inline suggestions or a chat history, Antigravity shows multi-file changes in a **Cascade Panel** that:
- Visualizes all affected files
- Shows detailed diffs for each change
- Displays agent reasoning for each step
- Allows selective acceptance/rejection
- Provides atomic "apply all" functionality

---

## Core Architecture {#architecture}

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Base Platform** | VS Code (Microsoft, fork) | Code editor foundation |
| **Desktop Framework** | Electron | Cross-platform (Mac/Windows/Linux) |
| **Rendering Engine** | Chromium/Blink | UI rendering |
| **Editor Core** | Monaco Editor | Code editing with language features |
| **AI Model** | Google Gemini 3 Pro | Agent reasoning & planning |
| **Agent Protocol** | Model Context Protocol (MCP) | Tool definitions & execution |
| **CSS Framework** | Tailwind CSS | UI styling |
| **Module Bundler** | Webpack | Extension & webview bundling |
| **Debug Protocol** | Chrome DevTools Protocol | Browser automation |

### High-Level Data Flow

```
User Input
    ↓
Chat Interface (chat.js)
    ↓
Gemini 3 Pro (with System Prompt)
    ↓
Tool/Function Call Generation (MCP Format)
    ↓
Schema Validation (mcp_config.schema.json)
    ↓
Tool Execution (File Ops, Terminal, Browser)
    ↓
Result Collection & Observation
    ↓
Loop Back to Gemini (for multi-step tasks)
    ↓
Visualize in Cascade Panel
    ↓
User Approval/Rejection
    ↓
Apply Changes Atomically
```

---

## Agent System {#agents}

### Jetski Agent - The Core Agent

**Location**: `/resources/app/out/jetskiAgent/main.js`

The **Jetski agent** is the primary autonomous agent interface (codename reveals internal naming).

**Responsibilities**:
- Receives natural language goals from users
- Decomposes complex tasks into subtasks
- Orchestrates multi-step workflows
- Manages interactions with editor, terminal, and browser
- Coordinates with other agents
- Reports progress and results

### Agent Capabilities Matrix

| Capability | Tool | Access Point |
|-----------|------|--------------|
| **Code Reading** | File System API | Direct file I/O |
| **Code Writing** | Editor Integration | Direct file modification |
| **Code Understanding** | Language Server (LSP) | `language_server_linux_x64` binary |
| **Command Execution** | Terminal Integration | Shell command execution |
| **Process Control** | Process Manager | Kill/suspend processes |
| **Browser Control** | Chrome DevTools Protocol | `antigravity-browser-launcher` |
| **File Discovery** | File Finder (`fd` binary) | Fast codebase search |
| **Code Analysis** | LSP + Regex | Pattern matching & structure |

### Multi-Agent Coordination

Agents coordinate through:
- **Shared Context**: Common project state and codebase understanding
- **MCP Tool Sequencing**: Ordered execution of tool calls
- **Priority Scheduling**: Critical operations get priority
- **Event Broadcasting**: Agents notify each other of state changes

### Agent Guardrails & Safety

**Safety Mechanisms**:
1. **Code Validation**: Agents validate generated code before execution
2. **Schema Validation**: All tool calls validated against MCP schema
3. **Sandbox Environments**: Dev containers for isolated execution
4. **User Approval Gates**: Critical operations require human confirmation
5. **Rate Limiting**: Prevent API quota exhaustion
6. **Token Limits**: Bounded context windows to Gemini API

---

## UI Screens & Interfaces {#screens}

### 1. Jetski Agent Interface

**File**: `/resources/app/out/jetskiAgent/main.js` + `main.css`

**Purpose**: Dedicated UI for agent interaction and task management

**Features**:
- Agent status indicators (thinking, executing, ready)
- Progress bars for multi-step tasks
- Step counter (Step 2/5)
- Current action description
- Pause/resume controls
- Task history

### 2. Cascade Panel

**File**: `/resources/app/extensions/antigravity/cascade-panel.html`

**Purpose**: Visualize and review all changes proposed by agents before applying

**Workflow**:
```
Agent Proposes Changes
    ↓
Cascade Panel Loads
    ↓
Display: File List with Status Icons
    ├─ ✓ Completed (green)
    ├─ ⟳ In Progress (blue)
    ├─ ⚠ Warning (yellow)
    └─ ✗ Error (red)
    ↓
Display: Detailed Diff for Each File
    ├─ Green: Additions
    ├─ Red: Deletions
    └─ Yellow: Modifications
    ↓
Display: Agent Reasoning
    └─ Expandable explanation for each change
    ↓
User Actions: Accept All / Accept Selective / Reject / Request Changes
    ↓
If Accept: Apply Atomically
If Reject: Discard & Request Alternative
If Changes: Feedback to Agent Loop
```

**Key Features**:
- Line-by-line diff viewer
- File navigation (sidebar list)
- Inline code comments explaining changes
- Collapse/expand sections
- Search within diffs
- Copy/download change summary

### 3. Chat Interface

**File**: `/resources/app/extensions/antigravity/out/media/chat.js`

**Purpose**: Real-time conversation with Jetski agent

**Features**:
- Natural language input field
- Message history display
- Streaming responses from Gemini
- Context injection (selected code, error messages)
- File references (@mention syntax)
- Code snippets in responses (with copy button)
- Suggested follow-up questions

**Interaction Pattern**:
```
User Types: "Fix the login bug on the auth page"
    ↓
System Injects Context:
  - Current file: pages/login.tsx
  - Recent error: "TypeError: username is undefined"
  - Related files: services/auth.js, lib/validate.js
    ↓
Chat.js Sends to Gemini with:
  - System Prompt: "You are an expert code agent..."
  - User Prompt: [user message]
  - Context: [files, errors, screen]
    ↓
Gemini Returns:
  - Reasoning: "The error occurs because..."
  - Tool Calls: MCP format for specific actions
  - Explanation: Natural language walkthrough
    ↓
Chat Interface Streams Response
    ↓
Agent Executes Tool Calls
    ↓
Updates Displayed in Cascade Panel
```

### 4. Rule Editor

**File**: `/resources/app/extensions/antigravity/customEditor/media/ruleEditor/`

**Purpose**: Visual interface for defining automation rules

**Enables**:
- Condition-based triggers (e.g., "when file X changes, then...")
- Action definitions (code edits, terminal commands)
- Agent behavior customization
- Workflow templates

### 5. Workflow Editor

**File**: `/resources/app/extensions/antigravity/customEditor/media/workflowEditor/`

**Purpose**: Compose complex multi-step agent workflows visually

**Features**:
- Node-and-edge visual programming
- Task chaining
- Conditional branching
- Loop/iteration support
- Variable passing between steps
- Error handling paths

### 6. Authentication Screen

**File**: `/resources/app/extensions/antigravity/auth-success-jetski.html`

**Purpose**: OAuth credential exchange and agent initialization

**Flow**:
```
User Clicks "Sign in with Google"
    ↓
Redirect to Google OAuth
    ↓
User Grants Permissions
    ↓
Redirect to auth-success-jetski.html
    ↓
Exchange authorization code for API tokens
    ↓
Initialize Jetski Agent with credentials
    ↓
Agent ready to access Gemini 3 Pro API
```

---

## AI Integration (Gemini 3 Pro) {#ai-integration}

### System Prompts & Agent Personality

The Jetski agent operates with carefully crafted system prompts that instruct Gemini to:

**Core Instructions**:
- "You are an expert code agent with deep knowledge of software development"
- "You have access to the following tools: [MCP tool definitions]"
- "Break complex tasks into atomic steps"
- "Always validate generated code before execution"
- "Ask clarifying questions if task intent is ambiguous"
- "Explain your reasoning for each decision"

**Constraints**:
- "Do not execute destructive commands without user confirmation"
- "Prefer safe refactorings over aggressive changes"
- "Maintain code style consistency with existing codebase"
- "Generate tests for new functionality"

### Model Context Protocol (MCP)

**Files**:
- `/resources/app/extensions/antigravity/schemas/mcp_config.schema.json`
- `/resources/app/extensions/antigravity/schemas/mcp_config.schema.json.IMPORTANT`

**Purpose**: Standardized interface for defining tools that agents can call

**MCP Tool Categories**:

```
1. FILE SYSTEM TOOLS
   - ReadFile(path) → content
   - WriteFile(path, content) → success
   - ListDirectory(path) → [files]
   - DeleteFile(path) → success
   - CreateDirectory(path) → success
   - GetFileMetadata(path) → {size, modified, type}
   - AppendToFile(path, content) → success

2. EDITOR TOOLS
   - EditCode(file, changes) → success
   - ApplyDiff(file, diff) → success
   - FindReferences(symbol) → [locations]
   - GetSymbolDefinition(symbol) → location
   - GetCodeCompletion(file, position) → [suggestions]
   - RenameSymbol(symbol, newName) → success
   - GetCodeStructure(file) → {classes, functions, imports}
   - FindCodePattern(regex, files) → [matches]

3. TERMINAL TOOLS
   - ExecuteCommand(cmd) → {stdout, stderr, exitCode}
   - ExecuteCommand(cmd, timeout) → ...
   - KillProcess(pid) → success
   - SetEnvironmentVar(key, value) → success
   - GetEnvironmentVar(key) → value
   - GetWorkingDirectory() → path
   - ChangeDirectory(path) → success

4. BROWSER TOOLS
   - LaunchBrowser(options) → {pid, port}
   - CloseBrowser(pid) → success
   - TakeScreenshot() → image_base64
   - RecordSession(duration) → video_file
   - Click(selector) → success
   - FillInput(selector, text) → success
   - SelectDropdown(selector, value) → success
   - GetPageHTML() → html_string
   - ExecuteJavaScript(code) → result
   - Navigate(url) → success
   - WaitForElement(selector, timeout) → success
   - GetConsoleLog() → [messages]
   - GetNetworkRequests() → [requests]

5. ANALYSIS TOOLS
   - ParseCode(file) → {syntax_tree, errors}
   - GetErrorDiagnostics(file) → [errors]
   - GetDependencies(file) → [imports]
   - AnalyzeTestCoverage(file) → percentage
   - GetPerformanceMetrics(file) → {metrics}

6. GIT TOOLS
   - GetGitStatus() → status
   - GetDiff(file) → diff_string
   - GetCommitHistory(file, limit) → [commits]
   - CreateCommit(message) → commit_hash
   - SwitchBranch(name) → success
   - MergeBranch(name) → success
   - GetBranchList() → [branches]
```

### Context Window Management

**What Gets Passed to Gemini**:

1. **System Context**
   ```
   - Codebase structure summary
   - package.json (dependencies, scripts)
   - Build configuration
   - Test suite overview
   - Environment setup
   ```

2. **Current State**
   ```
   - Open file(s) with line context
   - Cursor position
   - Terminal output from recent commands
   - Browser screenshot
   - Last 5 messages in chat history
   - Recent errors/warnings
   ```

3. **User Intent**
   ```
   - Natural language goal/task
   - File references
   - Code snippets shown
   - Error messages
   - Selected text in editor
   ```

### Request-Response Cycle

```
IDE sends to Gemini 3 Pro:
{
  "system": "You are an expert code agent...",
  "context": {
    "codebase": { ... },
    "currentState": { ... },
    "recentHistory": [ ... ]
  },
  "prompt": "User's natural language request",
  "toolDefinitions": [ ... MCP tools ... ]
}

Gemini responds with:
{
  "reasoning": "Here's my thought process...",
  "toolCalls": [
    {
      "id": "call_1",
      "tool": "EditCode",
      "params": { "file": "src/auth.js", "changes": [...] }
    },
    {
      "id": "call_2",
      "tool": "ExecuteCommand",
      "params": { "cmd": "npm test" }
    }
  ],
  "explanation": "I'm making these changes because...",
  "alternativeApproaches": [ ... ]
}

IDE executes tool calls and responds to Gemini with:
{
  "toolResults": [
    { "id": "call_1", "success": true },
    { "id": "call_2", "stdout": "4/4 tests passed", "exitCode": 0 }
  ]
}

If multi-step task, loop back to step 1
Otherwise, display results in Cascade Panel
```

### Gemini 3 Pro Capabilities Leveraged

**Vision**:
- Screenshot analysis for UI understanding
- Element detection and localization
- Text extraction from images
- Layout/design pattern recognition

**Reasoning**:
- Multi-step planning and decomposition
- Dependency analysis
- Error diagnosis
- Alternative solution generation

**Code Understanding**:
- Semantic code analysis
- Pattern recognition
- Refactoring suggestions
- Test generation

**Natural Language**:
- Instruction interpretation
- Clarifying questions
- Explanation generation

---

## Agentic Workflows {#workflows}

### Example Workflow 1: Add User Authentication

**User Request**: "Add JWT-based user authentication to the app"

**Agent Execution Flow**:

```
Step 1: PLANNING
├─ Analyze current codebase structure
├─ Identify existing auth patterns
├─ Determine files to modify/create
├─ Plan implementation order
└─ Gemini decides: Need 4 new files, modify 2 existing files

Step 2: CREATE MIDDLEWARE
├─ MCP Call: EditCode("src/middleware/auth.js", "new auth middleware")
├─ LSP Validation: Check syntax
├─ Result: File created successfully
└─ Screenshot: File appears in explorer

Step 3: ADD LOGIN ENDPOINT
├─ MCP Call: EditCode("src/routes/auth.js", "POST /login endpoint")
├─ LSP Check: Validate imports and function signatures
├─ Result: Endpoint created
└─ Check: File compiles without errors

Step 4: UPDATE MAIN APP
├─ MCP Call: EditCode("src/app.js", "import and use auth middleware")
├─ LSP Check: Validate integration
├─ Result: Middleware integrated
└─ Build Check: npm run build succeeds

Step 5: ADD TYPE DEFINITIONS
├─ MCP Call: EditCode("src/types/auth.d.ts", "Auth interface definitions")
├─ LSP Check: Type definitions are correct
└─ Result: Types defined

Step 6: CREATE TESTS
├─ MCP Call: EditCode("test/auth.test.js", "comprehensive auth tests")
├─ MCP Call: ExecuteCommand("npm test")
├─ Result: 12/12 tests pass
└─ Success: Test coverage > 85%

Step 7: VERIFICATION
├─ MCP Call: TakeScreenshot() [of test output]
├─ Gemini analyzes screenshot
├─ Confirms: All tests green, no build errors
└─ Success: Task complete

Step 8: PRESENTATION
├─ Cascade Panel displays:
│   ├─ src/middleware/auth.js (created, 45 lines)
│   ├─ src/routes/auth.js (created, 32 lines)
│   ├─ src/app.js (modified, +2 lines)
│   ├─ src/types/auth.d.ts (created, 18 lines)
│   └─ test/auth.test.js (created, 68 lines)
├─ Reasoning shown for each file
└─ User clicks "Apply All"

Step 9: ATOMIC APPLICATION
├─ All files written atomically
├─ Git diff generated
├─ Undo stack updated
└─ Success message in chat
```

**Key Observations**:
- Agent doesn't ask "is this okay?" after each step
- Agent autonomously validates with LSP and tests
- Multi-file changes coordinated automatically
- User sees complete picture before approval
- Changes atomic (all-or-nothing application)

### Example Workflow 2: Fix Failing Test with Browser Validation

**User Request**: "Our login test is failing. Debug it and fix it."

**Agent Execution Flow**:

```
Step 1: IDENTIFY THE PROBLEM
├─ MCP Call: ExecuteCommand("npm test -- --grep 'login'")
├─ Result: Test output shows:
│   ├─ Expected: element #submit-button exists
│   └─ Received: null
└─ Analysis: Button not rendering

Step 2: EXAMINE CODE
├─ MCP Call: ReadFile("pages/LoginPage.tsx")
├─ MCP Call: ReadFile("components/LoginForm.tsx")
├─ MCP Call: GetCodeStructure("LoginPage.tsx")
├─ Gemini analyzes: Conditional rendering issue
└─ Root cause: Missing username state initialization

Step 3: INSPECT BROWSER
├─ MCP Call: LaunchBrowser({headless: false})
├─ MCP Call: Navigate("http://localhost:3000/login")
├─ MCP Call: TakeScreenshot()
├─ Visual inspection shows: Form only shows password field
└─ Confirms: Input fields not rendering correctly

Step 4: DEBUG IN CONSOLE
├─ MCP Call: ExecuteJavaScript("console.log(document.querySelectorAll('input').length)")
├─ Result: 0 input elements found
├─ MCP Call: GetConsoleLog()
├─ Error found: "Cannot read properties of undefined"
└─ Issue: Form state not initialized

Step 5: FIX THE CODE
├─ MCP Call: EditCode("components/LoginForm.tsx", 
│   "Add useState hook for form state")
├─ Changes:
│   ├─ Add: const [username, setUsername] = useState('')
│   ├─ Add: const [password, setPassword] = useState('')
│   └─ Update: Input elements to use state
├─ LSP Validation: Passes
└─ Build check: npm run build succeeds

Step 6: MANUAL TEST IN BROWSER
├─ MCP Call: Navigate("http://localhost:3000/login")
├─ MCP Call: WaitForElement("input[name='username']", 5000)
├─ MCP Call: FillInput("input[name='username']", "testuser")
├─ MCP Call: FillInput("input[name='password']", "password123")
├─ MCP Call: Click("button#submit-button")
├─ MCP Call: WaitForElement("text=Welcome", 5000)
├─ MCP Call: TakeScreenshot()
├─ Result: Form works, button visible, submission successful
└─ Screenshot shows: Success page rendered

Step 7: RUN TESTS
├─ MCP Call: ExecuteCommand("npm test -- --grep 'login'")
├─ Result: Tests pass
│   ├─ ✓ Login form renders correctly
│   ├─ ✓ Can enter username and password
│   └─ ✓ Submit button navigates to welcome page
├─ Coverage: 100% for LoginForm
└─ All tests: 24/24 passing

Step 8: FINAL VERIFICATION
├─ MCP Call: ExecuteCommand("npm run lint")
├─ Result: No lint errors
├─ MCP Call: ExecuteCommand("npm run type-check")
├─ Result: No type errors
└─ Success: All checks pass

Step 9: PRESENT CHANGES
├─ Cascade Panel shows:
│   └─ components/LoginForm.tsx (modified, +3 lines)
├─ Reasoning:
│   └─ "Added missing useState hooks to initialize form state"
└─ User approves
```

**Key Observations**:
- Agent uses visual feedback (screenshot) to diagnose
- Combines code inspection + browser testing
- Tests changes in actual browser before declaring success
- Uses multiple validation techniques (lint, type-check, tests)
- Single file change but thorough validation

### Workflow Patterns

**Pattern 1: Code Generation → Validation → Refinement**
```
Generate Code
  ↓
Parse & Validate Syntax (LSP)
  ↓
Run Tests
  ↓
If failures: Analyze errors → Generate fix → Repeat
If success: Present to user
```

**Pattern 2: Multi-File Coordination**
```
Identify all affected files
  ↓
Generate changes for each file
  ↓
Validate each file independently (LSP)
  ↓
Run integration tests
  ↓
If conflicts: Resolve → Revalidate
If success: Present all changes atomically
```

**Pattern 3: Browser-Assisted Debugging**
```
Take screenshot
  ↓
Analyze visual state
  ↓
Compare to expected state
  ↓
If mismatch: Inspect DOM → Get console errors
  ↓
Hypothesize root cause
  ↓
Generate fix
  ↓
Test in browser again
  ↓
If still broken: Loop
If fixed: Run unit tests to confirm
```

---

## Browser Automation {#browser}

### Browser Launcher Extension

**Location**: `/resources/app/extensions/antigravity-browser-launcher/`

**Purpose**: Enable agents to control Chrome/Chromium for automated testing

**Architecture**:

```
Agent (via MCP) 
    ↓
Browser Launcher Extension
    ↓
Chrome DevTools Protocol (CDP)
    ↓
Chrome Browser Instance (port 9222)
    ↓
Web Application Being Tested
```

### Available Browser Operations

**Navigation & Page Control**:
- `LaunchBrowser(options)` - Start Chrome instance
- `Navigate(url)` - Go to URL
- `GoBack()`, `GoForward()`, `Reload()` - Navigation
- `CloseBrowser()` - Cleanup

**Visual Inspection**:
- `TakeScreenshot()` - Full page screenshot (base64)
- `RecordSession(duration)` - Video recording
- `GetPageHTML()` - Full DOM as string
- `GetBoundingBox(selector)` - Element position/size

**Interaction**:
- `Click(selector)` - Click element
- `DoubleClick(selector)` - Double click
- `RightClick(selector)` - Context menu
- `FillInput(selector, text)` - Type in input
- `SelectDropdown(selector, value)` - Select option
- `ScrollTo(selector)` - Scroll element into view
- `Drag(from, to)` - Drag and drop
- `Type(text)` - Type in current focus

**Information Gathering**:
- `GetPageTitle()` - Current page title
- `GetURL()` - Current URL
- `GetText(selector)` - Element text content
- `GetInputValue(selector)` - Input field value
- `GetPageContent()` - All visible text
- `ExecuteJavaScript(code)` - Run JS in page context

**State & Debugging**:
- `WaitForElement(selector, timeout)` - Wait for element
- `WaitForNavigation(timeout)` - Wait for page load
- `GetConsoleLog()` - Browser console messages
- `GetNetworkRequests()` - XHR/fetch requests
- `SetViewport(width, height)` - Screen size
- `SetUserAgent(string)` - Custom user agent

### Use Cases

**1. Automated Testing**
```javascript
// Agent generates and executes this scenario
LaunchBrowser()
Navigate("http://app.local/register")
FillInput("input[name='email']", "test@example.com")
FillInput("input[name='password']", "securePass123")
Click("button#register")
WaitForElement("text=Account Created", 5000)
TakeScreenshot()  // Verify success
CloseBrowser()
```

**2. Visual Regression Testing**
```javascript
// Agent captures baseline and compares
LaunchBrowser()
Navigate("http://app.local/dashboard")
SetViewport(1920, 1080)
TakeScreenshot()  // Compare to baseline
// If pixels differ: Analyze diff, report issue
CloseBrowser()
```

**3. End-to-End User Flow**
```javascript
// Agent simulates real user journey
LaunchBrowser()
Navigate("http://shop.local")
Click("a[href='/products']")
WaitForElement(".product-card", 5000)
// Get all products
products = ExecuteJavaScript(
  "document.querySelectorAll('.product-card').length"
)
// Verify: products > 0
CloseBrowser()
```

### Screenshot Analysis & Visual Understanding

**Agent Workflow**:
```
Take Screenshot
    ↓
Encode to Base64 → Send to Gemini
    ↓
Gemini Analyzes:
    ├─ Is button visible?
    ├─ Are all form fields rendered?
    ├─ Are there any visual errors?
    ├─ What text appears where?
    └─ Does layout match expected state?
    ↓
Gemini Returns Analysis:
    ├─ Description of what it sees
    ├─ Any visual anomalies
    └─ Suggested next actions
    ↓
Agent Decides:
    ├─ If success: Confirm task complete
    ├─ If unexpected: Debug further
    └─ If error: Generate fix
```

---


---

## File Structure {#filestructure}

### Complete Directory Layout

```
Antigravity/ (Root Installation)
├── Binary Executables (Linux/Electron)
│   ├── antigravity              # Main application binary
│   ├── chrome-sandbox           # Chromium sandbox
│   ├── chrome_crashpad_handler  # Crash reporting
│   ├── libEGL.so                # OpenGL library
│   ├── libGLESv2.so             # OpenGL ES library
│   ├── libffmpeg.so             # Codec library
│   └── libvk_swiftshader.so     # Vulkan rendering
│
├── resources/
│   ├── app/                     # Main application code
│   │   ├── LICENSE.txt          # MIT License
│   │   ├── ThirdPartyNotices.txt # Attribution
│   │   ├── package.json         # Root dependencies
│   │   ├── product.json         # Product metadata
│   │   ├── extensions/          # ✓ ALL EXTENSIONS HERE
│   │   └── out/                 # ✓ COMPILED OUTPUT
│   │
│   ├── linux/
│   │   └── code.png             # Linux app icon
│   │
│   └── chrome_*.pak             # Chromium UI resources
│
└── completions/                 # Shell integration
    ├── bash/antigravity
    └── zsh/_antigravity
```

### Extensions Directory (CRITICAL)

```
resources/app/extensions/

1. CORE AI EXTENSION
   antigravity/
   ├── package.json              # Extension metadata
   ├── eslint.config.mjs         # Linting rules
   ├── postcss.config.js         # CSS processing
   ├── tailwind.config.js        # Tailwind CSS config
   ├── webview.webpack.config.js # Webview bundler config
   │
   ├── bin/
   │   ├── fd                    # Fast file finder utility
   │   ├── fd.LICENSE
   │   └── language_server_linux_x64  # ✓ LSP BINARY
   │
   ├── schemas/                  # ✓ CRITICAL
   │   ├── mcp_config.schema.json        # ✓ MCP TOOL DEFINITIONS
   │   └── mcp_config.schema.json.IMPORTANT
   │
   ├── cascade-panel.html        # ✓ CASCADE PANEL UI
   ├── auth-success-jetski.html  # ✓ OAUTH SUCCESS PAGE
   │
   ├── customEditor/
   │   ├── utils.js              # Editor utilities
   │   └── media/
   │       ├── ruleEditor/       # ✓ RULE EDITOR
   │       │   ├── ruleEditor.js
   │       │   └── ruleEditor.css
   │       └── workflowEditor/   # ✓ WORKFLOW EDITOR
   │           ├── workflowEditor.js
   │           └── workflowEditor.css
   │
   ├── out/
   │   ├── main.js               # Compiled extension code
   │   └── media/
   │       ├── chat.js           # ✓ CHAT INTERFACE
   │       └── chat.js.LICENSE.txt
   │
   └── assets/
       ├── astro.png
       ├── auth/
       │   └── google_signin.svg  # Google OAuth button
       └── theme/
           ├── dark.png, light.png
           ├── solarized-dark.png, solarized-light.png

2. BROWSER AUTOMATION EXTENSION
   antigravity-browser-launcher/
   ├── package.json
   ├── script/
   │   ├── launchChrome.js       # Browser startup
   │   └── kill-chrome-9222.sh   # Cleanup
   ├── webpack.config.js         # Build config
   └── src/
       └── index.js

3. CODE EXECUTION EXTENSION
   antigravity-code-executor/
   ├── package.json
   ├── src/
   │   ├── executor.js           # Sandboxed execution
   │   └── validator.js          # Code validation
   └── scripts/
       └── runCode.sh

4. REMOTE SSH EXTENSION
   antigravity-remote-openssh/
   ├── package.json
   ├── scripts/
   │   ├── launchSSHAskpass.sh   # SSH passphrase prompt (Unix)
   │   ├── launchSSHAskpass.bat  # SSH passphrase prompt (Windows)
   │   ├── sshAskClient.js       # ✓ SSH CREDENTIAL HANDLING
   │   └── terminateProcess.sh   # Cleanup
   └── media/
       └── icon.png

5. DEV CONTAINERS EXTENSION
   antigravity-dev-containers/
   ├── package.json
   ├── src/
   │   ├── container.js          # Container lifecycle
   │   └── docker-compose.js     # Docker integration
   └── scripts/
       ├── forwarder.js          # ✓ PORT FORWARDING
       └── terminateProcess.sh

6. WSL EXTENSION
   antigravity-remote-wsl/
   ├── package.json
   └── src/
       └── wsl.js                # WSL integration

7. LANGUAGE SUPPORT (60+ LANGUAGES)
   language-html/
   language-css/
   language-javascript/
   language-typescript/
   language-python/
   language-go/
   language-rust/
   ... (one per language)
   
   Each contains:
   ├── package.json
   ├── language-configuration.json
   ├── syntaxes/
   │   └── *.tmLanguage.json     # TextMate grammar
   └── snippets/
       └── *.code-snippets       # Code templates

8. LANGUAGE FEATURES (SERVER SUPPORT)
   css-language-features/
   ├── server/  # Language server implementation
   └── client/  # IDE integration
   
   html-language-features/
   └── snippets for HTML
   
   typescript-language-features/
   ├── src/
   │   ├── languageProvider.ts
   │   └── tsserver.ts
   
   js-debug/                      # ✓ JAVASCRIPT DEBUGGER
   ├── src/
   │   ├── debugAdapter.ts        # DAP implementation
   │   └── cdpConnection.ts       # Chrome DevTools Protocol
   └── media/
       ├── icons/
       └── docs/

9. THEME EXTENSIONS (15+ THEMES)
   theme-defaults/
   ├── themes/
   │   ├── light_vs.json
   │   ├── dark_vs.json
   │   ├── light_modern.json
   │   └── dark_modern.json
   
   theme-seti/                    # Popular icon theme
   ├── icons/
   │   ├── icons.json
   │   └── seti.woff              # Custom font
   
   theme-symbols/
   ├── icons/
   └── symbols.json
   
   Individual color themes:
   ├── theme-abyss/
   ├── theme-monokai/
   ├── theme-quiet/
   ├── theme-solarized/
   ├── theme-synthwave/
   └── theme-tokyo-night/

10. OTHER EXTENSIONS
    git/                          # Git integration
    ├── src/
    │   ├── commands.ts
    │   └── diff.ts
    
    github/                       # GitHub integration
    ├── media/
    │   └── markdown.css
    
    markdown-basics/              # Markdown syntax
    markdown-language-features/   # Markdown preview
    markdown-math/                # LaTeX math
    
    emmet/                        # HTML/CSS abbreviations
    git-base/                     # Git symbols
    
    media-preview/                # Image/video preview
    simple-browser/               # Built-in browser
    notebook-renderers/           # Jupyter support
    terminal-suggest/             # Command suggestions
```

### Compiled Output Structure

```
resources/app/out/

├── main.js                       # Electron main process
├── cli.js                        # CLI entry point
├── bootstrap-fork.js             # Process forking
│
├── jetskiAgent/                  # ✓ JETSKI AGENT
│   ├── main.js                   # Agent logic
│   └── main.css                  # Agent UI styling
│
├── CSS Bundles
│   ├── jetskiMain.tailwind.css   # Jetski styles
│   └── tw-base.tailwind.css      # Base utilities
│
├── nls.keys.json                 # Localization keys
├── nls.messages.json             # Translations
│
├── media/
│   ├── SVG Icons
│   │   ├── jetski-logo-*.svg
│   │   ├── google.svg, github.svg, apple-*.svg
│   │   └── code-icon.svg
│   │
│   ├── Theme Previews
│   │   ├── dark.png, light.png
│   │   ├── solarized-*.png
│   │   └── tokyo-night*.png
│   │
│   └── codicon.ttf               # VS Code icon font
│
├── vs/ (VS Code Workbench)
│   ├── base/                     # Foundation utilities
│   ├── code/
│   │   ├── electron-browser/     # ✓ MAIN WINDOW
│   │   │   ├── workbench.html    # Main window HTML
│   │   │   ├── workbench.js      # Main controller
│   │   │   ├── workbench-jetski-agent.html  # ✓ AGENT WINDOW
│   │   │   └── jetskiAgent.js    # Agent controller
│   │   ├── electron-utility/     # Utility processes
│   │   └── node/
│   │       └── cliProcessMain.js # CLI handler
│   │
│   ├── editor/                   # Monaco Editor
│   │   └── common/
│   │       ├── languages/
│   │       │   ├── highlights/   # tree-sitter grammars
│   │       │   │   └── *.scm files
│   │       │   └── injections/   # Language injection rules
│   │       └── services/
│   │           └── editorWebWorkerMain.js
│   │
│   ├── platform/
│   │   ├── accessibilitySignal/browser/media/
│   │   │   └── 60+ .mp3 audio files (success, error, etc.)
│   │   ├── browserOnboarding/
│   │   │   └── static/
│   │   │       ├── browserLanding.html
│   │   │       ├── browserOnboarding.html
│   │   │       └── browser.css
│   │   ├── files/node/           # File watcher
│   │   ├── terminal/node/        # Terminal PTY
│   │   └── profiling/            # Performance tools
│   │
│   ├── workbench/
│   │   ├── api/
│   │   │   ├── node/             # Extension host
│   │   │   └── worker/           # Web worker
│   │   ├── contrib/
│   │   │   ├── debug/            # ✓ DEBUGGER UI
│   │   │   │   ├── media/
│   │   │   │   │   ├── continue.png, pause.png
│   │   │   │   │   ├── step-*.png
│   │   │   │   │   └── stop.png
│   │   │   │   └── node/
│   │   │   │
│   │   │   ├── extensions/       # Extension manager
│   │   │   ├── terminal/         # Terminal UI
│   │   │   ├── notebook/         # Jupyter support
│   │   │   ├── output/           # Output panel
│   │   │   ├── webview/          # Webview support
│   │   │   │
│   │   │   └── welcomeGettingStarted/
│   │   │       └── common/media/
│   │   │           ├── Feature icons (20+)
│   │   │           ├── Theme previews
│   │   │           └── Notebook theme previews
│   │   │
│   │   ├── services/
│   │   │   ├── extensions/worker/
│   │   │   ├── languageDetection/browser/
│   │   │   ├── search/worker/
│   │   │   └── textMate/browser/
│   │   │
│   │   └── workbench.desktop.main.js
│   │
│   └── ... (more VS Code internals)
│
└── vscode-dts/
    └── vscode.d.ts               # VS Code API types
```

---


## Configuration & Tools {#configuration}

### MCP (Model Context Protocol) Configuration

**Files**:
- `extensions/antigravity/schemas/mcp_config.schema.json`
- `extensions/antigravity/schemas/mcp_config.schema.json.IMPORTANT`

**Purpose**: JSON Schema that validates all tool calls made by Gemini 3 Pro

**Example MCP Schema Structure**:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MCP Tool Definitions",
  "type": "object",
  "properties": {
    "tools": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Tool name (e.g., 'EditCode')"
          },
          "description": {
            "type": "string",
            "description": "What the tool does"
          },
          "inputSchema": {
            "type": "object",
            "description": "Parameters schema",
            "properties": {
              "type": "string",
              "properties": { ... },
              "required": [ ... ]
            }
          },
          "outputSchema": {
            "type": "object",
            "description": "Return value schema"
          }
        },
        "required": ["name", "description", "inputSchema"]
      }
    },
    "resources": {
      "type": "array",
      "description": "Available resources (files, APIs, etc.)"
    }
  }
}
```

**How It Works**:

```
Gemini Generates:
{
  "toolCall": {
    "name": "EditCode",
    "params": {
      "file": "src/app.js",
      "content": "..."
    }
  }
}
    ↓
IDE Validates Against Schema:
  ✓ Is tool name in allowed tools?
  ✓ Are all required parameters present?
  ✓ Are parameter types correct?
  ✓ Are values within constraints?
    ↓
If Valid: Execute Tool
If Invalid: Return error to Gemini for correction
```

### Extension Package.json

**Location**: `extensions/antigravity/package.json`

**Key Configuration Properties**:

```json
{
  "name": "antigravity",
  "version": "1.0.0",
  "description": "Antigravity: Agent-first IDE",
  
  "main": "out/extension.js",
  "browser": "out/extension.browser.js",
  
  "contributes": {
    "commands": [
      {
        "command": "jetski.agent.chat",
        "title": "Open Jetski Chat"
      }
    ],
    "customEditors": [
      {
        "viewType": "cascadePanel",
        "displayName": "Cascade Panel",
        "selector": [
          { "filenamePattern": "*.cascade" }
        ]
      }
    ],
    "keybindings": [
      {
        "command": "jetski.agent.chat",
        "key": "ctrl+shift+j",
        "when": "editorFocus"
      }
    ],
    "views": {
      "jetski": [
        {
          "id": "jetski.agentPanel",
          "name": "Jetski Agent",
          "type": "webview"
        }
      ]
    }
  },
  
  "activationEvents": [
    "onStartupFinished",
    "onCommand:jetski.agent.chat"
  ],
  
  "dependencies": {
    "vscode": "latest",
    "gemini-sdk": "latest"
  },
  
  "devDependencies": {
    "webpack": "^5.0.0",
    "tailwindcss": "^3.0.0",
    "postcss": "^8.0.0",
    "eslint": "^8.0.0"
  },
  
  "scripts": {
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch",
    "lint": "eslint src/",
    "type-check": "tsc --noEmit"
  }
}
```

### Build Configuration Files

#### webpack.config.js (Extension Bundling)

```javascript
module.exports = {
  mode: 'production',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader'
      }
    ]
  }
};
```

#### tailwind.config.js (Styling)

```javascript
module.exports = {
  content: [
    './src/**/*.{vue,jsx,tsx,html}',
    './cascade-panel.html'
  ],
  theme: {
    extend: {
      colors: {
        jetski: {
          primary: '#4285F4',    // Google blue
          accent: '#34A853'      // Google green
        }
      }
    }
  },
  plugins: []
};
```

#### postcss.config.js (CSS Processing)

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

### Key Binary Executables

#### Language Server (LSP)

**Location**: `extensions/antigravity/bin/language_server_linux_x64`

**Purpose**: Provides code intelligence to agents

**Capabilities**:
- Code completion suggestions
- Go to definition
- Find references
- Rename refactoring
- Hover documentation
- Diagnostic errors
- Code formatting
- Symbol navigation

**Usage by Agent**:
```
Agent: "Find where the login function is defined"
    ↓
LSP Query: RequestDefinition("login", file="auth.js")
    ↓
LSP Response: {file: "src/services/auth.js", line: 42}
    ↓
Agent: Opens file and analyzes
```

#### File Finder (fd)

**Location**: `extensions/antigravity/bin/fd`

**Purpose**: Fast file searching for agent codebase exploration

**Usage by Agent**:
```
Agent: "Find all test files"
    ↓
Command: fd -e test.js src/
    ↓
Result: [src/auth.test.js, src/api.test.js, ...]
    ↓
Agent: Analyzes test structure
```

**Common Patterns**:
- `fd pattern src/` - Find files matching pattern
- `fd -e .ts src/` - Find all TypeScript files
- `fd -x cmd {} \;` - Execute command on each match

### Gemini 3 Pro Configuration

**Environment Variables Needed**:
```bash
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL_ID=gemini-3-pro
GEMINI_TEMPERATURE=0.7
GEMINI_MAX_TOKENS=4096
```

**System Prompt Template** (inferred):

```
You are Jetski, an expert code agent integrated into the Antigravity IDE.

CAPABILITIES:
- Read and write code files
- Execute terminal commands
- Control browsers via Chrome DevTools Protocol
- Analyze code semantics using Language Server Protocol
- Take screenshots and analyze visual layouts
- Run tests and validate code

CONSTRAINTS:
- Always validate code before execution
- Ask for clarification if intent is ambiguous
- Prefer safe refactorings over aggressive changes
- Maintain existing code style and patterns
- Never delete files without explicit confirmation
- Report errors clearly and suggest fixes

TOOLS AVAILABLE:
[MCP Tool Definitions from schema]

CONTEXT PROVIDED:
- Current codebase structure
- Open files and cursor position
- Terminal output history
- Recent error messages
- Browser screenshots

YOUR TASK:
Accomplish the user's goal autonomously while:
1. Planning multi-step approach
2. Executing steps sequentially
3. Validating results at each step
4. Recovering gracefully from errors
5. Explaining reasoning to user
```

---

## Execution Models {#execution}

### Local Execution

**Architecture**:
```
Electron App (Main Process)
    ↓
Jetski Agent (in-process)
    ↓
System Resources:
    ├─ File System (direct read/write)
    ├─ Terminal PTY (shell commands)
    ├─ Child Processes (npm, git, etc.)
    └─ Browser Subprocess (Chrome via CDP)
```

**Advantages**:
- Fastest execution
- Direct access to all system resources
- No network latency
- Offline capability

**Disadvantages**:
- Limited isolation
- Can affect host machine
- Security concerns with untrusted code

### Dev Container Execution

**Extension**: `antigravity-dev-containers/`

**Architecture**:
```
Electron App
    ↓
Dev Container Manager
    ↓
Docker/Podman
    ↓
Isolated Container:
    ├─ Custom Node/Python/Go version
    ├─ Project dependencies
    ├─ Build tools
    └─ Test framework
    ↓
Agent executes commands inside container
```

**Workflow**:
```
1. Detect devcontainer.json
2. Build container image
3. Launch container with mounted project
4. Execute agent commands inside
5. Stream results back to IDE
6. Cleanup: Stop container
```

**Configuration** (`devcontainer.json`):
```json
{
  "name": "Node with Docker",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:18",
  "features": {
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "forwardPorts": [3000, 5432],
  "postCreateCommand": "npm install"
}
```

**Agent Execution Inside Container**:
```
MCP Call: ExecuteCommand("npm run build")
    ↓
Forwarded to Container PTY
    ↓
npm build runs inside isolated environment
    ↓
Results streamed back to IDE
    ↓
Dependencies/binaries isolated from host
```

### Remote SSH Execution

**Extension**: `antigravity-remote-openssh/`

**Architecture**:
```
Electron App
    ↓
SSH Connection Manager
    ↓
SSH Server (remote machine):
    ├─ SSH Daemon listening on port 22
    ├─ Agent process spawned remotely
    ├─ File system access (SFTP)
    ├─ Terminal access (PTY over SSH)
    └─ Browser control (X11 forwarding or headless)
    ↓
Agent executes on remote machine
```

**Authentication Flow**:

```
User clicks "Connect to SSH Server"
    ↓
SSH Connection Dialog
    ├─ Host: user@example.com
    ├─ Port: 22
    ├─ Auth: Password / SSH Key / Agent
    └─ Passphrase (optional)
    ↓
Script: launchSSHAskpass.sh (Linux/Mac)
         or launchSSHAskpass.bat (Windows)
    ↓
Opens passphrase prompt dialog
    ↓
Script: sshAskClient.js handles credential
    ↓
SSH connection established
    ↓
Agent ready for remote execution
```

**Tool Execution Over SSH**:
```
Agent: "npm run build"
    ↓
SSH Executor: ssh user@host "cd /project && npm run build"
    ↓
Remote stdout/stderr streamed back
    ↓
Results displayed in IDE
```

**Supported Operations**:
- File read/write via SFTP
- Command execution via SSH PTY
- Environment variable access
- Directory navigation
- Process management

### WSL Execution

**Extension**: `antigravity-remote-wsl/`

**Architecture**:
```
Windows IDE (Electron)
    ↓
WSL Manager
    ↓
WSL 2 Distro (Ubuntu/Debian):
    ├─ Integrated Linux kernel
    ├─ Full Linux environment
    ├─ Native performance (direct disk access)
    └─ Seamless interop with Windows
    ↓
Agent executes in Linux environment
```

**Why WSL?**
- Developers often use Linux tools on Windows
- Docker, Node, Python better supported in WSL
- Better performance than VM-based solutions
- Transparent file access between Windows and WSL

**Connection Flow**:
```
IDE detects WSL installation
    ↓
Launch WSL distro (wsl.exe)
    ↓
Execute agent commands in WSL shell
    ↓
Results streamed back to IDE
    ↓
Files automatically synced via \\wsl$ network share
```

### Execution Decision Logic

**Agent Decides Which Mode Based On**:

```
if (project.hasDevcontainer) {
  use Dev Container Execution  // Most isolated
} else if (user.connectedToSSH) {
  use SSH Execution  // Remote development
} else if (platform === "Windows" && wslInstalled) {
  use WSL Execution  // Linux tools on Windows
} else {
  use Local Execution  // Default
}
```

---

## Key Technical Flows

### Flow 1: User Types Prompt → Execution → Results

```
┌─────────────────────────────────────────────────────┐
│ USER PROMPT                                         │
│ "Add error handling to the API routes"              │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ CHAT INTERFACE (chat.js)                            │
│ - Parse user input                                  │
│ - Inject context (open files, errors)              │
│ - Gather codebase structure                         │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ SEND TO GEMINI 3 PRO                                │
│ {                                                   │
│   "system": "You are code agent...",               │
│   "context": {...codebase info...},                │
│   "prompt": "Add error handling...",               │
│   "tools": [...MCP tool definitions...]            │
│ }                                                   │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ GEMINI RESPONDS                                     │
│ {                                                   │
│   "reasoning": "I see 3 API routes...",            │
│   "toolCalls": [                                    │
│     {"tool": "EditCode", "params": {...}},         │
│     {"tool": "ExecuteCommand", "params": {...}},   │
│     {"tool": "TakeScreenshot", "params": {...}}    │
│   ]                                                 │
│ }                                                   │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ VALIDATE TOOL CALLS                                 │
│ - Check schema (mcp_config.schema.json)           │
│ - Verify parameters                                │
│ - Check permissions                                │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ EXECUTE TOOLS                                       │
│ 1. EditCode("src/routes/api.js", {...})           │
│    └─ LSP validates syntax                         │
│    └─ Results: File modified                       │
│                                                    │
│ 2. ExecuteCommand("npm run lint")                  │
│    └─ Terminal executes                           │
│    └─ Results: Lint passed                        │
│                                                    │
│ 3. TakeScreenshot()                                │
│    └─ Browser captures                            │
│    └─ Results: image.png                          │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ COLLECT & SEND RESULTS BACK TO GEMINI              │
│ {                                                   │
│   "toolResults": [                                  │
│     {"id": "call_1", "success": true},             │
│     {"id": "call_2", "stdout": "✓ Linting done"}, │
│     {"id": "call_3", "image": "base64..."}        │
│   ]                                                 │
│ }                                                   │
└──────────────┬──────────────────────────────────────┘
               ↓
        (If multi-step: Loop back to Gemini)
               ↓
┌─────────────────────────────────────────────────────┐
│ FINAL RESPONSE FROM GEMINI                          │
│ "I've added comprehensive error handling to all    │
│  API routes. Changes made: src/routes/api.js (12   │
│  new lines). All tests pass. Linting complete."    │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ VISUALIZE IN CASCADE PANEL                          │
│ ┌─────────────────────────────────────────────┐   │
│ │ src/routes/api.js (modified)                │   │
│ │ ✓ Completed                                 │   │
│ │                                             │   │
│ │ @@ -42,3 +42,15 @@                        │   │
│ │  async function handleUserRequest(req) {   │   │
│ │ + try {                                     │   │
│ │ +   const result = await db.query(...);    │   │
│ │ + } catch (error) {                         │   │
│ │ +   return res.status(500).json({...});    │   │
│ │ + }                                         │   │
│ │                                             │   │
│ │ Agent Reasoning:                            │   │
│ │ "Added error handling to prevent unhandled │   │
│ │  promise rejections and provide meaningful │   │
│ │  error responses to clients."               │   │
│ └─────────────────────────────────────────────┘   │
│                                                    │
│ [ Accept All ] [ Reject ] [ Request Changes ]      │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ USER CLICKS "Accept All"                            │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ APPLY CHANGES ATOMICALLY                            │
│ - Write all files to disk                          │
│ - Update undo/redo stack                           │
│ - Refresh editor views                             │
│ - Generate git diff                                │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ SUCCESS MESSAGE IN CHAT                             │
│ "✓ Changes applied successfully"                   │
│ "Modified: src/routes/api.js"                      │
│ "Linting: Passed"                                  │
│ "Ready for next task"                              │
└─────────────────────────────────────────────────────┘
```

### Flow 2: Browser-Based Testing & Validation

```
┌─────────────────────────────────────────────────────┐
│ AGENT TASK: Test login form functionality          │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ MCP: LaunchBrowser()                                │
│ └─ Chrome launches on localhost:3000                │
│ └─ DevTools protocol listening on :9222            │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ MCP: Navigate("http://localhost:3000/login")       │
│ └─ Browser loads page                              │
│ └─ Waits for network idle                          │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ MCP: TakeScreenshot()                               │
│ └─ Captures full page                              │
│ └─ Converts to base64                              │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ SEND SCREENSHOT TO GEMINI                           │
│ "Analyze this screenshot: Is the login form        │
│  properly rendered? Are all fields visible?"       │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ GEMINI VISION ANALYZES                              │
│ "I see a login form with email and password        │
│  fields. Both appear correctly rendered."           │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ AGENT FILLS FORM                                    │
│ MCP: FillInput("input[type='email']", "test@...")  │
│ MCP: FillInput("input[type='password']", "pwd")    │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ MCP: Click("button[type='submit']")                │
│ └─ Submits form                                    │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ MCP: WaitForElement(".dashboard", 5000)            │
│ └─ Waits up to 5 seconds for success page          │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ MCP: TakeScreenshot()                               │
│ └─ Captures result page                            │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ GEMINI ANALYZES RESULT                              │
│ "Success! The form submitted and redirected to     │
│  the dashboard. Login functionality works."         │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ MCP: CloseBrowser()                                 │
│ └─ Cleanup                                         │
└──────────────┬──────────────────────────────────────┘
               ↓
┌─────────────────────────────────────────────────────┐
│ AGENT REPORTS SUCCESS                               │
│ ✓ Login form renders correctly                     │
│ ✓ Form submission works                            │
│ ✓ Redirects to dashboard                           │
└─────────────────────────────────────────────────────┘
```

---


## Key Integration Points

### 1. Chat Interface ↔ Gemini 3 Pro

**File**: `extensions/antigravity/out/media/chat.js`

**Responsibility**:
- Capture user input
- Inject contextual information
- Send to Gemini with system prompt
- Stream responses back to user
- Display tool execution status
- Handle errors gracefully

**Context Injection Strategy**:
```javascript
// chat.js pseudo-code
function sendPromptToGemini(userPrompt) {
  const context = {
    codebaseStructure: getProjectStructure(),
    currentFile: editor.getActiveFile(),
    selectedText: editor.getSelection(),
    recentErrors: diagnostics.getErrors(),
    gitStatus: git.getStatus(),
    openTerminalOutput: terminal.getLastOutput(),
    currentBrowserScreenshot: browser.takeScreenshot()
  };
  
  const systemPrompt = `You are Jetski, an expert code agent...`;
  
  const request = {
    system: systemPrompt,
    context: context,
    prompt: userPrompt,
    tools: mcpToolDefinitions
  };
  
  return geminiApi.chat(request);
}
```

### 2. Cascade Panel ↔ Agent Executor

**File**: `extensions/antigravity/cascade-panel.html`

**Responsibility**:
- Receive file modification events from agent
- Build unified diff view
- Track agent reasoning per file
- Present unified UI for approval
- Handle atomic application of changes

**Event Flow**:
```
Agent executes EditCode("file.js", content)
    ↓
IDE emits: fileModified { file, before, after, reasoning }
    ↓
Cascade Panel receives event
    ↓
Panel generates diff
    ↓
Panel adds to internal state
    ↓
Panel re-renders with new change
    ↓
User sees updated preview
    ↓
User clicks "Apply All"
    ↓
Cascade Panel triggers: applyChanges()
    ↓
All files written atomically
```

### 3. Agent ↔ MCP Tool Executor

**File**: `extensions/antigravity/jetskiAgent/main.js`

**Responsibility**:
- Parse Gemini tool call responses
- Validate against MCP schema
- Execute corresponding tool
- Capture results
- Feed back to Gemini for next step

**Tool Execution Pipeline**:
```javascript
// Pseudo-code: jetskiAgent/main.js
async function executeMCPToolCall(toolCall) {
  // 1. Validate against schema
  const validation = mcp.validateTool(
    toolCall.name, 
    toolCall.params,
    schemaDefinition
  );
  
  if (!validation.valid) {
    return gemini.error(`Invalid tool call: ${validation.error}`);
  }
  
  // 2. Execute appropriate tool
  const executor = toolExecutors[toolCall.name];
  const result = await executor(toolCall.params);
  
  // 3. Return results to Gemini
  return {
    toolCallId: toolCall.id,
    success: result.success,
    data: result.data,
    error: result.error
  };
}
```

### 4. LSP ↔ Code Understanding

**Binary**: `extensions/antigravity/bin/language_server_linux_x64`

**Responsibility**:
- Analyze code structure
- Provide completion suggestions
- Validate syntax
- Find definitions and references
- Support refactoring operations

**Usage Pattern**:
```
Agent: "Rename 'login' function to 'authenticate'"
    ↓
LSP Query: findAllReferences("login")
    ↓
LSP Response: [
      {file: "auth.js", line: 42},
      {file: "api.js", line: 156},
      {file: "types.d.ts", line: 8}
    ]
    ↓
Agent: Updates all 3 locations atomically
    ↓
LSP Validation: Confirms no syntax errors
    ↓
Success
```

### 5. Browser Launcher ↔ Chrome DevTools Protocol

**Extension**: `antigravity-browser-launcher/`

**Responsibility**:
- Launch Chrome with debugging enabled
- Maintain WebSocket connection to CDP
- Forward MCP tool calls to browser
- Stream screenshots and console logs back
- Cleanup on completion

**Protocol Flow**:
```
MCP: TakeScreenshot()
    ↓
Browser Launcher sends CDP command
    ↓
Chrome: Page.captureScreenshot()
    ↓
Chrome returns PNG base64
    ↓
Browser Launcher decodes and returns to Agent
    ↓
Agent sends to Gemini for vision analysis
```

### 6. File System Tools ↔ Undo/Redo

**Integration Point**: VS Code editor undo stack

**Key Challenge**: 
- Agent makes changes to files directly
- User expects full undo capability
- Need to track all changes per agent session

**Solution**:
```
Before agent starts:
  ↓
Create snapshot of all project files
  ↓
Enable undo recording mode
    ↓
Agent makes changes via MCP
    ↓
Each MCP: EditCode() call triggers VSCode edit
    ↓
VSCode records in undo stack
    ↓
Cascade Panel shows pending changes
    ↓
User approves
    ↓
Undo stack frozen (changes committed)
    ↓
User can still undo with Ctrl+Z
```

---

## Summary: What Makes Antigravity Special

### 1. Agent-First Architecture
Instead of: "Ask AI for suggestion → Review suggestion → Apply manually"
**Antigravity does**: "Tell agent what to do → Agent plans, executes, validates → Review complete work → Apply atomically"

### 2. Multi-Tool Integration
Agents don't just generate code; they:
- ✓ Read existing code with full understanding (LSP)
- ✓ Write changes with syntax validation
- ✓ Run tests immediately
- ✓ Control browsers for end-to-end testing
- ✓ Execute terminal commands
- ✓ Analyze screenshots for visual understanding

### 3. Unified Approval Workflow
**Cascade Panel** shows:
- All affected files in one place
- Detailed diffs with context
- Agent reasoning for each change
- Line-by-line review capability
- Accept/reject granularly or atomically

### 4. Safe Execution
Multiple layers of safety:
- MCP schema validation (wrong tool calls blocked)
- LSP syntax validation (broken code caught early)
- Test suite execution (regressions detected)
- Dev containers (isolated execution)
- User approval gate (critical decisions verified)

### 5. Parallel Agent Execution
Agents can work on different tasks simultaneously:
- Agent 1: Adding authentication feature
- Agent 2: Fixing styling bugs
- Agent 3: Writing tests

Without stepping on each other's toes.

### 6. Context-Aware Planning
Agents understand:
- Current codebase structure
- Existing patterns and conventions
- Build system and test framework
- Error messages and failing tests
- Project dependencies
- Team's coding style

### 7. Visual Understanding
Agents can:
- See what the app looks like (screenshots)
- Detect visual regressions
- Understand UI layouts
- Verify their changes work visually

### 8. Recovery & Iteration
When something fails:
- Agent analyzes error message
- Agent hypothesizes root cause
- Agent generates fix
- Agent re-validates
- Agent loops until success

No "I don't know, ask a human" moments (unless truly ambiguous).

---

## Mapping to SwarmIDE

When implementing agent capabilities in SwarmIDE, focus on:

### Must-Have Components
1. **Chat Interface** - Natural language input to agents
2. **Cascade Panel** - Multi-file change visualization
3. **Jetski Agent** - Autonomous agent orchestration
4. **MCP Integration** - Tool definitions and validation
5. **LSP Integration** - Code understanding
6. **Browser Launcher** - Automated browser control
7. **Terminal Integration** - Command execution

### Must-Have Features
1. **Autonomous Planning** - Multi-step task decomposition
2. **Validation** - LSP checks, syntax validation, test running
3. **Screenshot Analysis** - Visual understanding via Gemini
4. **Atomic Changes** - All-or-nothing file application
5. **Progress Visualization** - Show agent thinking/executing
6. **Approval Workflow** - User review before applying
7. **Undo Integration** - Full reversibility

### Optional But Powerful
1. **Dev Container Support** - Isolated execution
2. **SSH Support** - Remote agent execution
3. **Multi-Agent Coordination** - Parallel task execution
4. **Workflow Composer** - Visual workflow builder
5. **Rule Engine** - Automation triggers

---

## Technical Debt & Considerations

### Challenges in Implementation

1. **Context Window Management**
   - Large codebases exceed Gemini token limits
   - Need smart context selection/summarization
   - Solution: Semantic search for relevant files

2. **Deterministic Tool Execution**
   - CLI tools have different output across systems
   - Network can be flaky
   - Solution: Retry logic, output normalization

3. **State Consistency**
   - Agent makes changes to disk while user edits
   - Conflicts possible
   - Solution: File watching with merge conflict resolution

4. **Security**
   - Agents execute arbitrary commands
   - Could delete files, leak secrets
   - Solution: Sandboxing, allowlisting dangerous commands

5. **Performance**
   - Round-trips to Gemini API add latency
   - Multiple file operations can be slow
   - Solution: Batch operations, local inference for simple tasks

---

## File Size Reference

Key files to be aware of:

```
Antigravity Binary: ~200MB (Electron + Chromium)
Resources: ~500MB (extensions, themes, language support)

Within that:
- Chrome executables: ~100MB
- Language servers & tools: ~50MB
- Extensions & themes: ~200MB
- UI resources (icons, fonts): ~50MB
```

For SwarmIDE, expect similar scale if including browser automation and language servers.

---

## Conclusion

Antigravity represents the next evolution of AI-assisted development:

**Past**: AI as suggestion engine (passive)
**Present (Antigravity)**: AI as agent (active, autonomous)
**Future**: AI + Human teams (collaborative)

The key innovation is **trust through transparency**:
- Agents show their work in the Cascade Panel
- Users can review before applying
- But agents are trusted to plan and execute autonomously
- Validation happens continuously (not just at the end)

This allows developers to delegate entire features to agents while remaining in control.

