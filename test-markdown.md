# Markdown Preview Test

This is a **test** of the markdown preview feature with *mermaid* support.

## Features

- Syntax highlighting
- Live preview
- Mermaid diagrams
- Code blocks

## Code Example

```javascript
function hello() {
  console.log("Hello, World!");
}
```

## Mermaid Diagram

```mermaid
graph TD
    A[Start] --> B{Is it?}
    B -->|Yes| C[OK]
    C --> D[Rethink]
    D --> B
    B ---->|No| E[End]
```

## Another Diagram

```mermaid
sequenceDiagram
    participant User
    participant IDE
    participant Preview
    User->>IDE: Edit Markdown
    IDE->>Preview: Update Content
    Preview->>Preview: Render Mermaid
    Preview->>User: Show Result
```

## Table Example

| Feature | Status |
|---------|--------|
| Markdown | ✅ |
| Mermaid | ✅ |
| Live Preview | ✅ |

> This is a blockquote to test styling

**End of test document**
