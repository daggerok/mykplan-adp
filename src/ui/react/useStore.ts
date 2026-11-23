/// <reference lib="esnext" />
import { useSyncExternalStore } from 'react';
import type { Store } from '../../../shared/store';

export const useStore = <T,>(s: Store<T>): T => useSyncExternalStore(s.subscribe, s.get, s.get);
