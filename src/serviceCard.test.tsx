// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import cockpit from 'cockpit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceManagementCard } from './serviceCard';

type Props = Record<string, unknown>;

const dbus = vi.mocked(cockpit.dbus);
const spawn = vi.mocked(cockpit.spawn);

let close: ReturnType<typeof vi.fn>;
let call: ReturnType<typeof vi.fn>;

/** Every D-Bus Get answers from `props`; `fail` makes every call reject. */
function serveProps(props: Props, { fail = false } = {}) {
    close = vi.fn();
    call = vi.fn(async (_path: string, _iface: string, _method: string, args?: unknown[]) => {
        if (fail) throw new Error('Access denied');
        const name = String(args?.[1]);
        return name in props ? [{ v: props[name] }] : [{}];
    });
    dbus.mockImplementation(() => ({ call, close } as unknown as ReturnType<typeof cockpit.dbus>));
}

const RUNNING: Props = {
    ActiveState: 'active',
    SubState: 'running',
    LoadState: 'loaded',
    UnitFileState: 'enabled',
    Description: 'AIS to Cursor on Target gateway',
    Documentation: ['https://example.com/aiscot', 'man:aiscot(1)'],
};

function renderCard(serviceName = 'aiscot') {
    const onToast = vi.fn();
    const utils = render(<ServiceManagementCard serviceName={serviceName} onToast={onToast} />);
    return { ...utils, onToast };
}

function dot(container: HTMLElement): HTMLElement | null {
    return container.querySelector('span[style*="border-radius"]');
}

function button(name: string): HTMLButtonElement {
    return screen.getByRole('button', { name }) as HTMLButtonElement;
}

