/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reads the runtime status file a pytak gateway writes (pytak.StatusWriter).
 *
 * The file lives at /run/<app>/status.json and carries lifetime counters, a
 * per-minute trend, and a ring buffer of recent contacts. It is written
 * atomically, so a watcher never observes a partial document.
 *
 * The hard part here is not reading the file, it is deciding whether what it
 * says is still TRUE -- see `freshness` below.
 */

import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const cockpit: any;

export type GatewayContact = {
    /** Unix time the contact was recorded, from the gateway's clock. */
    t: number;
    /** Everything else is gateway-specific and rendered as given. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
};

export type GatewayStatus = {
    app: string;
    version?: string | null;
    /** Unix time of the last write, from the GATEWAY's clock. */
    wall_t: number;
    uptime_s: number;
    pid?: number;
    counters: Record<string, number>;
    trend: number[];
    trend_interval_s: number;
    recent: GatewayContact[];
    /** Non-zero means the gateway could not write; data shown is stale. */
    write_errors: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
};

/**
 * How we think the displayed data relates to reality.
 *
 * - `live`     - the file changed recently; what you see is current.
 * - `quiet`    - the file is being written but no contacts are arriving.
 * - `stale`    - the file has stopped changing. The gateway may be wedged.
 * - `missing`  - no status file. Either not running, or too old to write one.
 * - `degraded` - the gateway is running but reports write_errors, so the
 *                document itself may lag reality.
 */
export type Freshness = 'live' | 'quiet' | 'stale' | 'missing' | 'degraded';

export type GatewayStatusState = {
    status: GatewayStatus | null;
    freshness: Freshness;
    /** Seconds since we last observed the file change, or null if never. */
    secondsSinceChange: number | null;
    /** True when the gateway clock and the browser clock disagree badly. */
    clockSkew: boolean;
    error: string | null;
};

/**
 * Seconds without a file change before we stop trusting the contents.
 *
 * StatusWriter's default write interval is 1s and gateways are expected to
 * write on a heartbeat even when idle, so this is generously above that.
 */
const DEFAULT_STALE_AFTER_S = 30;

/** Skew beyond this between the two clocks makes wall_t useless to us. */
const CLOCK_SKEW_TOLERANCE_S = 120;

export function statusPath(appName: string): string {
    return `/run/${appName}/status.json`;
}

/**
 * Subscribe to a gateway's status file.
 *
 * ## Why staleness is measured client-side
 *
 * The obvious check -- compare `wall_t` to `Date.now()` -- is wrong. Cockpit
 * runs in a browser that may be on a different machine from the gateway, so
 * those are two different clocks. A laptop 10 minutes off would show every
 * healthy gateway as stale, or worse, show a dead one as live.
 *
 * So freshness is measured as *time since we observed the file change*, which
 * uses only the browser's clock and is immune to skew. `wall_t` is still read,
 * but only to detect and report that the two clocks disagree -- which is
 * itself worth surfacing on a box that is supposed to be disciplined to GNSS.
 *
 * On the very first read we have no previous observation to compare against,
 * so the file is treated as fresh until we have watched it for a while. That
 * errs towards "live" for one interval rather than flashing a false "stale" on
 * every page load.
 */
