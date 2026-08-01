/*
 * Copyright 2026 Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A small inline-SVG sparkline. No charting dependency: these plugins ship to
 * a Pi over a field link, and a chart library would cost more bundle than the
 * whole plugin.
 */

import React from 'react';

export type SparklineProps = {
    /** Counts per bucket, oldest first. */
    data: number[];
    width?: number;
    height?: number;
    /** Accessible description; a bare sparkline is invisible to a screen reader. */
    label?: string;
    className?: string;
};

/**
 * Renders counts as an area sparkline.
 *
 * Two decisions worth stating, because both are easy to get subtly wrong and
 * produce a chart that lies:
 *
 * **The baseline is always zero.** Scaling to [min..max] would make a flat
 * line at 3 contacts/min look identical to a flat line at 300, and would turn
 * trivial noise into dramatic peaks. An operator reads this to judge "is it
 * hearing anything", so absolute height has to mean something.
 *
 * **All-zero data draws a flat line on the floor, not an empty box.** Silence
 * is a real and important reading -- it is what a disconnected antenna looks
 * like -- so it gets drawn rather than blanked.
 */
export function Sparkline({
    data,
    width = 120,
    height = 28,
    label,
    className,
}: SparklineProps) {
    const points = data && data.length ? data : [0];
    const max = Math.max(...points, 1); // never divide by zero; zero-floor scale
    const step = points.length > 1 ? width / (points.length - 1) : width;

    const coords = points.map((value, index) => {
        const x = index * step;
        const y = height - (value / max) * (height - 2) - 1;
        return [x, y] as const;
    });

    const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;

    const total = points.reduce((a, b) => a + b, 0);
    const description = label ?? `${total} over the last ${points.length} intervals`;

    return (
        <svg
            className={className}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={description}
            focusable="false"
        >
            <title>{description}</title>
            <path d={area} fill="var(--sns-accent, #56b4e9)" fillOpacity="0.18" stroke="none" />
            <path
                d={line}
                fill="none"
                stroke="var(--sns-accent, #56b4e9)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}
