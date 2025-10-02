import type {
  StateCreator,
  StoreMutatorIdentifier,
  StoreApi,
} from 'zustand/vanilla';
import {
  Travels,
  type TravelsOptions,
  type TravelsControls,
  type ManualTravelsControls,
} from 'travels';

// ============================================================================
// Type Definitions
// ============================================================================

type SetState<T> = {
  (
    partial:
      | T
      | Partial<T>
      | ((state: T) => T | Partial<T> | void),
    replace?: boolean | undefined
  ): void;
};

type Travel = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  A extends boolean = true,
>(
  initializer: (
    set: SetState<T>,
    get: () => T,
    api: StoreApi<T>
  ) => T,
  options?: Omit<TravelsOptions<false, A>, 'mutable'>
) => StateCreator<T, Mps, [['zustand/travel', never], ...Mcs]>;

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    ['zustand/travel']: WithTravel<S>;
  }
}

type Write<T, U> = Omit<T, keyof U> & U;

type WithTravel<S> = Write<S, StoreTravel<S>>;

type StoreTravel<S> = {
  getControls: () =>
    | TravelsControls<any, false>
    | ManualTravelsControls<any, false>;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Separate state data from action functions
 */
function separateStateAndActions<T>(obj: T): {
  state: Partial<T>;
  actions: Partial<T>;
} {
  const state: any = {};
  const actions: any = {};

  for (const key in obj) {
    if (typeof obj[key] === 'function') {
      actions[key] = obj[key];
    } else {
      state[key] = obj[key];
    }
  }

  return { state, actions };
}

// ============================================================================
// Middleware Implementation
// ============================================================================

const travelImpl: Travel =
  (initializer, options = {}) =>
  (set, get, store) => {
    let travels: Travels<any, false, any>;
    let actions: any = {};
    let isInitializing = true;

    // Custom set function that integrates with Travels
    const travelSet = ((
      updater: any,
      replace?: any
    ) => {
      // During initialization, bypass travels
      if (isInitializing) {
        if (replace === true) {
          return set(updater as any, true);
        } else {
          return set(updater, replace);
        }
      }

      // Handle different updater patterns
      if (typeof updater === 'function') {
        // Pass function directly to travels.setState
        // Travels will detect if it's a mutation or return-value function
        travels.setState(updater);
      } else {
        // Direct value or partial update
        if (replace) {
          // set(value, true) - complete replacement
          travels.setState(updater);
        } else {
          // set({ x: y }) - partial update, convert to mutation
          travels.setState((draft: any) => {
            Object.assign(draft as object, updater);
          });
        }
      }
    }) as any;

    // Call initializer to get initial state with actions
    const initialState = initializer(travelSet, get as any, store as any);

    // Separate data state from action functions
    const { state: dataState, actions: extractedActions } =
      separateStateAndActions(initialState);

    actions = extractedActions;

    // Create Travels instance with data state only
    travels = new Travels(dataState, {
      ...options,
      mutable: false, // Zustand handles immutability
    });

    // Mark initialization as complete
    isInitializing = false;

    // Subscribe to travels changes and sync to Zustand
    travels.subscribe((state) => {
      // Merge state with actions and replace entirely
      set({ ...state, ...actions } as any, true);
    });

    // Add getControls method to store
    (store as StoreTravel<any>).getControls = () => travels.getControls();

    // Return initial state with actions
    return initialState;
  };

/**
 * Zustand middleware that adds time-travel capabilities powered by Travels
 *
 * @example
 * ```typescript
 * import { create } from 'zustand';
 * import { travel } from 'zustand-travel';
 *
 * type State = {
 *   count: number;
 * };
 *
 * type Actions = {
 *   increment: (qty: number) => void;
 *   decrement: (qty: number) => void;
 * };
 *
 * const useStore = create<State & Actions>()(
 *   travel((set) => ({
 *     count: 0,
 *     increment: (qty) => set((state) => { state.count += qty }),
 *     decrement: (qty) => set((state) => { state.count -= qty }),
 *   }))
 * );
 *
 * // Access controls
 * const controls = useStore.getControls();
 * controls.back();    // Undo
 * controls.forward(); // Redo
 * controls.reset();   // Reset to initial state
 * ```
 *
 * @param initializer - The state creator function
 * @param options - Travels options (maxHistory, autoArchive, etc.)
 */
export const travel = travelImpl as Travel;

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Re-export types from travels for convenience
 */
export type {
  TravelsControls,
  ManualTravelsControls,
  TravelPatches,
} from 'travels';

/**
 * Extend Zustand's StoreApi to include getControls method
 */
declare module 'zustand/vanilla' {
  interface StoreApi<T> {
    /**
     * Get time-travel controls for the store
     *
     * @returns Controls object with undo/redo methods
     *
     * @example
     * ```typescript
     * const controls = useStore.getControls();
     * controls.back();     // Undo
     * controls.forward();  // Redo
     * controls.reset();    // Reset to initial state
     * ```
     */
    getControls?: <
      F extends boolean = false,
      A extends boolean = true,
    >() => A extends true ? TravelsControls<T, F> : ManualTravelsControls<T, F>;
  }
}

export default travel;
