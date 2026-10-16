// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type GatewayStatus, useGatewayStatus } from './gatewayStatus';

type WatchCallback = (content: string | null, tag: string | null) => void;

const NOW_S = 1_700_000_000;

function makeDoc(overrides: Partial<GatewayStatus> = {}): GatewayStatus {
    return {
        app: 'testcot',
        wall_t: NOW_S,
        uptime_s: 600,
        counters: { rx: 3 },
        trend: [0, 0, 0, 0, 0, 1, 2],
        trend_interval_s: 60,
        recent: [],
        write_errors: 0,
        ...overrides,
    };
}

let watchCallback: WatchCallback | null;
let remove: ReturnType<typeof vi.fn>;
let close: ReturnType<typeof vi.fn>;
let file: ReturnType<typeof vi.fn>;

function installCockpit({ withRemove = true, withClose = true, returnWatcher = true } = {}) {
    watchCallback = null;
    remove = vi.fn();
    close = vi.fn();
    file = vi.fn(() => ({
        watch: vi.fn((cb: WatchCallback) => {
            watchCallback = cb;
            return returnWatcher ? (withRemove ? { remove } : {}) : undefined;
        }),
        ...(withClose ? { close } : {}),
    }));
    vi.stubGlobal('cockpit', { file });
}

function emit(content: string | null, tag: string | null = 'tag1') {
    act(() => {
        watchCallback?.(content, tag);
    });
}

