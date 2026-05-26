// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import { defineConfig } from 'vitest/config';

export default defineConfig({
    cacheDir: './node_modules/.vitest',
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.js'],
        watchExclude: ['coverage/**', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**/*.js'],
            exclude: ['src/server.js'],
        },
    },
});