beforeEach(() => {
    dbus.mockReset();
    spawn.mockReset();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('ServiceManagementCard status', () => {
    it('reads unit properties over D-Bus as superuser try and closes each client', async () => {
        serveProps(RUNNING);
        renderCard();
        await screen.findByText('Active');
        expect(dbus).toHaveBeenCalledWith('org.freedesktop.systemd1', { superuser: 'try' });
        expect(call).toHaveBeenCalledWith(
            '/org/freedesktop/systemd1/unit/aiscot_2eservice',
            'org.freedesktop.DBus.Properties',
            'Get',
            ['org.freedesktop.systemd1.Unit', 'ActiveState']
        );
        // ActiveState, SubState, LoadState, UnitFileState, Description, Documentation
        expect(call).toHaveBeenCalledTimes(6);
        expect(close).toHaveBeenCalledTimes(6);
    });

    it('shows an active unit in green with sub, load and enabled state', async () => {
        serveProps(RUNNING);
        const { container } = renderCard();
        await screen.findByText('Active');
        expect(screen.getByText(/\(Running\)/)).toBeTruthy();
        expect(screen.getByText(/Load: loaded/)).toBeTruthy();
        expect(screen.getByText(/Enabled: enabled/)).toBeTruthy();
        expect(dot(container)?.style.background).toBe('green');
        expect(screen.getByTestId('aiscot-service-card')).toBeTruthy();
    });

    it.each([
        ['inactive', 'Inactive', 'red'],
        ['failed', 'Failed', 'darkred'],
        ['activating', 'Activating', 'gray'],
    ])('colours %s as %s/%s', async (state, label, colour) => {
        serveProps({ ...RUNNING, ActiveState: state, SubState: '' });
        const { container } = renderCard();
        await screen.findByText(label);
        expect(dot(container)?.style.background).toBe(colour);
        expect(screen.queryByText(/\(/)).toBeNull();
    });

    it('shows unknown in gray before the first read and when properties are absent', async () => {
        serveProps({});
        const { container } = renderCard();
        expect(screen.getByText('Unknown')).toBeTruthy();
        expect(dot(container)?.style.background).toBe('gray');
        expect(screen.getByText(/Load: —/)).toBeTruthy();
        await waitFor(() => expect(screen.getByText(/Load:/).textContent).toBe('Load: '));
        expect(screen.getByText('Unknown')).toBeTruthy();
        expect(dot(container)?.style.background).toBe('gray');
    });

    it('warns and disables controls when the unit is not installed', async () => {
        serveProps({ ...RUNNING, ActiveState: 'inactive', LoadState: 'not-found' });
        renderCard('ghost');
        await screen.findByText('Service unit is not installed');
        expect(screen.getByText(/systemd has no ghost\.service/)).toBeTruthy();
        for (const name of ['Start', 'Stop', 'Restart', 'Enable', 'Disable'])
            expect(button(name).disabled).toBe(true);
    });

    it('shows a D-Bus error, hides the status line and disables controls', async () => {
        serveProps({}, { fail: true });
        const { container } = renderCard();
        await screen.findByText(/Could not read service status from systemd/);
        expect(dot(container)).toBeNull();
        expect(screen.queryByText('Service unit is not installed')).toBeNull();
        for (const name of ['Start', 'Stop', 'Restart', 'Enable', 'Disable'])
            expect(button(name).disabled).toBe(true);
        // Description and docs fall back.
        expect(screen.getByText('No description available for this service.')).toBeTruthy();
        expect(screen.getByText('Online Documentation').getAttribute('href'))
                .toBe('https://www.google.com/search?q=aiscot%20documentation');
    });

    it('polls every four seconds and clears the poll on unmount', async () => {
        vi.useFakeTimers();
        serveProps(RUNNING);
        const { unmount } = renderCard();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(call).toHaveBeenCalledTimes(6);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4000);
        });
        expect(call).toHaveBeenCalledTimes(10);
        unmount();
        await vi.advanceTimersByTimeAsync(8000);
        expect(call).toHaveBeenCalledTimes(10);
    });

    it('recovers from an error on the next successful poll', async () => {
        vi.useFakeTimers();
        serveProps({}, { fail: true });
        renderCard();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(screen.getByText(/Could not read service status/)).toBeTruthy();
        serveProps(RUNNING);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4000);
        });
        expect(screen.queryByText(/Could not read service status/)).toBeNull();
        expect(screen.getByText('Active')).toBeTruthy();
    });

    it('ignores D-Bus answers that arrive after unmount', async () => {
        let release: (() => void) | undefined;
        const gate = new Promise<void>(resolve => { release = resolve });
        close = vi.fn();
        call = vi.fn(async (_p: string, _i: string, _m: string, args?: unknown[]) => {
            await gate;
            if (String(args?.[1]) === 'ActiveState') throw new Error('late failure');
            return [{ v: 'x' }];
        });
        dbus.mockImplementation(() => ({ call, close } as unknown as ReturnType<typeof cockpit.dbus>));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { unmount } = renderCard();
        unmount();
        release?.();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(close).toHaveBeenCalledTimes(6);
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('ignores successful answers that arrive after unmount', async () => {
        let release: (() => void) | undefined;
        const gate = new Promise<void>(resolve => { release = resolve });
        close = vi.fn();
        call = vi.fn(async () => {
            await gate;
            return [{ v: 'x' }];
        });
        dbus.mockImplementation(() => ({ call, close } as unknown as ReturnType<typeof cockpit.dbus>));
        const { unmount } = renderCard();
        unmount();
        release?.();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(close).toHaveBeenCalledTimes(6);
    });
});

