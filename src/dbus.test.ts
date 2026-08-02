/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

import { callAndClose } from './dbus';

describe('callAndClose', () => {
    it('closes the D-Bus client after a successful call', async () => {
        const client = {
            call: vi.fn().mockResolvedValue([{ v: 'active' }]),
            close: vi.fn(),
        };

        await expect(callAndClose(client, '/unit', 'iface', 'Get', ['value']))
                .resolves.toEqual([{ v: 'active' }]);
        expect(client.close).toHaveBeenCalledOnce();
    });

    it('also closes the client when the call rejects', async () => {
        const client = {
            call: vi.fn().mockRejectedValue(new Error('D-Bus failed')),
            close: vi.fn(),
        };

        await expect(callAndClose(client, '/unit', 'iface', 'Get'))
                .rejects.toThrow('D-Bus failed');
        expect(client.close).toHaveBeenCalledOnce();
    });
});
