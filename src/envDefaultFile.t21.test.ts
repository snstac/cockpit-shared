import { describe, expect, it } from 'vitest';
import { serializeEnvDefault, DefaultEnvLine } from './envDefaultFile';
import type { EnvVarDefinition } from './types';

describe('T2.1 shouldAppendKey Required Default', () => {
    it('appends a required key even if it matches the default value', () => {
        const lines: DefaultEnvLine[] = [];
        const form = { COT_URL: 'udp+wo://239.2.3.1:6969' };
        const params: Record<string, EnvVarDefinition> = {
            COT_URL: {
                type: 'url',
                description: 'test',
                defaultValue: 'udp+wo://239.2.3.1:6969',
                required: true
            }
        };
        const out = serializeEnvDefault(lines, form, params);
        expect(out).toContain('COT_URL=udp+wo://239.2.3.1:6969');
    });
});
