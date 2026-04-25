# zustand-travel

![Node CI](https://github.com/mutativejs/zustand-travel/workflows/Node%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/zustand-travel.svg)](https://www.npmjs.com/package/zustand-travel)
![license](https://img.shields.io/npm/l/zustand-travel)

A powerful and high-performance undo/redo middleware for Zustand with [Travels](https://github.com/mutativejs/travels).

## Features

- ✨ **Time Travel**: Full undo/redo, reset, and rebase support for your Zustand stores
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

### Version compatibility

| zustand-travel | travels                                    |
| -------------- | ------------------------------------------ |
| `>= 1.1.0`     | `>= 1.2.0` (required for `rebase` support) |
| `< 1.1.0`      | `< 1.2.0`                                  |

If you are on `zustand-travel < 1.1.0`, pin `travels` below `1.2.0`, for example:

```bash
npm install zustand-travel@^1.0 travels@^1.0
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
controls.rebase(); // Make the current state the new baseline
```

Important behavior:

- `travel(...)` expects the initializer to return an **object store**.
- Only non-function fields are tracked in history. Action functions are preserved and reattached after undo/redo.
- Plain serializable data is the safest default for persistence. If you persist complex values such as `Date`, `Map`, or `Set`, use a custom serialization strategy.

## API

### Middleware Options

```typescript
travel(initializer, options?)
```

The initial data state comes from `initializer`, not from `options`. `options` are forwarded to `Travels`, except `mutable`, which is intentionally disabled because Zustand already manages immutable store replacement.

| Option                 | Type                      | Default                          | Description                                                                                                                                                                                               |
| ---------------------- | ------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxHistory`           | number                    | 10                               | Maximum number of history entries to keep. Must be a non-negative integer. `0` disables undo/redo history.                                                                                                |
| `initialPatches`       | TravelPatches             | {patches: [],inversePatches: []} | Restore saved patches when loading from storage. If history exceeds `maxHistory`, older entries are trimmed during initialization.                                                                        |
| `strictInitialPatches` | boolean                   | false                            | Whether invalid `initialPatches` should throw. When `false`, invalid patches are discarded and history starts empty.                                                                                      |
| `initialPosition`      | number                    | 0                                | Restore position when loading from storage. Invalid or out-of-range values are clamped after any history trimming.                                                                                        |
| `autoArchive`          | boolean                   | true                             | Automatically save each change to history (see [Archive Mode](#archive-mode)).                                                                                                                            |
| `patchesOptions`       | boolean ｜ PatchesOptions | `true` (enable patches)          | Customize JSON Patch format. Common options include `{ pathAsArray?: boolean, arrayLengthAssignment?: boolean }`. See [Mutative patches docs](https://mutative.js.org/docs/api-reference/create#patches). |
| `enableAutoFreeze`     | boolean                   | false                            | Prevent accidental state mutations outside `set` ([learn more](https://github.com/unadlib/mutative?tab=readme-ov-file#createstate-fn-options)).                                                           |
| `strict`               | boolean                   | false                            | Enable stricter immutability checks ([learn more](https://github.com/unadlib/mutative?tab=readme-ov-file#createstate-fn-options)).                                                                        |
| `mark`                 | Mark<O, F>[]              | `() => void`                     | Mark certain objects as immutable ([learn more](https://github.com/unadlib/mutative?tab=readme-ov-file#createstate-fn-options)).                                                                          |

### Store Methods

#### `getControls()`

Returns a controls object with time-travel methods:

```typescript
const controls = useStore.getControls();

controls.back(amount?: number)      // Go back in history
controls.forward(amount?: number)   // Go forward in history
controls.go(position: number)       // Go to specific position
controls.reset()                    // Reset to initial state
controls.rebase()                   // Clear history and make current state the new baseline
controls.canBack(): boolean         // Check if can go back
controls.canForward(): boolean      // Check if can go forward
controls.getHistory(): State[]      // Get full history
controls.position: number           // Current position
controls.patches: TravelPatches     // Current patches
```

**Manual Archive Mode** (when `autoArchive: false`):

```typescript
// you can use type `StoreApi`, e.g. `controls as Controls<StoreApi<{ count: number; }>,false>`
controls.archive()                  // Archive current changes
controls.canArchive(): boolean      // Check if can archive
```

`getControls()` returns the underlying Travels controls object. It has a stable reference with live getters such as `position` and `patches`. Reading `controls.position` during render is fine, but do not expect the `controls` object identity itself to change for `useEffect` dependencies or `React.memo` props.

`controls.rebase()` is a destructive operation. It discards all undo/redo history and makes the current tracked state the new baseline. After rebasing, `controls.reset()` returns to that rebased snapshot, not the original initializer state. In manual archive mode, pending unarchived changes are included in the new baseline.

## Set Function Modes

The middleware supports four update styles. They are similar to Zustand at the call site, but the semantics are not identical in every case.

### 1. Mutation Style

```typescript
set((state) => {
  state.count += 1;
  state.nested.value = 'new';
});
```

Preferred for most updates, especially nested changes.

### 2. Shallow Merge Value

```typescript
set({ count: 5 });
```

Equivalent to a top-level `Object.assign(draft, partial)` merge into the tracked data state. This matches the common Zustand `set({ ... })` mental model for shallow updates.

### 3. Replace Value

```typescript
set({ count: 10, user: { name: 'Alice' } }, true);
```

Use `replace: true` when you intentionally want to replace the entire tracked data state, such as full rehydration.

### 4. Return Value Function

```typescript
set((state) => ({
  ...state,
  count: state.count + 1,
}));
```

Function updaters are passed straight through to `travels.setState(...)`. If your function **returns an object**, that object becomes the next tracked data state. Unlike Zustand's common partial-update usage, this is **not** treated as a shallow merge. Return the complete next state object, or prefer mutation style / direct value merge.

### Recommended Usage

**Use mutation style (`set(fn)`) for most state updates**:

```typescript
// ✅ Recommended: clear intent, works well for nested updates
set((state) => {
  state.count += 1;
  state.user.name = 'Alice';
});
```

**Use direct value (`set({ ... })`) for shallow top-level merges:**

- Updating a few top-level fields
- Preserving standard Zustand ergonomics
- Simple persistence-related merges

```typescript
set({ count: 5, loading: false });
```

**Use `replace: true` for full replacement:**

- Restoring a full snapshot
- Resetting to a known complete data state
- Schema migrations that replace the whole tracked object

```typescript
// ✅ Full replacement
const loadFromStorage = () => {
  const savedState = JSON.parse(localStorage.getItem('state'));
  set(savedState, true); // Replace entire state
};
```

**Use return-value functions only when you are computing the entire next state:**

```typescript
// ✅ Safe: returns the full next tracked state
set((state) => ({
  ...state,
  count: state.count + 1,
}));
```

```typescript
// ⚠️ Risky: siblings such as `user` will be dropped
set(() => ({ count: 10 }));
```

**Why mutation style is usually the best default:**

- **Clear semantics**: No ambiguity between shallow merge and full replacement
- **Nested updates stay ergonomic**: Update deep state without rebuilding objects
- **Patch history stays precise**: Only actual changed paths are recorded
- **Less footgun-prone**: Harder to accidentally replace sibling fields

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

`controls.rebase()` is available in both archive modes. It is useful after loading or confirming a snapshot that should become the new reset target.

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

zustand-travel with other zustand middleware:

```ts
import { create } from 'zustand';
import { travel } from 'zustand-travel';
import { persist } from 'zustand/middleware';

type State = {
  count: number;
};

type Actions = {
  increment: (qty: number) => void;
  decrement: (qty: number) => void;
};

export const useCountStore = create<State & Actions>()(
  travel(
    persist(
      (set) => ({
        count: 0,
        increment: (qty: number) =>
          set((state) => {
            state.count += qty;
          }),
        decrement: (qty: number) =>
          set((state) => {
            state.count -= qty;
          }),
      }),
      {
        name: 'counter',
      }
    )
  )
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
        <button onClick={() => controls.back()} disabled={!controls.canBack()}>
          Undo
        </button>
        <button
          onClick={() => controls.forward()}
          disabled={!controls.canForward()}
        >
          Redo
        </button>
        <button onClick={() => controls.reset()}>Reset</button>
        <button onClick={() => controls.rebase()}>Rebase</button>
      </div>

      <div>
        Position: {controls.position} / {controls.patches.patches.length}
      </div>
    </div>
  );
}
```

If you pass `controls` through `React.memo` boundaries or use it directly as a `useEffect` / `useMemo` dependency, remember that `controls` itself is stable. Pass derived primitives such as `controls.position`, `controls.canBack()`, and `controls.canForward()` instead.

### Persistence

Persistence is a natural fit for initializing the store from a full snapshot:

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

// ✅ Initialize the store from the persisted full data snapshot
const useStore = create<State>()(
  travel(() => state, {
    initialPatches: patches,
    initialPosition: position,
    // Optional: strictInitialPatches: true,
  })
);
```

**Note**: The initializer function `() => state` is called during setup with the `isInitializing` flag set to `true`, so it bypasses the travel tracking. This is the correct approach for setting initial state from persistence.

If persisted history is longer than `maxHistory`, Travels keeps only the most recent window and clamps `initialPosition` into that retained range during initialization.

If you later replace the live store from an out-of-band snapshot and want future `reset()` calls to return to that snapshot, do not call `useStore.setState(...)` directly. That bypasses `travels` history tracking. Route the snapshot through a store action that uses the middleware-provided `set(..., true)` and then call `rebase()`:

```typescript
type Actions = {
  replaceFromSnapshot: (nextState: State) => void;
};

const useStore = create<State & Actions>()(
  travel((set) => ({
    ...state,
    replaceFromSnapshot: (nextState) => {
      set(nextState, true);
      useStore.getControls().rebase();
    },
  }))
);

const hydrateFromServer = async () => {
  const nextState = await fetch('/api/state').then((res) => res.json());

  useStore.getState().replaceFromSnapshot(nextState);
};
```

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
controls.rebase(); // Typed and available on the returned controls
```

## How It Works

1. **Initialization Phase**:
   - Use `isInitializing` flag to bypass travels during setup
   - Call initializer to get initial state with actions
   - Separate data state from action functions

2. **State Separation**:
   - Only data properties are tracked by Travels
   - Action functions are preserved separately
   - The root store must be an object so data and actions can be separated
   - Memory efficient: no functions in history

3. **Smart Updater Handling**:
   - **Function mutations**: Pass directly to Travels and patch the draft
   - **Returned values from functions**: Treat as the next full tracked data state
   - **Values with `replace: true`**: Replace the tracked data state directly
   - **Values without `replace`**: Convert to a shallow merge via `Object.assign`

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
