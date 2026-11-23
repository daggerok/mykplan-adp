/// <reference lib="esnext" />
import type { Adapter, AdapterName } from '../types';
import { generic } from './generic';
import { navDist } from './navDist';
import { vanguard } from './vanguard';
import { yahoo } from './yahoo';

export { generic, navDist, vanguard, yahoo };

// config/benchmarks.json "adapter" -> function; an unknown name falls back to generic
export const ADAPTERS: Record<AdapterName, Adapter> = { navDist, yahoo, vanguard, generic };

export const adapterFor = (name: string | undefined): Adapter =>
  name && Object.prototype.hasOwnProperty.call(ADAPTERS, name) ? ADAPTERS[name as AdapterName] : generic;
