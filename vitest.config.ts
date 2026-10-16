import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            // Cockpit plugins resolve 'cockpit' to the real library at build
            // time; under test it is a vi.fn()-based double.
            cockpit: fileURLToPath(new URL('./test/cockpit-mock.ts', import.meta.url)),
        },
    },
    test: {
        // Component tests opt into jsdom with a `// @vitest-environment jsdom`
        // docblock; everything else runs in plain node.
        environment: 'node',
        include: ['src/**/*.test.{ts,tsx}'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.test.{ts,tsx}',
                'src/**/*.d.ts',
                'src/types.ts',
                'test/**',
            ],
            thresholds: {
                statements: 90,
                branches: 90,
                functions: 90,
                lines: 90,
            },
        },
    },
});
