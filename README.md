# zustand-travel

![Node CI](https://github.com/mutativejs/zustand-travel/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/zustand-travel.svg)](https://www.npmjs.com/package/zustand-travel)
![license](https://img.shields.io/npm/l/zustand-travel)

A powerful and high-performance time-travel middleware for Zustand with [Travels](https://github.com/mutativejs/travels).

## Features

- ✨ **Time Travel**: Full undo/redo support for your Zustand stores
- 🎯 **Mutation updates**: Write mutable code that produces immutable updates
- 📦 **Lightweight**: Built on efficient JSON Patch storage
- ⚡ **High Performance**: Powered by [Mutative](https://github.com/unadlib/mutative) (10x faster than Immer)
- 🔧 **Configurable**: Customizable history size and archive modes
- 🔄 **Reactive Controls**: Access time-travel controls anywhere

## Installation

```bash
npm install zustand-travel travels mutative zustand
# or
yarn add zustand-travel travels mutative zustand
# or
pnpm add zustand-travel travels mutative zustand
```

## Quick Start

```typescript
import { create } from 'zustand';
import { travel } from 'zustand-travel';

type State = {
  count: number;
};

type Actions = {
  increment: (qty: number) => void;
  decrement: (qty: number) => void;
};

export const useCountStore = create<State & Actions>()(
  travel((set) => ({
    count: 0,
    increment: (qty: number) =>
      set((state) => {
        state.count += qty; // ⭐ Mutation style for efficient JSON Patches
      }),
    decrement: (qty: number) =>
      set((state) => {
        state.count -= qty; // ⭐ Recommended approach
      }),
  }))
);

// Access controls
const controls = useCountStore.getControls();
controls.back(); // Undo
controls.forward(); // Redo
controls.reset(); // Reset to initial state
```

## API

### Middleware Options

```typescript
travel(initializer, options?)
```

| Option            | Type          | Default | Description                                              |
| ----------------- | ------------- | ------- | -------------------------------------------------------- |
| `maxHistory`      | number        | 10      | Maximum number of history entries to keep                |
| `autoArchive`     | boolean       | true    | Auto-archive changes (see [Archive Mode](#archive-mode)) |
| `initialPosition` | number        | 0       | Initial position in history                              |
| `initialPatches`  | TravelPatches | -       | Initial patches for persistence                          |

### Store Methods

#### `getControls()`

Returns a controls object with time-travel methods:

```typescript
const controls = useStore.getControls();

controls.back(amount?: number)      // Go back in history
controls.forward(amount?: number)   // Go forward in history
controls.go(position: number)       // Go to specific position
controls.reset()                    // Reset to initial state
controls.canBack(): boolean         // Check if can go back
controls.canForward(): boolean      // Check if can go forward
controls.getHistory(): State[]      // Get full history
controls.position: number           // Current position
controls.patches: TravelPatches     // Current patches
```

**Manual Archive Mode** (when `autoArchive: false`):

```typescript
controls.archive()                  // Archive current changes
controls.canArchive(): boolean      // Check if can archive
```

## Set Function Modes

The middleware supports three ways to update state:

### 1. Mutation Style

```typescript
set((state) => {
  state.count += 1;
  state.nested.value = 'new';
});
```

### 2. Direct Value

```typescript
set({ count: 5 });
```

### 3. Return Value Function

```typescript
set(() => ({ count: 10 }));
```

### Recommended Usage

**Use mutation style (`set(fn)`) for most state updates** to take full advantage of Mutative's JSON Patch mechanism:

```typescript
// ✅ Recommended: Efficient JSON Patches
set((state) => {
  state.count += 1;
  state.user.name = 'Alice';
});
```

**Only use direct value (`set(value)`) for special cases:**
- Restoring state from persistence
- Setting initial values
- Complete state replacement

```typescript
// ✅ Good use case: Restoring from persistence
const loadFromStorage = () => {
  const savedState = JSON.parse(localStorage.getItem('state'));
  set(savedState, true); // Replace entire state
};
```

**Why mutation style is more efficient:**

When you use mutation style, Mutative tracks exactly which properties changed and generates minimal JSON Patches. For example:

```typescript
// Only generates a patch for the changed property
set((state) => {
  // ✅ Efficient: Only tracks the changed property
  state.count = 5; // Patch: [{ op: 'replace', path: 'count', value: 5 }]
});
```

By contrast, direct value updates are internally converted into record object patches rather than concise patches:

```typescript
// ❌ Inefficient: Records the entire object as a patch
set({ count: 5 }); // Internally: record `{ count: 5 }` as a patch
```

**The benefits of efficient patches:**
- **Smaller memory footprint**: History stores only changed properties
- **Faster undo/redo**: Applying small patches is quicker than replacing entire objects
- **Better performance**: Especially important for complex, deeply nested state
- **Precise tracking**: Only actual changes are recorded

## Archive Mode

### Auto Archive (default)

Every `set` call creates a new history entry:

```typescript
const useStore = create<State>()(
  travel((set) => ({
    count: 0,
    increment: () =>
      set((state) => {
        state.count += 1;
      }),
  }))
);

// Each call creates a history entry
increment(); // History: [0, 1]
increment(); // History: [0, 1, 2]
```

### Manual Archive

Group multiple changes into a single undo/redo step:

```typescript
const useStore = create<State>()(
  travel(
    (set) => ({
      count: 0,
      increment: () =>
        set((state) => {
          state.count += 1;
        }),
      save: () => {
        const controls = useStore.getControls();
        if ('archive' in controls) {
          controls.archive();
        }
      },
    }),
    { autoArchive: false }
  )
);

increment(); // Temporary change
increment(); // Temporary change
save(); // Archive as single entry
```

## Examples

### Complex State with Nested Updates

```typescript
type Todo = { id: number; text: string; done: boolean };

type State = {
  todos: Todo[];
};

type Actions = {
  addTodo: (text: string) => void;
  toggleTodo: (id: number) => void;
  removeTodo: (id: number) => void;
};

const useTodoStore = create<State & Actions>()(
  travel((set) => ({
    todos: [],
    addTodo: (text) =>
      set((state) => {
        state.todos.push({
          id: Date.now(),
          text,
          done: false,
        });
      }),
    toggleTodo: (id) =>
      set((state) => {
        const todo = state.todos.find((t) => t.id === id);
        if (todo) {
          todo.done = !todo.done;
        }
      }),
    removeTodo: (id) =>
      set((state) => {
        state.todos = state.todos.filter((t) => t.id !== id);
      }),
  }))
);
```

### Using Controls in React

```tsx
function TodoApp() {
  const { todos, addTodo, toggleTodo } = useTodoStore();
  const controls = useTodoStore.getControls();

  return (
    <div>
      <TodoList todos={todos} onToggle={toggleTodo} />

      <div className="controls">
        <button
          onClick={() => controls.back()}
          disabled={!controls.canBack()}
        >
          Undo
        </button>
        <button
          onClick={() => controls.forward()}
          disabled={!controls.canForward()}
        >
          Redo
        </button>
        <button onClick={() => controls.reset()}>
          Reset
        </button>
      </div>

      <div>
        Position: {controls.position} / {controls.patches.patches.length}
      </div>
    </div>
  );
}
```

### Persistence

Persistence is a perfect use case for direct value initialization, as you're restoring a complete state:

```typescript
// Save state for persistence
const saveToStorage = () => {
  const controls = useStore.getControls();
  const state = useStore.getState();

  localStorage.setItem('state', JSON.stringify(state));
  localStorage.setItem('patches', JSON.stringify(controls.patches));
  localStorage.setItem('position', JSON.stringify(controls.position));
};

// Load state on initialization
const loadFromStorage = () => {
  const state = JSON.parse(localStorage.getItem('state') || '{}');
  const patches = JSON.parse(
    localStorage.getItem('patches') || '{"patches":[],"inversePatches":[]}'
  );
  const position = JSON.parse(localStorage.getItem('position') || '0');

  return { state, patches, position };
};

const { state, patches, position } = loadFromStorage();

// ✅ Direct value initialization is appropriate here
// We're setting the complete initial state from storage
const useStore = create<State>()(
  travel(() => state, {
    initialPatches: patches,
    initialPosition: position,
  })
);
```

**Note**: The initializer function `() => state` is called during setup with the `isInitializing` flag set to `true`, so it bypasses the travel tracking. This is the correct approach for setting initial state from persistence.

## TypeScript Support

Full TypeScript support with type inference:

```typescript
import { create } from 'zustand';
import { travel } from 'zustand-travel';

type State = {
  count: number;
  user: { name: string; age: number };
};

type Actions = {
  updateUser: (updates: Partial<State['user']>) => void;
};

const useStore = create<State & Actions>()(
  travel((set) => ({
    count: 0,
    user: { name: 'Alice', age: 30 },
    updateUser: (updates) =>
      set((state) => {
        Object.assign(state.user, updates);
      }),
  }))
);

// Full type safety
const controls = useStore.getControls(); // Typed controls
const history = controls.getHistory(); // State[] with full types
```

## How It Works

1. **Initialization Phase**:
   - Use `isInitializing` flag to bypass travels during setup
   - Call initializer to get initial state with actions
   - Separate data state from action functions

2. **State Separation**:
   - Only data properties are tracked by Travels
   - Action functions are preserved separately
   - Memory efficient: no functions in history

3. **Smart Updater Handling**:
   - **Functions**: Pass directly to travels (auto-detects mutation/return)
   - **Values with replace**: Direct replacement
   - **Partial updates**: Convert to mutation with `Object.assign`

4. **Bi-directional Sync**:
   - User actions → `travelSet` → `travels.setState`
   - Travels changes → merge state + actions → Zustand (complete replacement)

5. **Action Preservation**:
   - Actions maintain stable references across undo/redo
   - Always merged with state updates

## Performance

- **Efficient Storage**: Uses JSON Patches instead of full state snapshots
- **Fast Updates**: Powered by Mutative (10x faster than Immer)
- **Minimal Overhead**: Only tracks data changes, not functions

## Related

- [travels](https://github.com/mutativejs/travels) - Framework-agnostic undo/redo core
- [mutative](https://github.com/unadlib/mutative) - Efficient immutable updates
- [zustand](https://github.com/pmndrs/zustand) - Bear necessities for state management

## License

MIT
