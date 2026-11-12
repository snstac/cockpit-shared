
import { describe, expect, it } from 'vitest';
import { serializeEnvDefault } from './envDefaultFile';

describe('T2.1 shouldAppendKey Required Default', () => {
    it('appends a required key even if it matches the default value', () => {
        const lines = [];
        const form = { COT_URL: 'udp+wo://239.2.3.1:6969' };
        const params = { 
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
