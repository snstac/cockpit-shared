// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import cockpit from 'cockpit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TlsUploadCard } from './tlsCard';

const spawn = vi.mocked(cockpit.spawn);
const file = vi.mocked(cockpit.file);

let replace: ReturnType<typeof vi.fn>;

const TLS_DIR = '/etc/aiscot/tls';

function renderCard(extra: Partial<React.ComponentProps<typeof TlsUploadCard>> = {}) {
    const onToast = vi.fn();
    const onInstalledPaths = vi.fn();
    const utils = render(
        <TlsUploadCard
            tlsDir={TLS_DIR}
            keyUser="aiscot"
            testIdPrefix="aiscot"
            onToast={onToast}
            onInstalledPaths={onInstalledPaths}
            {...extra}
        />
    );
    return { ...utils, onToast, onInstalledPaths };
}

function expand() {
    fireEvent.click(screen.getByRole('button', { name: 'Expand TLS upload' }));
}

function form(container: HTMLElement): HTMLFormElement {
    const f = container.querySelector('form');
    if (!f) throw new Error('form not rendered');
    return f;
}

function choose(container: HTMLElement, name: 'tls-cert' | 'tls-key' | 'tls-ca', body: string) {
    const input = container.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File([body], `${name}.pem`, { type: 'text/plain' })],
    });
}

const SPAWN_OPTS = { superuser: 'try', err: 'message' };

function dirSetupCalls() {
    return [
        [['mkdir', '-p', TLS_DIR], SPAWN_OPTS],
        [['chown', 'root:aiscot', TLS_DIR], SPAWN_OPTS],
        [['chmod', '0750', TLS_DIR], SPAWN_OPTS],
    ];
}

function fileCalls(name: string) {
    const path = `${TLS_DIR}/${name}`;
    return [
        [['chown', 'root:aiscot', path], SPAWN_OPTS],
        [['chmod', '0640', path], SPAWN_OPTS],
    ];
}

