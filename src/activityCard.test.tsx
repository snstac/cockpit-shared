// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ActivityColumn, GatewayActivityCard, type GatewayActivityCardProps } from './activityCard';
import { type GatewayStatus, type GatewayStatusState, useGatewayStatus } from './gatewayStatus';

vi.mock('./gatewayStatus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./gatewayStatus')>();
    return { ...actual, useGatewayStatus: vi.fn() };
});

const hook = vi.mocked(useGatewayStatus);

function makeStatus(overrides: Partial<GatewayStatus> = {}): GatewayStatus {
    return {
        app: 'acarscot',
        wall_t: 1_700_000_000,
        uptime_s: 3720,
        counters: { rx: 12345, tx: 7 },
        trend: [1, 1, 1, 1, 1, 1],
        trend_interval_s: 60,
        recent: [],
        write_errors: 0,
        ...overrides,
    };
}

function setState(overrides: Partial<GatewayStatusState> = {}) {
    hook.mockReturnValue({
        status: makeStatus(),
        freshness: 'live',
        secondsSinceChange: 5,
        clockSkew: false,
        error: null,
        ...overrides,
    });
}

const COLUMNS: ActivityColumn[] = [{ key: 'tail', label: 'Tail' }];

function renderCard(props: Partial<GatewayActivityCardProps> = {}) {
    return render(<GatewayActivityCard appName="acarscot" columns={COLUMNS} {...props} />);
}

function clock(t: number): string {
    return new Date(t * 1000).toLocaleTimeString(undefined, { hour12: false });
}

function metric(label: string): string | null | undefined {
    const el = screen.getByText(label, { selector: '.aos-metric-label' });
    return el.parentElement?.querySelector('.aos-metric-value')?.textContent;
}

function bodyRows(container: HTMLElement): HTMLTableRowElement[] {
    return Array.from(container.querySelectorAll('tbody tr'));
}

beforeEach(() => {
    hook.mockReset();
    setState();
});

afterEach(cleanup);

describe('GatewayActivityCard banner', () => {
    it('subscribes to the named gateway and titles the card', () => {
        renderCard();
        expect(hook).toHaveBeenCalledWith('acarscot');
        expect(screen.getByText('acarscot activity')).toBeTruthy();
    });

    it('uses a caller title', () => {
        renderCard({ title: 'ACARS Activity' });
        expect(screen.getByText('ACARS Activity')).toBeTruthy();
        expect(screen.queryByText('acarscot activity')).toBeNull();
    });

    it.each([
        ['live', 'Receiving'],
        ['quiet', 'Running, nothing heard recently'],
        ['stale', 'Status has stopped updating'],
    ] as const)('%s says %j and when it last changed', (freshness, text) => {
        setState({ freshness, secondsSinceChange: 45 });
        renderCard();
        expect(screen.getByText(text)).toBeTruthy();
        expect(screen.getByText('Status last changed 45s ago.')).toBeTruthy();
        expect(screen.queryByText(/failed status write/)).toBeNull();
    });

    it('says never when nothing has been observed', () => {
        setState({ secondsSinceChange: null });
        renderCard();
        expect(screen.getByText('Status last changed never.')).toBeTruthy();
    });

    it('explains degraded with the write error count', () => {
        setState({ freshness: 'degraded', status: makeStatus({ write_errors: 3 }) });
        renderCard();
        expect(screen.getByText('Gateway cannot write status')).toBeTruthy();
        expect(screen.getByText(/Status last changed 5s ago\. 3 failed status write\(s\) — figures below may lag reality\./))
                .toBeTruthy();
    });

    it('explains missing and shows no metrics or table', () => {
        setState({ freshness: 'missing', status: null, secondsSinceChange: null });
        const { container } = renderCard();
        expect(screen.getByText('No status from this gateway')).toBeTruthy();
        expect(screen.getByText(
            'No /run/acarscot/status.json. The gateway may be stopped, or running a pytak too old to report status.'
        )).toBeTruthy();
        expect(container.querySelector('.aos-activity-metrics')).toBeNull();
        expect(container.querySelector('table')).toBeNull();
        expect(container.querySelector('.aos-activity-empty')).toBeNull();
    });

    it('warns about clock skew only when flagged', () => {
        const { unmount } = renderCard();
        expect(screen.queryByText('Gateway and browser clocks disagree')).toBeNull();
        unmount();
        setState({ clockSkew: true });
        renderCard();
        expect(screen.getByText('Gateway and browser clocks disagree')).toBeTruthy();
        expect(screen.getByText(/Freshness is measured\s+locally/)).toBeTruthy();
    });

    it('surfaces a parse error', () => {
        setState({ error: 'Status file could not be parsed' });
        renderCard();
        expect(screen.getByText('Status file could not be parsed')).toBeTruthy();
    });
});

