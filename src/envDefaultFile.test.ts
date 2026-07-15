/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 */

import { describe, expect, it } from 'vitest';

import {
    defaultFormFromConf,
    mergeFormValues,
    parseEnvDefault,
    serializeEnvDefault,
    shellQuoteValue,
} from './envDefaultFile';
import type { EnvVarDefinition } from './types';

const CONF_PARAMS: Record<string, EnvVarDefinition> = {
    COT_URL: {
        type: 'url',
        description: 'CoT destination URL',
        defaultValue: 'udp+wo://239.2.3.1:6969',
        required: true,
    },
    DEBUG: {
        type: 'boolean',
        description: 'Enable debug logging',
        defaultValue: '',
    },
    CALLSIGN: {
        type: 'string',
        description: 'Station callsign',
        defaultValue: '',
        requiresQuoting: true,
    },
};

const KNOWN = new Set(Object.keys(CONF_PARAMS));

describe('parseEnvDefault', () => {
    it('preserves comments, blanks, and unknown assignments', () => {
        const src = '# banner\n\nUNKNOWN_KEEP=val\n\n# end\n';
        const { lines, values } = parseEnvDefault(src, KNOWN);
        expect(values.UNKNOWN_KEEP).toBeUndefined();
        const form = mergeFormValues(defaultFormFromConf(CONF_PARAMS), values);
        const out = serializeEnvDefault(lines, form, CONF_PARAMS);
        expect(out).toContain('# banner');
        expect(out).toContain('UNKNOWN_KEEP=val');
        expect(out).toContain('# end');
    });

    it('parses export-prefixed known variables', () => {
        const src = 'export COT_URL=tls://host:1234\n';
        const { lines, values } = parseEnvDefault(src, KNOWN);
        expect(values.COT_URL).toBe('tls://host:1234');
        expect(lines.some(l => l.kind === 'known' && l.exportVar)).toBe(true);
    });
});

describe('serializeEnvDefault', () => {
    it('updates known keys in place', () => {
        const src = '# c\nCOT_URL=udp+wo://old:1\n';
        const { lines, values } = parseEnvDefault(src, KNOWN);
        const form = mergeFormValues(defaultFormFromConf(CONF_PARAMS), values);
        form.COT_URL = 'udp+wo://new:2';
        const out = serializeEnvDefault(lines, form, CONF_PARAMS);
        expect(out).toContain('# c');
        expect(out).toMatch(/COT_URL=.*udp\+wo:\/\/new:2/);
        expect(out).not.toContain('old:1');
    });

    it('appends missing keys under a generic comment by default', () => {
        const { lines } = parseEnvDefault('', KNOWN);
        const form = defaultFormFromConf(CONF_PARAMS);
        const out = serializeEnvDefault(lines, form, CONF_PARAMS);
        expect(out).toContain('# Added by Cockpit');
        expect(out).toMatch(/COT_URL=/);
    });

    it('uses the caller-supplied added-by comment', () => {
        const { lines } = parseEnvDefault('', KNOWN);
        const form = defaultFormFromConf(CONF_PARAMS);
        const out = serializeEnvDefault(lines, form, CONF_PARAMS, '# Added by Cockpit AISCOT');
        expect(out).toContain('# Added by Cockpit AISCOT');
    });
});

describe('shellQuoteValue', () => {
    it('quotes values with spaces', () => {
        const q = shellQuoteValue('a b', CONF_PARAMS.COT_URL);
        expect(q.startsWith('"')).toBe(true);
        expect(q.endsWith('"')).toBe(true);
    });
});
