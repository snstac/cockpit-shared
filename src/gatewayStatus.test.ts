/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
    type GatewayStatus,
    contactRate,
    formatAgo,
    formatUptime,
    recentContactCount,
    statusPath,
    trendDirection,
} from './gatewayStatus';

function makeStatus(overrides: Partial<GatewayStatus> = {}): GatewayStatus {
    return {
        app: 'testcot',
        version: '1.0.0',
        wall_t: 1000,
        uptime_s: 600,
        counters: { rx: 10 },
        trend: [1, 1, 1, 1, 1, 1],
        trend_interval_s: 60,
        recent: [],
        write_errors: 0,
        ...overrides,
    };
}

describe('statusPath', () => {
    it('matches the path pytak StatusWriter writes', () => {
        expect(statusPath('acarscot')).toBe('/run/acarscot/status.json');
    });
});

describe('recentContactCount', () => {
    it('sums only the newest buckets', () => {
        const status = makeStatus({ trend: [99, 99, 0, 0, 0, 0, 0] });
        expect(recentContactCount(status, 5)).toBe(0);
    });

    it('is zero for a null status rather than throwing', () => {
        expect(recentContactCount(null)).toBe(0);
    });

    it('is zero when the trend is absent', () => {
        expect(recentContactCount(makeStatus({ trend: [] }))).toBe(0);
        expect(recentContactCount(makeStatus({ trend: undefined as unknown as number[] }))).toBe(0);
    });
});

describe('contactRate', () => {
    it('reports contacts per minute', () => {
        const status = makeStatus({ trend: [2, 2, 2, 2], trend_interval_s: 60 });
        expect(contactRate(status)).toBe(2);
    });

    it('accounts for a non-minute bucket interval', () => {
        // 4 buckets of 30s = 2 minutes; 8 contacts => 4/min.
        const status = makeStatus({ trend: [2, 2, 2, 2], trend_interval_s: 30 });
        expect(contactRate(status)).toBe(4);
    });

    it('is null when there is no data, not zero', () => {
        // Zero would claim "measured, and it is nothing"; null says "unknown".
        expect(contactRate(makeStatus({ trend: [] }))).toBeNull();
        expect(contactRate(null)).toBeNull();
    });
});

describe('trendDirection', () => {
    it('detects a rise', () => {
        expect(trendDirection(makeStatus({ trend: [1, 1, 1, 1, 9, 9] }))).toBe('up');
    });

    it('detects a fall', () => {
        expect(trendDirection(makeStatus({ trend: [9, 9, 9, 9, 1, 1] }))).toBe('down');
    });

    it('calls steady traffic flat', () => {
        expect(trendDirection(makeStatus({ trend: [5, 5, 5, 5, 5, 5] }))).toBe('flat');
    });

    it('does not report a fresh start as a surge', () => {
        // Up for 2 minutes, so only the last two buckets are real. The leading
        // zeros mean "not running yet", not "was quiet"; counting them would
        // show every service restart as a dramatic rise.
        const justStarted = makeStatus({
            trend: [0, 0, 0, 0, 5, 5],
            uptime_s: 120,
            trend_interval_s: 60,
        });
        expect(trendDirection(justStarted)).toBe('flat');
    });

    it.each([30, 0, -100])('masks the whole trend when uptime is %ss (under one bucket)', (uptime_s) => {
        // A gateway restarted 30s ago has no complete bucket of history; the
        // older buckets are empty because it was not running.
        const restarted = makeStatus({
            trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
            uptime_s,
            trend_interval_s: 60,
        });
        expect(trendDirection(restarted)).toBe('flat');
    });

    it('still reports a real gap-then-traffic as rising', () => {
        // Up for an hour: those zeros are genuine silence -- a disconnected
        // antenna that has just been reconnected -- and an operator wants to
        // see that. Masking must key off uptime, not merely off zeros.
        const wasQuiet = makeStatus({
            trend: [0, 0, 0, 0, 5, 5],
            uptime_s: 3600,
            trend_interval_s: 60,
        });
        expect(trendDirection(wasQuiet)).toBe('up');
    });

    it('is flat when there is too little history to judge', () => {
        expect(trendDirection(makeStatus({ trend: [1, 9] }))).toBe('flat');
        expect(trendDirection(null)).toBe('flat');
    });
});

describe('formatAgo', () => {
    it('says never when nothing has been observed', () => {
        expect(formatAgo(null)).toBe('never');
    });

    it.each([
        [0.5, 'just now'],
        [45, '45s ago'],
        [600, '10m ago'],
        [7200, '2h ago'],
    ])('formats %ss', (seconds, expected) => {
        expect(formatAgo(seconds)).toBe(expected);
    });
});

describe('formatUptime', () => {
    it.each([
        [undefined, '—'],
        [45, '45s'],
        [300, '5m'],
        [7200, '2h 0m'],
        [180000, '2d 2h'],
    ])('formats %s', (seconds, expected) => {
        expect(formatUptime(seconds as number | undefined)).toBe(expected);
    });
});

describe('helper edge cases', () => {
    it('formatAgo treats non-finite input as never', () => {
        expect(formatAgo(Infinity)).toBe('never');
        expect(formatAgo(NaN)).toBe('never');
    });

    it('formatUptime rejects zero and negative uptime', () => {
        expect(formatUptime(0)).toBe('—');
        expect(formatUptime(-5)).toBe('—');
    });

    it('contactRate is null for a nonsensical negative interval', () => {
        expect(contactRate(makeStatus({ trend: [3, 3], trend_interval_s: -60 }))).toBeNull();
    });

    it('contactRate falls back to a 60s interval', () => {
        const status = makeStatus({ trend: [3, 3], trend_interval_s: 0 });
        expect(contactRate(status)).toBe(3);
    });

    it('trendDirection uses the whole trend when uptime is unknown', () => {
        const status = makeStatus({ trend: [0, 0, 0, 0, 5, 5] });
        delete (status as Partial<GatewayStatus>).uptime_s;
        expect(trendDirection(status)).toBe('up');
        expect(trendDirection(makeStatus({ trend: [0, 0, 0, 0, 5, 5], uptime_s: NaN }))).toBe('up');
    });

    it('trendDirection falls back to a 60s interval', () => {
        const status = makeStatus({ trend: [0, 0, 0, 0, 5, 5], uptime_s: 120, trend_interval_s: 0 });
        expect(trendDirection(status)).toBe('flat');
    });

    it('trendDirection is flat for a short trend', () => {
        expect(trendDirection(makeStatus({ trend: [0, 0, 0, 9, 9] }))).toBe('flat');
    });
});