beforeEach(() => {
    spawn.mockReset();
    spawn.mockResolvedValue('');
    file.mockReset();
    replace = vi.fn().mockResolvedValue(undefined);
    file.mockImplementation(() => ({ replace } as unknown as ReturnType<typeof cockpit.file>));
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('TlsUploadCard layout', () => {
    it('starts collapsed and toggles open and closed', () => {
        const { container } = renderCard();
        expect(container.querySelector('form')).toBeNull();
        const toggle = screen.getByRole('button', { name: 'Expand TLS upload' });
        expect(toggle.id).toBe('aiscot-tls-expand');
        fireEvent.click(toggle);
        expect(container.querySelector('form')).not.toBeNull();
        const collapse = screen.getByRole('button', { name: 'Collapse TLS upload' });
        fireEvent.click(collapse);
        expect(container.querySelector('form')).toBeNull();
        expect(screen.getByText('TLS certificates')).toBeTruthy();
    });

    it('uses the default className and test id', () => {
        renderCard();
        const card = screen.getByTestId('aiscot-tls-card');
        expect(card.classList.contains('aiscot-expandable-card')).toBe(true);
    });

    it('accepts a className override', () => {
        renderCard({ className: 'custom-card' });
        const card = screen.getByTestId('aiscot-tls-card');
        expect(card.classList.contains('custom-card')).toBe(true);
        expect(card.classList.contains('aiscot-expandable-card')).toBe(false);
    });

    it('shows the TLS directory and the default intro', () => {
        renderCard();
        expand();
        expect(screen.getByText(TLS_DIR).tagName).toBe('CODE');
        expect(screen.getByText(/Paths are applied to PyTAK TLS settings below\./)).toBeTruthy();
    });

    it('accepts an intro override', () => {
        renderCard({ intro: <em>Custom intro.</em> });
        expand();
        expect(screen.getByText('Custom intro.').tagName).toBe('EM');
        expect(screen.queryByText(/Paths are applied/)).toBeNull();
    });
});

describe('TlsUploadCard install', () => {
    it('warns when no file is chosen and does nothing else', async () => {
        const { container, onToast, onInstalledPaths } = renderCard();
        expand();
        fireEvent.submit(form(container));
        expect(onToast).toHaveBeenCalledWith({ variant: 'warning', title: 'Choose at least one file to upload.' });
        expect(spawn).not.toHaveBeenCalled();
        expect(onInstalledPaths).not.toHaveBeenCalled();
    });

    it.each([
        ['tls-cert', 'client.crt', 'cert'],
        ['tls-key', 'client.key', 'key'],
        ['tls-ca', 'ca.crt', 'ca'],
    ] as const)('installs only %s as %s', async (input, name, key) => {
        const { container, onToast, onInstalledPaths } = renderCard();
        expand();
        choose(container, input, `PEM-${key}`);
        fireEvent.submit(form(container));
        await waitFor(() => expect(onInstalledPaths).toHaveBeenCalledOnce());
        expect(onInstalledPaths).toHaveBeenCalledWith({ [key]: `${TLS_DIR}/${name}` });
        expect(file).toHaveBeenCalledWith(`${TLS_DIR}/${name}`, { superuser: 'try' });
        expect(replace).toHaveBeenCalledWith(`PEM-${key}`);
        expect(spawn.mock.calls).toEqual([...dirSetupCalls(), ...fileCalls(name)]);
        expect(onToast).toHaveBeenCalledWith({ variant: 'success', title: `TLS files installed under ${TLS_DIR}.` });
    });

    it('installs all three files in order and resets the form', async () => {
        const resetSpy = vi.spyOn(HTMLFormElement.prototype, 'reset');
        const { container, onInstalledPaths } = renderCard();
        expand();
        choose(container, 'tls-cert', 'CERT');
        choose(container, 'tls-key', 'KEY');
        choose(container, 'tls-ca', 'CA');
        fireEvent.submit(form(container));
        await waitFor(() => expect(onInstalledPaths).toHaveBeenCalledOnce());
        expect(onInstalledPaths).toHaveBeenCalledWith({
            cert: `${TLS_DIR}/client.crt`,
            key: `${TLS_DIR}/client.key`,
            ca: `${TLS_DIR}/ca.crt`,
        });
        expect(replace.mock.calls).toEqual([['CERT'], ['KEY'], ['CA']]);
        expect(spawn.mock.calls).toEqual([
            ...dirSetupCalls(),
            ...fileCalls('client.crt'),
            ...fileCalls('client.key'),
            ...fileCalls('ca.crt'),
        ]);
        expect(resetSpy).toHaveBeenCalledOnce();
        resetSpy.mockRestore();
    });

    it('shows a busy, disabled button while installing', async () => {
        let release: ((v: string) => void) | undefined;
        spawn.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve }));
        const { container, onToast } = renderCard();
        expand();
        choose(container, 'tls-cert', 'CERT');
        expect((screen.getByRole('button', { name: 'Install TLS files' }) as HTMLButtonElement).disabled).toBe(false);
        fireEvent.submit(form(container));
        const busy = await screen.findByRole('button', { name: 'Installing…' }) as HTMLButtonElement;
        expect(busy.disabled).toBe(true);
        await act(async () => {
            release?.('');
        });
        await waitFor(() => expect(onToast).toHaveBeenCalledOnce());
        const idle = screen.getByRole('button', { name: 'Install TLS files' }) as HTMLButtonElement;
        expect(idle.disabled).toBe(false);
    });

    it('toasts a failure and does not report paths', async () => {
        spawn.mockReset();
        spawn.mockResolvedValueOnce('').mockRejectedValueOnce(new Error('chown: invalid group'));
        const { container, onToast, onInstalledPaths } = renderCard();
        expand();
        choose(container, 'tls-key', 'KEY');
        fireEvent.submit(form(container));
        await waitFor(() => expect(onToast).toHaveBeenCalledOnce());
        expect(onToast).toHaveBeenCalledWith({ variant: 'danger', title: 'TLS install failed: chown: invalid group' });
        expect(onInstalledPaths).not.toHaveBeenCalled();
        expect((screen.getByRole('button', { name: 'Install TLS files' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('toasts a non-Error failure as a string', async () => {
        replace.mockRejectedValue('disk full');
        const { container, onToast } = renderCard();
        expand();
        choose(container, 'tls-ca', 'CA');
        fireEvent.submit(form(container));
        await waitFor(() => expect(onToast).toHaveBeenCalledWith({ variant: 'danger', title: 'TLS install failed: disk full' }));
    });

    it('toasts a file read failure', async () => {
        class FailingReader {
            result: string | null = null;
            error = new Error('read failed');
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            readAsText() {
                setTimeout(() => this.onerror?.(), 0);
            }
        }
        vi.stubGlobal('FileReader', FailingReader);
        const { container, onToast } = renderCard();
        expand();
        choose(container, 'tls-cert', 'CERT');
        fireEvent.submit(form(container));
        await waitFor(() => expect(onToast).toHaveBeenCalledWith({ variant: 'danger', title: 'TLS install failed: read failed' }));
    });

    it('writes an empty body when the reader yields no result', async () => {
        class EmptyReader {
            result: string | null = null;
            error = null;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            readAsText() {
                setTimeout(() => this.onload?.(), 0);
            }
        }
        vi.stubGlobal('FileReader', EmptyReader);
        const { container, onInstalledPaths } = renderCard();
        expand();
        choose(container, 'tls-cert', 'CERT');
        fireEvent.submit(form(container));
        await waitFor(() => expect(onInstalledPaths).toHaveBeenCalledOnce());
        expect(replace).toHaveBeenCalledWith('');
    });
});