describe('GatewayActivityCard metrics', () => {
    it('shows rate, trend, uptime and labelled counters in order', () => {
        const { container } = renderCard({
            noun: 'message',
            counterLabels: { rx: 'received', missing: 'dropped' },
        });
        expect(metric('messages/min')).toBe('1.0');
        expect(metric('trend')).toBe('—');
        expect(metric('received')).toBe((12345).toLocaleString());
        expect(metric('dropped')).toBe('0');
        expect(metric('uptime')).toBe('1h 2m');
        const labels = Array.from(container.querySelectorAll('.aos-metric-label')).map(e => e.textContent);
        expect(labels).toEqual(['messages/min', 'trend', 'received', 'dropped', 'uptime']);
    });

    it('shows no counters without counterLabels, and tolerates missing counters', () => {
        setState({ status: makeStatus({ counters: undefined as unknown as Record<string, number> }) });
        const { container } = renderCard({ counterLabels: { rx: 'received' } });
        expect(metric('received')).toBe('0');
        cleanup();
        renderCard();
        expect(Array.from(document.querySelectorAll('.aos-metric-label')).map(e => e.textContent))
                .toEqual(['contacts/min', 'trend', 'uptime']);
        expect(container).toBeTruthy();
    });

    it.each([
        [[1, 1, 1, 1, 1, 2], '1.2'],
        [[12, 12, 12, 12, 12, 12], '12'],
        [[9.96, 9.96], '10.0'],
    ])('formats rate for %j as %s', (trend, expected) => {
        setState({ status: makeStatus({ trend }) });
        renderCard();
        expect(metric('contacts/min')).toBe(expected);
    });

    it('shows a dash rate with no trend', () => {
        setState({ status: makeStatus({ trend: [] }) });
        renderCard();
        expect(metric('contacts/min')).toBe('—');
    });

    it('tolerates a status without a trend array', () => {
        setState({ status: makeStatus({ trend: undefined as unknown as number[] }) });
        renderCard();
        expect(metric('contacts/min')).toBe('—');
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('contacts per 1 minute over the last 0');
    });

    it.each([
        [[1, 1, 1, 9, 9, 9], '▲'],
        [[9, 9, 9, 1, 1, 1], '▼'],
    ])('shows the trend glyph for %j', (trend, glyph) => {
        setState({ status: makeStatus({ trend }) });
        renderCard();
        expect(metric('trend')).toBe(glyph);
    });

    it('labels the sparkline with the bucket size and count', () => {
        setState({ status: makeStatus({ trend_interval_s: 300, trend: [1, 2, 3] }) });
        renderCard({ noun: 'vessel' });
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('vessels per 5 minute over the last 3');
    });

    it.each([
        [20, 'contacts per 20 seconds over the last 6'],
        [1, 'contacts per 1 second over the last 6'],
        [90, 'contacts per 90 seconds over the last 6'],
    ])('labels a %ss bucket in seconds', (trend_interval_s, label) => {
        setState({ status: makeStatus({ trend_interval_s }) });
        renderCard();
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe(label);
    });

    it('defaults the sparkline bucket to one minute', () => {
        setState({ status: makeStatus({ trend_interval_s: 0 }) });
        renderCard();
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('contacts per 1 minute over the last 6');
    });
});

