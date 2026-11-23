/// <reference lib="esnext" />
// Russian lines by their English text (see index.ts), one file per area so they can be written side by side
import { RU_APP } from './ru-app';
import { RU_PANELS } from './ru-panels';
import { RU_SCREENS } from './ru-screens';

export const RU: Record<string, string> = { ...RU_APP, ...RU_PANELS, ...RU_SCREENS };