export function useGatewayStatus(
    appName: string,
    staleAfterS: number = DEFAULT_STALE_AFTER_S,
): GatewayStatusState {
    const [status, setStatus] = useState<GatewayStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [missing, setMissing] = useState(false);
    const [clockSkew, setClockSkew] = useState(false);

    // Browser-clock timestamp of the last observed change. Ref, not state:
    // updating it must not itself trigger a render.
    const lastChangeRef = useRef<number | null>(null);
    // Drives the staleness re-render; the watcher alone cannot, because the
    // interesting event is the ABSENCE of a change.
    const [, setTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const path = statusPath(appName);
        const handle = cockpit.file(path, { superuser: 'try' });

        const watcher = handle.watch(
            (content: string | null, tag: string | null) => {
                if (cancelled) return;

                // Cockpit signals a missing file with tag '-'. A gateway that
                // is stopped, or one running a pytak too old to write status,
                // both land here -- so the UI must say "no status", not "no
                // contacts", which would read as "working but quiet".
                if (content === null || tag === '-') {
                    setMissing(true);
                    setStatus(null);
                    return;
                }

                let parsed: GatewayStatus;
                try {
                    parsed = JSON.parse(content);
                } catch {
                    // Writes are atomic, so this should not happen. If it
                    // does, keep the last good document rather than blanking
                    // the panel, and say so.
                    setError('Status file could not be parsed');
                    return;
                }

                setMissing(false);
                setError(null);
                lastChangeRef.current = Date.now() / 1000;

                if (typeof parsed.wall_t === 'number') {
                    const skew = Math.abs(Date.now() / 1000 - parsed.wall_t);
                    setClockSkew(skew > CLOCK_SKEW_TOLERANCE_S);
                }

                setStatus(parsed);
            },
        );

        // Re-render on a timer so a gateway that STOPS writing is noticed.
        // Without this the panel would keep showing the last document forever,
        // which is precisely the failure this module exists to prevent.
        const timer = window.setInterval(() => setTick(t => t + 1), 2000);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
            watcher?.remove?.();
            handle?.close?.();
        };
    }, [appName]);

    const now = Date.now() / 1000;
    const secondsSinceChange =
        lastChangeRef.current === null ? null : now - lastChangeRef.current;

    let freshness: Freshness;
    if (missing || status === null) {
        freshness = 'missing';
    } else if (status.write_errors > 0) {
        // The gateway is alive enough to tell us it cannot write. Whatever is
        // on screen is older than it looks.
        freshness = 'degraded';
    } else if (secondsSinceChange !== null && secondsSinceChange > staleAfterS) {
        freshness = 'stale';
    } else if (recentContactCount(status) === 0) {
        freshness = 'quiet';
    } else {
        freshness = 'live';
    }

    return { status, freshness, secondsSinceChange, clockSkew, error };
}

/** Contacts in the most recent trend buckets: "is it hearing anything now". */
export function recentContactCount(status: GatewayStatus | null, buckets = 5): number {
    if (!status?.trend?.length) return 0;
    return status.trend.slice(-buckets).reduce((a, b) => a + b, 0);
}

/** Contacts per minute over the trend window, for a rate readout. */
export function contactRate(status: GatewayStatus | null): number | null {
    if (!status?.trend?.length) return null;
    const interval = status.trend_interval_s || 60;
    const total = status.trend.reduce((a, b) => a + b, 0);
    const minutes = (status.trend.length * interval) / 60;
    return minutes > 0 ? total / minutes : null;
}

/**
 * Direction of travel over the trend window.
 *
 * Compares the newest half of the usable window against the half before it.
 *
 * "Usable" is the load-bearing word. Buckets older than the gateway's uptime
 * are empty because the gateway was NOT RUNNING, not because it heard nothing,
 * and counting them reports a dramatic rise every time a service restarts.
 * They are masked off using `uptime_s`, and if that leaves too little history
 * to judge, the answer is 'flat' rather than a guess.
 *
 * Note that a genuine gap -- a gateway up for an hour that heard nothing for
 * twenty minutes and is now hearing traffic -- is still correctly reported as
 * rising. That is a real change in the world and an operator wants to see it.
 */
export function trendDirection(status: GatewayStatus | null): 'up' | 'down' | 'flat' {
    const trend = status?.trend;
    if (!trend || trend.length < 6) return 'flat';

    const interval = status?.trend_interval_s || 60;
    const uptime = status?.uptime_s;
    const covered =
        typeof uptime === 'number' && isFinite(uptime)
            ? Math.floor(uptime / interval)
            : trend.length;

    const usable = trend.slice(-Math.max(Math.min(covered, trend.length), 0));
    if (usable.length < 6) return 'flat';

    const half = Math.floor(usable.length / 2);
    const recent = usable.slice(-half).reduce((a, b) => a + b, 0);
    const previous = usable.slice(-half * 2, -half).reduce((a, b) => a + b, 0);

    if (recent > previous * 1.2) return 'up';
    if (recent * 1.2 < previous) return 'down';
    return 'flat';
}

export function formatAgo(seconds: number | null): string {
    if (seconds === null || !isFinite(seconds)) return 'never';
    if (seconds < 2) return 'just now';
    if (seconds < 90) return `${Math.round(seconds)}s ago`;
    if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
    return `${Math.round(seconds / 3600)}h ago`;
}

export function formatUptime(seconds: number | undefined): string {
    if (!seconds || seconds < 0) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m`;
    return `${Math.round(seconds)}s`;
}
