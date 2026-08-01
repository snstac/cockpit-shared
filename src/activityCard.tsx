/*
 * Copyright 2026 Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Is this gateway actually hearing anything?" as a single card.
 *
 * Shows decode rate and trend, gateway health, and a feed of the most recent
 * contacts, from the status file pytak's StatusWriter maintains. Every pytak
 * gateway gets the same card; only the `columns` differ, because a tail number
 * and an ACARS label matter for one and an MMSI matters for another.
 */

import React from 'react';

import { Alert } from '@patternfly/react-core/dist/esm/components/Alert/index.js';
import { Card, CardBody, CardTitle } from '@patternfly/react-core/dist/esm/components/Card/index.js';

import { Sparkline } from './sparkline';
import {
    type Freshness,
    type GatewayContact,
    type GatewayStatus,
    contactRate,
    formatAgo,
    formatUptime,
    trendDirection,
    useGatewayStatus,
} from './gatewayStatus';

export type ActivityColumn = {
    /** Key into the contact object. */
    key: string;
    label: string;
    /** Optional renderer; defaults to the raw value. */
    render?: (value: unknown, contact: GatewayContact) => React.ReactNode;
};

export type GatewayActivityCardProps = {
    /** Gateway name, matching /run/<appName>/status.json. */
    appName: string;
    /** Card heading, e.g. "ACARS Activity". */
    title?: string;
    /** Columns for the recent-contacts feed. */
    columns: ActivityColumn[];
    /** What one row is called, e.g. "message", "vessel", "aircraft". */
    noun?: string;
    /** How many recent rows to show. */
    limit?: number;
    /** Counters to surface as headline figures, in order. */
    counterLabels?: Record<string, string>;
};

const FRESHNESS_COPY: Record<
    Freshness,
    { variant: 'success' | 'info' | 'warning' | 'danger'; text: string }
> = {
    live: { variant: 'success', text: 'Receiving' },
    quiet: { variant: 'info', text: 'Running, nothing heard recently' },
    stale: { variant: 'warning', text: 'Status has stopped updating' },
    missing: { variant: 'danger', text: 'No status from this gateway' },
    degraded: { variant: 'warning', text: 'Gateway cannot write status' },
};

const TREND_GLYPH = { up: '▲', down: '▼', flat: '—' } as const;

function formatClock(t: number): string {
    if (!t || !isFinite(t)) return '—';
    return new Date(t * 1000).toLocaleTimeString(undefined, { hour12: false });
}

function formatCell(value: unknown): React.ReactNode {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    if (typeof value === 'number') {
        return Number.isInteger(value) ? value : value.toFixed(2);
    }
    return String(value);
}

function Metric({ value, label }: { value: React.ReactNode; label: string }) {
    return (
        <div className="aos-metric">
            <span className="aos-metric-value">{value}</span>
            <span className="aos-metric-label">{label}</span>
        </div>
    );
}

function ActivityMetrics({
    status,
    noun,
    counterLabels,
}: {
    status: GatewayStatus;
    noun: string;
    // Explicitly `| undefined` rather than optional: the repo builds with
    // exactOptionalPropertyTypes, under which `?:` refuses an explicitly
    // passed undefined.
    counterLabels: Record<string, string> | undefined;
}) {
    const rate = contactRate(status);
    const direction = trendDirection(status);
    const buckets = status.trend?.length ?? 0;
    const minutes = Math.round((status.trend_interval_s || 60) / 60);

    return (
        <div className="aos-activity-metrics">
            <Metric
                value={rate === null ? '—' : rate.toFixed(rate < 10 ? 1 : 0)}
                label={`${noun}s/min`}
            />
            <Metric value={TREND_GLYPH[direction]} label="trend" />
            {Object.entries(counterLabels ?? {}).map(([key, label]) => (
                <Metric
                    key={key}
                    value={(status.counters?.[key] ?? 0).toLocaleString()}
                    label={label}
                />
            ))}
            <Metric value={formatUptime(status.uptime_s)} label="uptime" />
            <div className="aos-activity-spark">
                <Sparkline
                    data={status.trend ?? []}
                    label={`${noun}s per ${minutes} minute over the last ${buckets}`}
                />
            </div>
        </div>
    );
}

function ContactRow({
    contact,
    columns,
}: {
    contact: GatewayContact;
    columns: ActivityColumn[];
}) {
    return (
        <tr>
            <td className="aos-activity-time">{formatClock(contact.t)}</td>
            {columns.map(col => (
                <td key={col.key}>
                    {col.render ? col.render(contact[col.key], contact) : formatCell(contact[col.key])}
                </td>
            ))}
        </tr>
    );
}

function ContactTable({
    contacts,
    columns,
    noun,
}: {
    contacts: GatewayContact[];
    columns: ActivityColumn[];
    noun: string;
}) {
    if (contacts.length === 0) {
        return <p className="aos-activity-empty">No {noun}s recorded yet.</p>;
    }

    return (
        <table className="aos-activity-table">
            <thead>
                <tr>
                    <th scope="col">Time</th>
                    {columns.map(col => (
                        <th scope="col" key={col.key}>{col.label}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {contacts.map((contact, index) => (
                    <ContactRow
                        key={`${contact.t}-${index}`}
                        contact={contact}
                        columns={columns}
                    />
                ))}
            </tbody>
        </table>
    );
}

function StateBanner({
    appName,
    freshness,
    secondsSinceChange,
    writeErrors,
}: {
    appName: string;
    freshness: Freshness;
    secondsSinceChange: number | null;
    writeErrors: number;
}) {
    const state = FRESHNESS_COPY[freshness];

    /*
     * Say WHEN, always. "Receiving" with no timestamp is exactly the claim
     * this card exists to stop being taken on faith: a wedged gateway is
     * indistinguishable from a working one without it.
     */
    const detail =
        freshness === 'missing'
            ? `No /run/${appName}/status.json. The gateway may be stopped, or running a pytak too old to report status.`
            : `Status last changed ${formatAgo(secondsSinceChange)}.`;

    const degraded =
        freshness === 'degraded'
            ? ` ${writeErrors} failed status write(s) — figures below may lag reality.`
            : '';

    return (
        <Alert isInline variant={state.variant} title={state.text} className="aos-activity-state">
            {detail}
            {degraded}
        </Alert>
    );
}

export function GatewayActivityCard({
    appName,
    title,
    columns,
    noun = 'contact',
    limit = 10,
    counterLabels,
}: GatewayActivityCardProps) {
    const { status, freshness, secondsSinceChange, clockSkew, error } =
        useGatewayStatus(appName);

    const recent = (status?.recent ?? []).slice(-limit).reverse();

    return (
        <Card>
            <CardTitle>{title ?? `${appName} activity`}</CardTitle>
            <CardBody>
                <StateBanner
                    appName={appName}
                    freshness={freshness}
                    secondsSinceChange={secondsSinceChange}
                    writeErrors={status?.write_errors ?? 0}
                />

                {clockSkew && (
                    <Alert
                        isInline
                        variant="warning"
                        title="Gateway and browser clocks disagree"
                        className="aos-activity-skew"
                    >
                        Timestamps below come from the gateway. Freshness is measured
                        locally, so it stays correct, but contact times may look wrong.
                    </Alert>
                )}

                {error && <Alert isInline variant="warning" title={error} />}

                {status && (
                    <ActivityMetrics
                        status={status}
                        noun={noun}
                        counterLabels={counterLabels}
                    />
                )}

                {status && (
                    <ContactTable contacts={recent} columns={columns} noun={noun} />
                )}
            </CardBody>
        </Card>
    );
}