describe('GatewayActivityCard contacts', () => {
    const contacts = Array.from({ length: 12 }, (_, i) => ({ t: 1_700_000_000 + i, tail: `N${i}` }));

    it('shows the newest ten first by default', () => {
        setState({ status: makeStatus({ recent: contacts }) });
        const { container } = renderCard();
        const rows = bodyRows(container);
        expect(rows).toHaveLength(10);
        expect(rows.map(r => r.cells[1].textContent)).toEqual(
            ['N11', 'N10', 'N9', 'N8', 'N7', 'N6', 'N5', 'N4', 'N3', 'N2']);
        expect(rows[0].cells[0].textContent).toBe(clock(1_700_000_011));
        expect(rows[0].cells[0].className).toBe('aos-activity-time');
    });

    it('honours limit', () => {
        setState({ status: makeStatus({ recent: contacts }) });
        const { container } = renderCard({ limit: 2 });
        expect(bodyRows(container).map(r => r.cells[1].textContent)).toEqual(['N11', 'N10']);
    });

    it.each([0, -1])('shows no rows for limit=%s', (limit) => {
        setState({ status: makeStatus({ recent: contacts }) });
        const { container } = renderCard({ limit });
        expect(bodyRows(container)).toHaveLength(0);
        expect(screen.getByText('No contacts recorded yet.')).toBeTruthy();
    });

    it('renders column headers', () => {
        setState({ status: makeStatus({ recent: contacts.slice(0, 1) }) });
        const { container } = renderCard({ columns: [...COLUMNS, { key: 'label', label: 'Label' }] });
        const headers = Array.from(container.querySelectorAll('thead th')).map(th => th.textContent);
        expect(headers).toEqual(['Time', 'Tail', 'Label']);
    });

    it('uses a custom column renderer with value and contact', () => {
        const render = vi.fn((value: unknown, contact: { t: number }) => <b>{`${String(value)}@${contact.t}`}</b>);
        setState({ status: makeStatus({ recent: [{ t: 5, tail: 'N1' }] }) });
        const { container } = renderCard({ columns: [{ key: 'tail', label: 'Tail', render }] });
        expect(render).toHaveBeenCalledWith('N1', { t: 5, tail: 'N1' });
        expect(within(bodyRows(container)[0]).getByText('N1@5').tagName).toBe('B');
    });

    it('formats cell values', () => {
        const columns = ['nul', 'und', 'empty', 'yes', 'no', 'int', 'float', 'str'].map(key => ({ key, label: key }));
        setState({
            status: makeStatus({
                recent: [{
                    t: 0, nul: null, empty: '', yes: true, no: false, int: 42, float: 1.236, str: 'abc',
                }],
            }),
        });
        const { container } = renderCard({ columns });
        const cells = Array.from(bodyRows(container)[0].cells).map(c => c.textContent);
        expect(cells).toEqual(['—', '—', '—', '—', 'yes', 'no', '42', '1.24', 'abc']);
    });

    it('shows an empty-state paragraph using the noun', () => {
        setState({ status: makeStatus({ recent: [] }) });
        const { container } = renderCard({ noun: 'message' });
        expect(screen.getByText('No messages recorded yet.').className).toBe('aos-activity-empty');
        expect(container.querySelector('table')).toBeNull();
    });

    it('treats a missing recent list as empty', () => {
        setState({ status: makeStatus({ recent: undefined as unknown as GatewayStatus['recent'] }) });
        renderCard();
        expect(screen.getByText('No contacts recorded yet.')).toBeTruthy();
    });
});
