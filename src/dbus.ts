/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ClosableDBusClient {
    close(problem?: string): void;
    call(
        path: string,
        iface: string,
        method: string,
        args?: unknown[],
        options?: object
    ): Promise<unknown[]>;
}

/** Make one D-Bus call and always release its Cockpit channel afterward. */
export async function callAndClose(
    client: ClosableDBusClient,
    path: string,
    iface: string,
    method: string,
    args?: unknown[]
): Promise<unknown[]> {
    try {
        return await client.call(path, iface, method, args);
    } finally {
        client.close();
    }
}
