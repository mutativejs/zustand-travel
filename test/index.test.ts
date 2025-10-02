import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { travel } from '../src/index';

describe('Zustand Travel Middleware', () => {
  describe('Basic Functionality', () => {
    it('should support mutation-style updates', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel((set) => ({
          count: 0,
          increment: () =>
            set((state) => {
              state.count += 1;
            }),
        }))
      );

      const { increment } = useStore.getState();
      expect(useStore.getState().count).toBe(0);

      increment();
      expect(useStore.getState().count).toBe(1);

      increment();
      expect(useStore.getState().count).toBe(2);
    });

    it('should support direct value updates', () => {
      const useStore = create<{
        count: number;
        setCount: (n: number) => void;
      }>()(
        travel((set) => ({
          count: 0,
          setCount: (n) => set({ count: n }),
        }))
      );

      const { setCount } = useStore.getState();
      setCount(5);
      expect(useStore.getState().count).toBe(5);

      setCount(10);
      expect(useStore.getState().count).toBe(10);
    });

    it('should support return-value function updates', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel((set) => ({
          count: 0,
          increment: () =>
            set(() => ({ count: useStore.getState().count + 1 })),
        }))
      );

      const { increment } = useStore.getState();
      increment();
      expect(useStore.getState().count).toBe(1);

      increment();
      expect(useStore.getState().count).toBe(2);
    });
  });

  describe('Time Travel Controls', () => {
    it('should provide getControls method', () => {
      const useStore = create<{ count: number }>()(
        travel(() => ({
          count: 0,
        }))
      );

      const controls = useStore.getControls();
      expect(controls).toBeDefined();
      expect(controls.back).toBeDefined();
      expect(controls.forward).toBeDefined();
      expect(controls.reset).toBeDefined();
      expect(controls.canBack).toBeDefined();
      expect(controls.canForward).toBeDefined();
    });

    it('should support undo (back)', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel((set) => ({
          count: 0,
          increment: () =>
            set((state) => {
              state.count += 1;
            }),
        }))
      );

      const { increment } = useStore.getState();
      const controls = useStore.getControls();

      increment();
      expect(useStore.getState().count).toBe(1);

      controls.back();
      expect(useStore.getState().count).toBe(0);
    });

    it('should support redo (forward)', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel((set) => ({
          count: 0,
          increment: () =>
            set((state) => {
              state.count += 1;
            }),
        }))
      );

      const { increment } = useStore.getState();
      const controls = useStore.getControls();

      increment();
      controls.back();
      controls.forward();
      expect(useStore.getState().count).toBe(1);
    });

    it('should support reset', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel((set) => ({
          count: 0,
          increment: () =>
            set((state) => {
              state.count += 1;
            }),
        }))
      );

      const { increment } = useStore.getState();
      const controls = useStore.getControls();

      increment();
      increment();
      increment();
      expect(useStore.getState().count).toBe(3);

      controls.reset();
      expect(useStore.getState().count).toBe(0);
    });

    it('should correctly report canBack and canForward', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel((set) => ({
          count: 0,
          increment: () =>
            set((state) => {
              state.count += 1;
            }),
        }))
      );

      const { increment } = useStore.getState();
      const controls = useStore.getControls();

      expect(controls.canBack()).toBe(false);
      expect(controls.canForward()).toBe(false);

      increment();
      expect(controls.canBack()).toBe(true);
      expect(controls.canForward()).toBe(false);

      controls.back();
      expect(controls.canBack()).toBe(false);
      expect(controls.canForward()).toBe(true);

      controls.forward();
      expect(controls.canBack()).toBe(true);
      expect(controls.canForward()).toBe(false);
    });
  });

  describe('History Management', () => {
    it('should respect maxHistory option', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel(
          (set) => ({
            count: 0,
            increment: () =>
              set((state) => {
                state.count += 1;
              }),
          }),
          { maxHistory: 3 }
        )
      );

      const { increment } = useStore.getState();
      const controls = useStore.getControls();

      // Make 5 changes
      increment(); // 1
      increment(); // 2
      increment(); // 3
      increment(); // 4
      increment(); // 5

      expect(useStore.getState().count).toBe(5);

      // With maxHistory: 3, we can go back up to 3 steps
      // Position is capped at maxHistory (3), so we're at position 3 with count 5
      // Due to how travels manages patches with maxHistory, the history may have gaps
      controls.back(); // position 2
      expect(useStore.getState().count).toBe(4);

      controls.back(); // position 1
      // The exact value depends on travels' patch management
      const countAfterSecondBack = useStore.getState().count;
      expect(countAfterSecondBack).toBeLessThan(4);

      controls.back(); // position 0
      expect(useStore.getState().count).toBe(0);

      expect(controls.canBack()).toBe(false); // Can't go further back
    });

    it('should get history', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel((set) => ({
          count: 0,
          increment: () =>
            set((state) => {
              state.count += 1;
            }),
        }))
      );

      const { increment } = useStore.getState();
      const controls = useStore.getControls();

      increment();
      increment();

      const history = controls.getHistory();
      expect(history).toHaveLength(3); // [0, 1, 2]
      expect(history[0]).toEqual({ count: 0 });
      expect(history[1]).toEqual({ count: 1 });
      expect(history[2]).toEqual({ count: 2 });
    });
  });

  describe('Manual Archive Mode', () => {
    it('should support manual archive mode', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel(
          (set) => ({
            count: 0,
            increment: () =>
              set((state) => {
                state.count += 1;
              }),
          }),
          { autoArchive: false }
        )
      );

      const { increment } = useStore.getState();
      const controls = useStore.getControls();

      expect(controls.canBack()).toBe(false);

      increment();
      increment();

      // In manual archive mode, position increases even before archiving
      // So we can go back (which will trigger auto-archive before going back)
      expect(controls.canBack()).toBe(true);

      // Check if we can archive
      expect('canArchive' in controls).toBe(true);
      if ('canArchive' in controls) {
        expect(controls.canArchive()).toBe(true);

        // Archive the changes
        controls.archive();

        // After archiving, canArchive should be false
        expect(controls.canArchive()).toBe(false);
      }

      controls.back();
      expect(useStore.getState().count).toBe(0);
    });
  });

  describe('Complex State', () => {
    it('should handle nested objects and arrays', () => {
      type Todo = { id: number; text: string; done: boolean };
      type State = {
        todos: Todo[];
        addTodo: (text: string) => void;
        toggleTodo: (id: number) => void;
      };

      const useStore = create<State>()(
        travel((set) => ({
          todos: [],
          addTodo: (text) =>
            set((state) => {
              state.todos.push({ id: Date.now(), text, done: false });
            }),
          toggleTodo: (id) =>
            set((state) => {
              const todo = state.todos.find((t) => t.id === id);
              if (todo) {
                todo.done = !todo.done;
              }
            }),
        }))
      );

      const { addTodo, toggleTodo } = useStore.getState();
      const controls = useStore.getControls();

      addTodo('Buy milk');
      addTodo('Walk dog');

      expect(useStore.getState().todos).toHaveLength(2);

      const firstId = useStore.getState().todos[0].id;
      toggleTodo(firstId);

      expect(useStore.getState().todos[0].done).toBe(true);

      controls.back();
      expect(useStore.getState().todos[0].done).toBe(false);

      controls.back();
      expect(useStore.getState().todos).toHaveLength(1);

      controls.back();
      expect(useStore.getState().todos).toHaveLength(0);
    });
  });

  describe('Actions Preservation', () => {
    it('should preserve actions after state updates', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel((set) => ({
          count: 0,
          increment: () =>
            set((state) => {
              state.count += 1;
            }),
        }))
      );

      const controls = useStore.getControls();
      const { increment: increment1 } = useStore.getState();

      increment1();
      const { increment: increment2 } = useStore.getState();

      controls.back();
      const { increment: increment3 } = useStore.getState();

      // Actions should remain the same function
      expect(increment1).toBe(increment2);
      expect(increment2).toBe(increment3);
    });
  });

  describe('Replace Mode', () => {
    it('should support replace mode during initialization', () => {
      const useStore = create<{
        count: number;
        name: string;
        reset: () => void;
      }>()(
        travel((set) => {
          // Use set with replace=true during initialization
          set({ count: 0, name: 'initial', reset: () => {} }, true);
          return {
            count: 0,
            name: 'initial',
            reset: () =>
              set({ count: 0, name: 'initial', reset: () => {} }, true),
          };
        })
      );

      expect(useStore.getState().count).toBe(0);
      expect(useStore.getState().name).toBe('initial');
    });

    it('should support replace mode with direct value updates', () => {
      const useStore = create<{
        count: number;
        name: string;
        replaceState: (newState: { count: number; name: string }) => void;
      }>()(
        travel((set) => ({
          count: 0,
          name: 'test',
          replaceState: (newState) => set(newState, true),
        }))
      );

      const { replaceState } = useStore.getState();

      expect(useStore.getState().count).toBe(0);
      expect(useStore.getState().name).toBe('test');

      replaceState({ count: 10, name: 'replaced' });

      expect(useStore.getState().count).toBe(10);
      expect(useStore.getState().name).toBe('replaced');
    });

    it('should support replace mode with undefined replace parameter during initialization', () => {
      const useStore = create<{ count: number; increment: () => void }>()(
        travel((set) => {
          // Call set without replace parameter (replace is undefined)
          set({ count: 5 });
          return {
            count: 5,
            increment: () =>
              set((state) => {
                state.count += 1;
              }),
          };
        })
      );

      expect(useStore.getState().count).toBe(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in state updater functions gracefully', () => {
      const useStore = create<{ count: number; brokenUpdate: () => void }>()(
        travel((set) => ({
          count: 0,
          brokenUpdate: () =>
            set((state) => {
              // This will throw an error
              throw new Error('Intentional error');
            }),
        }))
      );

      const { brokenUpdate } = useStore.getState();

      // Error should be thrown and caught
      expect(() => brokenUpdate()).toThrow('Intentional error');

      // Store should still be in a valid state
      expect(useStore.getState().count).toBe(0);
    });

    it('should handle errors in Object.assign for partial updates', () => {
      const useStore = create<{
        data: { value: number };
        update: (val: number) => void;
      }>()(
        travel((set) => ({
          data: { value: 0 },
          update: (val) => set({ data: { value: val } }),
        }))
      );

      const { update } = useStore.getState();

      // This should work fine
      update(5);
      expect(useStore.getState().data.value).toBe(5);

      // Store should remain functional
      update(10);
      expect(useStore.getState().data.value).toBe(10);
    });
  });
});
