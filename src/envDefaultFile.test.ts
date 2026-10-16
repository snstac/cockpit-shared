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

describe('parseEnvDefault value forms', () => {
    it('strips single quotes verbatim, without unescaping', () => {
        const { values } = parseEnvDefault("CALLSIGN='a \\\"b\\\" $c'\n", KNOWN);
        expect(values.CALLSIGN).toBe('a \\"b\\" $c');
    });

    it('unescapes double-quoted \\" and \\\\', () => {
        const { values } = parseEnvDefault('CALLSIGN="say \\"hi\\" c:\\\\x"\n', KNOWN);
        expect(values.CALLSIGN).toBe('say "hi" c:\\x');
    });

    it('leaves a lone quote character alone', () => {
        const { values } = parseEnvDefault('CALLSIGN="\n', KNOWN);
        expect(values.CALLSIGN).toBe('"');
    });

    it('keeps an unquoted value as-is', () => {
        const { values } = parseEnvDefault('DEBUG=1\n', KNOWN);
        expect(values.DEBUG).toBe('1');
    });

    it('records export on known keys, keeps export on unknown lines verbatim', () => {
        const src = 'export   DEBUG=1\nexport OTHER=2\nCOT_URL=x\n';
        const { lines, values } = parseEnvDefault(src, KNOWN);
        expect(values.DEBUG).toBe('1');
        expect(lines[0]).toEqual({ kind: 'known', key: 'DEBUG', exportVar: true });
        expect(lines[1]).toEqual({ kind: 'unknown', text: 'export OTHER=2' });
        expect(lines[2]).toEqual({ kind: 'known', key: 'COT_URL', exportVar: false });
    });

    it('keeps invalid lines as raw text', () => {
        const src = 'not an assignment\n-BAD=1\n=nokey\n   # indented comment';
        const { lines, values } = parseEnvDefault(src, KNOWN);
        expect(values).toEqual({});
        expect(lines).toEqual([
            { kind: 'raw', text: 'not an assignment' },
            { kind: 'raw', text: '-BAD=1' },
            { kind: 'raw', text: '=nokey' },
            { kind: 'raw', text: '   # indented comment' },
        ]);
    });
});

describe('serializeEnvDefault details', () => {
    it('re-emits the export prefix for known keys', () => {
        const { lines, values } = parseEnvDefault('export DEBUG=1', KNOWN);
        const out = serializeEnvDefault(lines, { ...values, COT_URL: 'x' }, CONF_PARAMS);
        expect(out.split('\n')[0]).toBe('export DEBUG=1');
    });

    it('writes an empty string for a known key missing from the form', () => {
        const { lines } = parseEnvDefault('DEBUG=1', KNOWN);
        const out = serializeEnvDefault(lines, {}, { DEBUG: CONF_PARAMS.DEBUG });
        expect(out).toBe('DEBUG=""');
    });

    it('appends only required or non-default values', () => {
        const { lines } = parseEnvDefault('# head', KNOWN);
        const out = serializeEnvDefault(
            lines,
            { COT_URL: 'udp+wo://239.2.3.1:6969', DEBUG: '', CALLSIGN: '' },
            CONF_PARAMS
        );
        expect(out).toBe('# head\n\n# Added by Cockpit\nCOT_URL=udp+wo://239.2.3.1:6969');
    });

    it('appends a key with no definition only when non-empty', () => {
        const params = { X: undefined as unknown as EnvVarDefinition, Y: undefined as unknown as EnvVarDefinition };
        const out = serializeEnvDefault([], { X: 'v', Y: '' }, params);
        expect(out).toBe('# Added by Cockpit\nX=v');
    });

    it('treats a missing defaultValue as empty', () => {
        const def = { type: 'string', description: '' } as unknown as EnvVarDefinition;
        expect(serializeEnvDefault([], { A: '' }, { A: def })).toBe('');
        expect(serializeEnvDefault([], { A: 'z' }, { A: def })).toBe('# Added by Cockpit\nA=z');
    });

    it('does not add a blank separator after an existing blank line', () => {
        const { lines } = parseEnvDefault('# head\n', KNOWN);
        const out = serializeEnvDefault(lines, { COT_URL: 'u' }, { COT_URL: CONF_PARAMS.COT_URL });
        expect(out).toBe('# head\n\n# Added by Cockpit\nCOT_URL=u');
    });
});

describe('shellQuoteValue cases', () => {
    it.each([
        ['plain', undefined, 'plain'],
        ['udp+wo://1.2.3.4:6969', undefined, 'udp+wo://1.2.3.4:6969'],
        ['', undefined, '""'],
        ['a"b', undefined, '"a\\"b"'],
        ['a\\b', undefined, '"a\\\\b"'],
        ['$HOME', undefined, '"\\$HOME"'],
        ['a`b', undefined, '"a\\`b"'],
        ["it's", undefined, '"it\'s"'],
        ['semi;colon', undefined, '"semi;colon"'],
        ['forced', CONF_PARAMS.CALLSIGN, '"forced"'],
    ])('quotes %j', (value, def, expected) => {
        expect(shellQuoteValue(value, def)).toBe(expected);
    });
});

describe('quote round trip', () => {
    // systemd EnvironmentFile double-quote rules unescape \" \\ \$ and \`;
    // parse(serialize(v)) must be the identity or every save adds backslashes.
    it.each([
        'plain',
        '',
        'a b',
        'a$b',
        '$HOME',
        'a`b',
        'a\\$b',
        'a\\`b',
        'a\\"b',
        'a"b',
        'C:\\path\\',
        '\\\\',
        '\\',
        '"',
        "it's",
        'tab\there',
        '\\$\\`\\"\\\\',
    ])('round-trips %j', (value) => {
        const keys = new Set(['CALLSIGN']);
        const params = { CALLSIGN: CONF_PARAMS.CALLSIGN };
        const { lines } = parseEnvDefault('CALLSIGN=x', keys);
        const once = serializeEnvDefault(lines, { CALLSIGN: value }, params);
        const parsed = parseEnvDefault(once, keys);
        expect(parsed.values.CALLSIGN).toBe(value);
        const twice = serializeEnvDefault(parsed.lines, parsed.values, params);
        expect(twice).toBe(once);
    });

    it('decodes systemd escapes inside double quotes in one pass', () => {
        const { values } = parseEnvDefault('CALLSIGN="\\$x \\`y\\` \\\\$z"', KNOWN);
        expect(values.CALLSIGN).toBe('$x `y` \\$z');
    });
});
