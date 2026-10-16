/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Test double for the bare 'cockpit' module, wired in by the alias in
 * vitest.config.ts. Not part of the published package (outside src/).
 * Tests reach the spies via `vi.mocked(cockpit.spawn)` etc.
 */

import { vi } from 'vitest';

export const gettext = vi.fn((message: string) => message);
export const spawn = vi.fn();
export const file = vi.fn();
export const dbus = vi.fn();

const cockpit = { gettext, spawn, file, dbus };
export default cockpit;
