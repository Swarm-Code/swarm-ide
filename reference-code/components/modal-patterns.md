# Modal & Dialog Patterns Reference

Complete documentation of modal dialog patterns, animations, and accessibility features used in the Apple App Store.

---

## Table of Contents

1. [Modal Component](#modal-component)
2. [Dialog Polyfill](#dialog-polyfill)
3. [Accessibility Features](#accessibility-features)
4. [Focus Management](#focus-management)
5. [Locale Switcher Modal](#locale-switcher-modal)

---

## Modal Component

### Base Modal Implementation

**File**: `shared/components/src/components/Modal/Modal.svelte`

A flexible modal component using the native `<dialog>` element with polyfill support.

**Props**:

```typescript
export let modalTriggerElement: HTMLElement | null;
export let error: boolean = false;
export let dialogId: string = '';
export let dialogClassNames: string = '';
export let disableScrim: boolean = false;
export let showOnMount: boolean = false;
export let preventDefaultClose: boolean = false;
export let ariaLabelledBy: string | null = null;
export let ariaLabel: string | null = null;
```

---

### Component Structure

```svelte
<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';
    
    const dispatch = createEventDispatcher();
    
    let dialogElement: HTMLDialogElement;
    let needsPolyfill: boolean = false;
    let isDialogInShadow: boolean;
    let ariaHidden: boolean = true;
    
    export function showModal() {
        // noscroll class ensures background doesn't scroll
        document.body.classList.add('noscroll');
        
        // Append to body if not in shadow DOM (polyfill)
        if (needsPolyfill) {
            isDialogInShadow = isInShadow(dialogElement);
            if (!isDialogInShadow) {
                document.body.appendChild(dialogElement);
            }
        }
        
        ariaHidden = false;
        dialogElement.showModal();
    }
    
    export function close() {
        document.body.classList.remove('noscroll');
        
        // Remove from body if appended there
        if (needsPolyfill && !isDialogInShadow) {
            document.body.removeChild(dialogElement);
        }
        
        ariaHidden = true;
        dialogElement.close();
        modalTriggerElement?.focus();
    }
    
    function handleClose(e: Event) {
        if (preventDefaultClose) {
            e.preventDefault();
        } else {
            close();
        }
        dispatch('close');
    }
    
    function isInShadow(node: HTMLElement | ParentNode) {
        for (; node; node = node.parentNode) {
            if (node.toString() === '[object ShadowRoot]') {
                return true;
            }
        }
        return false;
    }
    
    onMount(async () => {
        // Check if polyfill is needed
        needsPolyfill = !('showModal' in dialogElement);
        
        if (needsPolyfill) {
            const { default: dialogPolyfill } = await import('dialog-polyfill');
            dialogPolyfill.registerDialog(dialogElement);
            dialogElement.classList.add('dialog-polyfill');
        }
        
        if (showOnMount) {
            showModal();
        }
    });
</script>

<dialog
    data-testid="dialog"
    class:error
    class:no-scrim={disableScrim}
    class={dialogClassNames}
    class:needs-polyfill={needsPolyfill}
    id={dialogId}
    bind:this={dialogElement}
    on:click|self={handleClose}
    on:close={handleClose}
    on:cancel={handleClose}
    aria-labelledby={ariaLabelledBy}
    aria-label={ariaLabel}
    aria-hidden={ariaHidden}
>
    <slot {handleClose} />
</dialog>
```

---

### Modal Styling

```scss
@use '@amp/web-shared-styles/app/core/globalvars' as *;

// Reset position for polyfill
dialog:modal {
    position: fixed;
}

dialog {
    width: var(--modalWidth, fit-content);
    height: var(--modalHeight, fit-content);
    max-width: var(--modalMaxWidth, initial);
    max-height: var(--modalMaxHeight, initial);
    border-radius: var(--modalBorderRadius, $modal-border-radius);
    border: 0;
    padding: 0;
    color: var(--systemPrimary);
    background: transparent;
    overflow: var(--modalOverflow, auto);
    top: var(--modalTop, 0);
    font: var(--body);
    
    &:focus {
        outline: none;
    }
    
    // Backdrop scrim
    &::backdrop,
    & + :global(.backdrop) /* polyfill */ {
        background-color: var(--modalScrimColor, rgba(0, 0, 0, 0.45));
    }
    
    // Disable scrim for fullscreen modals
    &.no-scrim::backdrop,
    &.no-scrim + :global(.backdrop) {
        --modalScrimColor: transparent;
    }
}
```

---

## Dialog Polyfill

### Polyfill Styles

```scss
:global(.needs-polyfill) {
    position: absolute;
    left: 0;
    right: 0;
    width: fit-content;
    height: fit-content;
    margin: auto;
    border: solid;
    padding: 1em;
    background: white;
    color: black;
    display: block;
    
    &:not([open]) {
        display: none;
    }
    
    & + .backdrop {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        background: rgba(0, 0, 0, 0.1);
    }
    
    &._dialog_overlay {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
    }
    
    &.fixed {
        position: fixed;
        top: 50%;
        transform: translate(0, -50%);
    }
}
```

---

### Shadow DOM Detection

```typescript
function isInShadow(node: HTMLElement | ParentNode): boolean {
    for (; node; node = node.parentNode) {
        if (node.toString() === '[object ShadowRoot]') {
            return true;
        }
    }
    return false;
}
```

**Usage**:
- If modal is in Shadow DOM, keep it there
- If not in Shadow DOM and polyfill needed, append to body
- This prevents z-index stacking issues

---

## Accessibility Features

### ARIA Attributes

```html
<dialog
    aria-labelledby="modal-title"
    aria-label="Modal dialog"
    aria-hidden="true"
    role="dialog"
>
    <h2 id="modal-title">Dialog Title</h2>
    <!-- content -->
</dialog>
```

---

### Focus Trap

**Implementation Pattern**:

```typescript
let firstFocusable: HTMLElement;
let lastFocusable: HTMLElement;

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Tab') {
        const focusableElements = dialogElement.querySelectorAll(
            'a[href], button:not([disabled]), textarea, input, select'
        );
        
        firstFocusable = focusableElements[0] as HTMLElement;
        lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;
        
        if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstFocusable) {
                lastFocusable.focus();
                e.preventDefault();
            }
        } else {
            // Tab
            if (document.activeElement === lastFocusable) {
                firstFocusable.focus();
                e.preventDefault();
            }
        }
    }
}
```

---

### Escape Key Handling

```typescript
function handleCancel(e: Event) {
    // Allow consumer to prevent default close behavior
    if (preventDefaultClose) {
        e.preventDefault();
        dispatch('close');
    } else {
        close();
    }
}
```

---

## Focus Management

### Return Focus on Close

```typescript
export let modalTriggerElement: HTMLElement | null;

export function close() {
    document.body.classList.remove('noscroll');
    ariaHidden = true;
    dialogElement.close();
    
    // Return focus to triggering element
    modalTriggerElement?.focus();
}
```

**Usage**:

```svelte
<script>
    let modal;
    let triggerButton;
    
    function openModal() {
        modal.showModal();
    }
</script>

<button bind:this={triggerButton} on:click={openModal}>
    Open Modal
</button>

<Modal bind:this={modal} modalTriggerElement={triggerButton}>
    <!-- modal content -->
</Modal>
```

---

### Initial Focus

```typescript
onMount(() => {
    if (showOnMount) {
        showModal();
        // Focus first interactive element
        tick().then(() => {
            const firstButton = dialogElement.querySelector('button');
            firstButton?.focus();
        });
    }
});
```

---

## Locale Switcher Modal

### Locale Switcher Implementation

**File**: `shared/components/src/components/Modal/LocaleSwitcherModal/LocaleSwitcherModal.svelte`

A specialized modal for language/region selection.

**Features**:
- Grouped by region
- Search functionality
- Current selection indicator
- Smooth transitions

**Structure**:

```svelte
<script lang="ts">
    export let regions: Region[];
    export let currentLocale: string;
    export let translateFn: (key: string) => string;
    
    let searchQuery = '';
    let modal: Modal;
    
    $: filteredRegions = regions.filter(region =>
        region.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
</script>

<Modal bind:this={modal} dialogClassNames="locale-switcher-modal">
    <div class="modal-header">
        <h2>{translateFn('Select Your Region')}</h2>
        <SearchInput
            bind:value={searchQuery}
            placeholder={translateFn('Search')}
        />
    </div>
    
    <div class="modal-body">
        {#each filteredRegions as region}
            <LocaleSwitcherRegion
                {region}
                {currentLocale}
                on:select={(e) => handleLocaleSelect(e.detail)}
            />
        {/each}
    </div>
</Modal>
```

---

### Region List Component

```svelte
<script lang="ts">
    export let region: Region;
    export let currentLocale: string;
</script>

<div class="region">
    <h3>{region.name}</h3>
    <ul class="locale-list">
        {#each region.locales as locale}
            <li>
                <button
                    class="locale-item"
                    class:selected={locale.code === currentLocale}
                    on:click={() => dispatch('select', locale)}
                >
                    <span class="locale-name">{locale.name}</span>
                    {#if locale.code === currentLocale}
                        <span class="checkmark">✓</span>
                    {/if}
                </button>
            </li>
        {/each}
    </ul>
</div>
```

---

### Locale Modal Styling

```scss
.locale-switcher-modal {
    --modalWidth: 90vw;
    --modalMaxWidth: 600px;
    --modalHeight: 80vh;
    --modalMaxHeight: 800px;
    --modalBorderRadius: 16px;
    
    background: var(--pageBg);
}

.modal-header {
    position: sticky;
    top: 0;
    background: var(--pageBg);
    padding: 24px;
    border-bottom: 1px solid var(--labelDivider);
    z-index: 10;
    
    h2 {
        font: var(--title-1-emphasized);
        margin-bottom: 16px;
    }
}

.modal-body {
    padding: 24px;
    overflow-y: auto;
}

.region {
    margin-bottom: 32px;
    
    h3 {
        font: var(--callout-emphasized-tall);
        color: var(--systemSecondary);
        margin-bottom: 12px;
    }
}

.locale-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.locale-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--systemPrimary);
    font: var(--body);
    cursor: pointer;
    transition: background-color 150ms ease;
    
    &:hover {
        background-color: var(--systemQuaternary);
    }
    
    &.selected {
        font: var(--body-emphasized);
        background-color: var(--systemQuinary);
    }
}

.checkmark {
    color: var(--keyColor);
    font-weight: 600;
}
```

---

## Content Modal Pattern

### Scrollable Content Modal

```svelte
<Modal dialogClassNames="content-modal">
    <div class="content-modal__container">
        <div class="content-modal__header">
            <h2>{title}</h2>
            <button
                class="close-button"
                on:click={closeModal}
                aria-label="Close"
            >
                ×
            </button>
        </div>
        
        <div class="content-modal__body">
            <slot />
        </div>
        
        <div class="content-modal__footer">
            <slot name="footer" />
        </div>
    </div>
</Modal>
```

**Styling**:

```scss
.content-modal {
    --modalWidth: 90vw;
    --modalMaxWidth: 800px;
    --modalHeight: auto;
    --modalMaxHeight: 90vh;
    
    background: var(--pageBg);
}

.content-modal__container {
    display: flex;
    flex-direction: column;
    max-height: 90vh;
}

.content-modal__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px;
    border-bottom: 1px solid var(--labelDivider);
    
    h2 {
        font: var(--title-2);
    }
}

.content-modal__body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
}

.content-modal__footer {
    padding: 16px 24px;
    border-top: 1px solid var(--labelDivider);
    background: var(--systemQuinary);
}

.close-button {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--systemQuaternary);
    color: var(--systemPrimary);
    font-size: 24px;
    cursor: pointer;
    
    &:hover {
        background: var(--systemQuinary);
    }
}
```

---

## Best Practices

### 1. **Prevent Background Scroll**

```typescript
export function showModal() {
    document.body.classList.add('noscroll');
    dialogElement.showModal();
}

export function close() {
    document.body.classList.remove('noscroll');
    dialogElement.close();
}
```

```css
body.noscroll {
    overflow: hidden;
}
```

---

### 2. **Click Outside to Close**

```svelte
<dialog
    on:click|self={handleClose}
>
    <div class="modal-content">
        <!-- Clicking here won't close -->
    </div>
</dialog>
```

---

### 3. **Custom Transitions**

```typescript
export let preventDefaultClose: boolean = true;

function handleClose(e: Event) {
    if (preventDefaultClose) {
        e.preventDefault();
        // Start fade out animation
        dialogElement.classList.add('closing');
        
        setTimeout(() => {
            close();
            dialogElement.classList.remove('closing');
        }, 300);
    }
    dispatch('close');
}
```

```scss
dialog {
    animation: fadeIn 300ms ease;
}

dialog.closing {
    animation: fadeOut 300ms ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: scale(0.95);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

@keyframes fadeOut {
    from {
        opacity: 1;
        transform: scale(1);
    }
    to {
        opacity: 0;
        transform: scale(0.95);
    }
}
```

---

*Extracted from Apple App Store production source code*
