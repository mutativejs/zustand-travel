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
  type Updater,
} from 'travels';

// ============================================================================
// Type Definitions
// ============================================================================
type SetState<T> = {
  (
    partial: T | Partial<T> | ((state: T) => T | Partial<T> | void),
    replace?: boolean | undefined
  ): void;
};

type Travel = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  A extends boolean = true,
>(
  initializer: (set: SetState<T>, get: () => T, api: StoreApi<T>) => T,
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
    | TravelsControls<S, false>
    | ManualTravelsControls<S, false>;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Separate state data from action functions
 */
function separateStateAndActions<T extends Record<string, any>>(
  obj: T
): {
  state: Partial<T>;
  actions: Partial<T>;
} {
  if (__DEV__) {
    if (!obj || typeof obj !== 'object') {
      throw new TypeError(
        `[zustand-travel] Expected an object as initial state, received: ${typeof obj}`
      );
    }
    if (Array.isArray(obj)) {
      throw new TypeError(
        '[zustand-travel] Expected an object as initial state, received an array'
      );
    }
  }

  const state: Partial<T> = {};
  const actions: Partial<T> = {};

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
  <T>(
    initializer: any,
    options: Omit<TravelsOptions<false, any>, 'mutable'> = {}
  ) =>
  (set, get, store) => {
    let travels: Travels<T, false, true>;
    let actions: Partial<T> = {};
    let isInitializing = true;

    // Custom set function that integrates with Travels
    const travelSet: SetState<T> = (
      updater: T | Partial<T> | ((state: T) => T | Partial<T> | void),
      replace?: boolean | undefined
    ) => {
      // During initialization, bypass travels
      if (isInitializing) {
        return (set as SetState<T>)(updater, replace);
      }

      if (__DEV__) {
        // Development mode: validate inputs and provide helpful errors
        if (updater === null || updater === undefined) {
          throw new TypeError(
            '[zustand-travel] State updater cannot be null or undefined'
          );
        }
      }

      try {
        // Handle different updater patterns
        if (typeof updater === 'function') {
          // Pass function directly to travels.setState
          // Travels will detect if it's a mutation or return-value function
          travels.setState(updater as Updater<T>);
        } else {
          // Direct value or partial update
          if (replace) {
            // set(value, true) - complete replacement
            travels.setState(updater as Updater<T>);
          } else {
            // set({ x: y }) - partial update, convert to mutation
            travels.setState(((draft: T) => {
              Object.assign(draft as object, updater);
            }) as Updater<T>);
          }
        }
      } catch (error) {
        // Log error in development mode for easier debugging
        if (__DEV__) {
          console.error('[zustand-travel] State update failed:', error);
        }
        // Always re-throw to maintain expected error behavior
        throw error;
      }
    };

    try {
      // Call initializer to get initial state with actions
      const initialState = initializer(travelSet, get, store);

      if (__DEV__) {
        // Validate that initializer returned a value
        if (initialState === null || initialState === undefined) {
          throw new TypeError(
            '[zustand-travel] Initializer must return an initial state object'
          );
        }
      }

      // Separate data state from action functions
      const { state: dataState, actions: extractedActions } =
        separateStateAndActions(initialState);

      actions = extractedActions;

      // Create Travels instance with data state only
      travels = new Travels(dataState as T, {
        ...options,
        mutable: false, // Zustand handles immutability
      });

      // Mark initialization as complete
      isInitializing = false;

      // Subscribe to travels changes and sync to Zustand
      travels.subscribe((state) => {
        // Merge state with actions and replace entirely
        (set as SetState<T>)({ ...state, ...actions }, true);
      });

      // Add getControls method to store
      Object.assign(store, {
        getControls: () => travels.getControls(),
      });

      // Return initial state with actions
      return initialState;
    } catch (error) {
      // Provide helpful error information in development mode
      if (__DEV__) {
        console.error(
          '[zustand-travel] Middleware initialization failed:',
          error
        );
      }
      // Re-throw to prevent store creation with invalid state
      throw error;
    }
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
