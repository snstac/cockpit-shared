// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import * as api from './index';
import * as activityCard from './activityCard';
import * as envDefaultFile from './envDefaultFile';
import * as gatewayStatus from './gatewayStatus';
import * as serviceCard from './serviceCard';
import * as sparkline from './sparkline';
import * as tlsCard from './tlsCard';

describe('package entry point', () => {
    it('re-exports exactly the public runtime API', () => {
        expect(Object.keys(api).sort()).toEqual([
            'GatewayActivityCard',
            'ServiceManagementCard',
            'Sparkline',
            'TlsUploadCard',
            'contactRate',
            'defaultFormFromConf',
            'formatAgo',
            'formatUptime',
            'mergeFormValues',
            'parseEnvDefault',
            'recentContactCount',
            'serializeEnvDefault',
            'shellQuoteValue',
            'statusPath',
            'trendDirection',
            'useGatewayStatus',
        ]);
    });

    it('re-exports the module implementations themselves', () => {
        expect(api.GatewayActivityCard).toBe(activityCard.GatewayActivityCard);
        expect(api.ServiceManagementCard).toBe(serviceCard.ServiceManagementCard);
        expect(api.Sparkline).toBe(sparkline.Sparkline);
        expect(api.TlsUploadCard).toBe(tlsCard.TlsUploadCard);
        for (const name of ['defaultFormFromConf', 'mergeFormValues', 'parseEnvDefault',
            'serializeEnvDefault', 'shellQuoteValue'] as const)
            expect(api[name]).toBe(envDefaultFile[name]);
        for (const name of ['contactRate', 'formatAgo', 'formatUptime', 'recentContactCount',
            'statusPath', 'trendDirection', 'useGatewayStatus'] as const)
            expect(api[name]).toBe(gatewayStatus[name]);
        for (const value of Object.values(api))
            expect(typeof value).toBe('function');
    });
});
