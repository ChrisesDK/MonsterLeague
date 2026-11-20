declare const __APP_VERSION__: string;

/** Short git hash of the build (set by vite.config.ts), "dev" when unknown. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