describe('ServiceManagementCard description and docs', () => {
    it('shows the unit Description', async () => {
        serveProps(RUNNING);
        renderCard();
        expect(await screen.findByText('AIS to Cursor on Target gateway')).toBeTruthy();
    });

    it('falls back when Description is not a string or empty', async () => {
        serveProps({ ...RUNNING, Description: 42 });
        renderCard();
        await screen.findByText('Active');
        expect(screen.getByText('No description available for this service.')).toBeTruthy();
    });

    it('links the first Documentation entry from an array', async () => {
        serveProps(RUNNING);
        renderCard();
        await waitFor(() =>
            expect(screen.getByText('Online Documentation').getAttribute('href'))
                    .toBe('https://example.com/aiscot'));
        const link = screen.getByText('Online Documentation');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('links a string Documentation property', async () => {
        serveProps({ ...RUNNING, Documentation: 'https://docs.example/x' });
        renderCard();
        await waitFor(() =>
            expect(screen.getByText('Online Documentation').getAttribute('href'))
                    .toBe('https://docs.example/x'));
    });

    it.each([
        ['an empty array', []],
        ['an empty string', ''],
        ['a non-string', 7],
    ])('falls back to a search link for %s', async (_label, doc) => {
        serveProps({ ...RUNNING, Documentation: doc });
        renderCard('my svc');
        await screen.findByText('Active');
        expect(screen.getByText('Online Documentation').getAttribute('href'))
                .toBe('https://www.google.com/search?q=my%20svc%20documentation');
    });
});

describe('ServiceManagementCard controls', () => {
    it.each([
        ['Start', 'start'],
        ['Stop', 'stop'],
        ['Restart', 'restart'],
        ['Enable', 'enable'],
        ['Disable', 'disable'],
    ])('%s runs systemctl %s and toasts success', async (label, action) => {
        serveProps(RUNNING);
        spawn.mockResolvedValue('');
        const { onToast } = renderCard();
        await screen.findByText('Active');
        fireEvent.click(button(label));
        await waitFor(() => expect(onToast).toHaveBeenCalledOnce());
        expect(spawn).toHaveBeenCalledWith(
            ['systemctl', action, 'aiscot.service'],
            { superuser: 'try', err: 'message' }
        );
        expect(onToast).toHaveBeenCalledWith({ variant: 'success', title: `Completed: ${label}` });
    });

    it('toasts the error message on failure', async () => {
        serveProps(RUNNING);
        spawn.mockRejectedValue(new Error('Job failed'));
        const { onToast } = renderCard();
        await screen.findByText('Active');
        fireEvent.click(button('Restart'));
        await waitFor(() => expect(onToast).toHaveBeenCalledOnce());
        expect(onToast).toHaveBeenCalledWith({ variant: 'danger', title: 'Failed: Restart: Job failed' });
    });

    it('toasts a non-Error rejection as a string', async () => {
        serveProps(RUNNING);
        spawn.mockRejectedValue('weird');
        const { onToast } = renderCard();
        await screen.findByText('Active');
        fireEvent.click(button('Stop'));
        await waitFor(() => expect(onToast).toHaveBeenCalledWith({ variant: 'danger', title: 'Failed: Stop: weird' }));
    });

    it('omits the detail when the rejection is empty', async () => {
        serveProps(RUNNING);
        spawn.mockRejectedValue('');
        const { onToast } = renderCard();
        await screen.findByText('Active');
        fireEvent.click(button('Stop'));
        await waitFor(() => expect(onToast).toHaveBeenCalledWith({ variant: 'danger', title: 'Failed: Stop' }));
    });

    it.each([
        'Unit aiscot.service failed: exit status 4',
        'Process exited with code 4',
        'systemctl: code 4',
    ])('explains a missing unit for %j', async (message) => {
        serveProps(RUNNING);
        spawn.mockRejectedValue(new Error(message));
        const { onToast } = renderCard();
        await screen.findByText('Active');
        fireEvent.click(button('Start'));
        await waitFor(() => expect(onToast).toHaveBeenCalledOnce());
        expect(onToast).toHaveBeenCalledWith({
            variant: 'danger',
            title: 'Failed: Start: Unit aiscot.service was not found. Install the package that provides this unit (or create the unit file), then refresh this page.',
        });
    });
});

describe('ServiceManagementCard D-Bus object path', () => {
    // systemd's bus_label_escape(): every byte outside [A-Za-z0-9] (and a
    // leading digit) becomes '_' plus two lowercase hex digits.
    it.each([
        ['aiscot', 'aiscot_2eservice'],
        ['dump1090-fa', 'dump1090_2dfa_2eservice'],
        ['getty@tty1', 'getty_40tty1_2eservice'],
        ['my_svc', 'my_5fsvc_2eservice'],
        ['a_be', 'a_5fbe_2eservice'],
        ['1090', '_31090_2eservice'],
    ])('addresses %s as .../unit/%s', async (serviceName, label) => {
        serveProps(RUNNING);
        renderCard(serviceName);
        await screen.findByText('Active');
        const paths = new Set(call.mock.calls.map(c => c[0]));
        expect([...paths]).toEqual([`/org/freedesktop/systemd1/unit/${label}`]);
    });
});