function emitDoc(overrides: Partial<GatewayStatus> = {}) {
    emit(JSON.stringify(makeDoc(overrides)));
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_S * 1000);
    installCockpit();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('useGatewayStatus', () => {
    it('watches /run/<app>/status.json as superuser try', () => {
        renderHook(() => useGatewayStatus('acarscot'));
        expect(file).toHaveBeenCalledWith('/run/acarscot/status.json', { superuser: 'try' });
        expect(watchCallback).toBeTypeOf('function');
    });

    it('is missing with no observation before the first read', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        expect(result.current).toEqual({
            status: null,
            freshness: 'missing',
            secondsSinceChange: null,
            clockSkew: false,
            error: null,
        });
    });

    it('treats null content as missing', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc();
        emit(null, null);
        expect(result.current.freshness).toBe('missing');
        expect(result.current.status).toBeNull();
    });

    it("treats Cockpit's '-' tag as missing even with content", () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emit('', '-');
        expect(result.current.freshness).toBe('missing');
        expect(result.current.status).toBeNull();
    });

    it('is live when recent buckets have contacts', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc();
        expect(result.current.freshness).toBe('live');
        expect(result.current.status?.app).toBe('testcot');
        expect(result.current.secondsSinceChange).toBe(0);
        expect(result.current.error).toBeNull();
        expect(result.current.clockSkew).toBe(false);
    });

    it('is quiet when the file updates but nothing is heard', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc({ trend: [9, 9, 0, 0, 0, 0, 0] });
        expect(result.current.freshness).toBe('quiet');
    });

    it('is degraded when the gateway reports write errors', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc({ write_errors: 2 });
        expect(result.current.freshness).toBe('degraded');
    });

    it('recovers from missing when the file reappears', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emit(null, '-');
        emitDoc();
        expect(result.current.freshness).toBe('live');
    });

    it('keeps the last good document when a write cannot be parsed', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc({ counters: { rx: 42 } });
        emit('{not json');
        expect(result.current.error).toBe('Status file could not be parsed');
        expect(result.current.status?.counters.rx).toBe(42);
        expect(result.current.freshness).toBe('live');

        emitDoc({ counters: { rx: 43 } });
        expect(result.current.error).toBeNull();
        expect(result.current.status?.counters.rx).toBe(43);
    });

    it.each(['null', '42', '[]', '"text"', 'true'])(
        'treats valid JSON that is not an object (%s) as a parse failure',
        (content) => {
            const { result } = renderHook(() => useGatewayStatus('testcot'));
            emitDoc({ counters: { rx: 42 } });
            emit(content);
            expect(result.current.error).toBe('Status file could not be parsed');
            expect(result.current.status?.counters.rx).toBe(42);
            expect(result.current.freshness).toBe('live');
        }
    );

    it('treats a first read of non-object JSON as missing with an error', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emit('null');
        expect(result.current.error).toBe('Status file could not be parsed');
        expect(result.current.status).toBeNull();
        expect(result.current.freshness).toBe('missing');
    });

    it('clears a stale parse error and clock skew when the file goes missing', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc({ wall_t: NOW_S - 600 });
        emit('{broken');
        expect(result.current.error).not.toBeNull();
        expect(result.current.clockSkew).toBe(true);
        emit(null, '-');
        expect(result.current.freshness).toBe('missing');
        expect(result.current.error).toBeNull();
        expect(result.current.clockSkew).toBe(false);
    });

    it('flags clock skew beyond tolerance in either direction', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc({ wall_t: NOW_S - 600 });
        expect(result.current.clockSkew).toBe(true);
        emitDoc({ wall_t: NOW_S + 60 });
        expect(result.current.clockSkew).toBe(false);
        emitDoc({ wall_t: NOW_S + 121 });
        expect(result.current.clockSkew).toBe(true);
    });

    it('leaves skew alone when wall_t is not a number', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc({ wall_t: NOW_S - 600 });
        emitDoc({ wall_t: 'soon' as unknown as number });
        expect(result.current.clockSkew).toBe(true);
    });

    it('freshness ignores skew: a skewed but changing file is live', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc({ wall_t: NOW_S - 10_000 });
        expect(result.current.freshness).toBe('live');
    });

    it('goes stale when the file stops changing, via the re-render timer', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot'));
        emitDoc();
        act(() => {
            vi.advanceTimersByTime(30_000);
        });
        expect(result.current.secondsSinceChange).toBe(30);
        expect(result.current.freshness).toBe('live');
        act(() => {
            vi.advanceTimersByTime(2_000);
        });
        expect(result.current.secondsSinceChange).toBe(32);
        expect(result.current.freshness).toBe('stale');

        emitDoc();
        expect(result.current.freshness).toBe('live');
        expect(result.current.secondsSinceChange).toBe(0);
    });

    it('honours a custom staleAfterS', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot', 5));
        emitDoc();
        act(() => {
            vi.advanceTimersByTime(6_000);
        });
        expect(result.current.freshness).toBe('stale');
    });

    it('reports degraded ahead of stale', () => {
        const { result } = renderHook(() => useGatewayStatus('testcot', 5));
        emitDoc({ write_errors: 1 });
        act(() => {
            vi.advanceTimersByTime(60_000);
        });
        expect(result.current.freshness).toBe('degraded');
    });

    it('removes the watcher, closes the handle and stops the timer on unmount', () => {
        const clearSpy = vi.spyOn(window, 'clearInterval');
        const { unmount } = renderHook(() => useGatewayStatus('testcot'));
        const cb = watchCallback;
        unmount();
        expect(remove).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
        expect(clearSpy).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
        // A late callback after unmount is ignored rather than setting state.
        expect(() => cb?.(JSON.stringify(makeDoc()), 't')).not.toThrow();
    });

    it('tolerates a watcher or handle without remove/close', () => {
        installCockpit({ withRemove: false, withClose: false });
        const { unmount } = renderHook(() => useGatewayStatus('testcot'));
        expect(() => unmount()).not.toThrow();

        installCockpit({ returnWatcher: false });
        const second = renderHook(() => useGatewayStatus('testcot'));
        expect(() => second.unmount()).not.toThrow();
        expect(close).toHaveBeenCalledOnce();
    });

    it('re-subscribes when appName changes', () => {
        const { rerender } = renderHook(({ app }) => useGatewayStatus(app), {
            initialProps: { app: 'one' },
        });
        rerender({ app: 'two' });
        expect(remove).toHaveBeenCalledOnce();
        expect(file).toHaveBeenLastCalledWith('/run/two/status.json', { superuser: 'try' });
    });
});
