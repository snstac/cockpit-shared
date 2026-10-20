// @vitest-environment jsdom
/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Sparkline } from './sparkline';

afterEach(cleanup);

function paths(container: HTMLElement): { area: string; line: string } {
    const [area, line] = Array.from(container.querySelectorAll('path')).map(p => p.getAttribute('d') ?? '');
    return { area, line };
}

describe('Sparkline', () => {
    it('renders an accessible svg with default size and generated label', () => {
        const { container } = render(<Sparkline data={[1, 2, 3]} />);
        const svg = screen.getByRole('img');
        expect(svg.getAttribute('aria-label')).toBe('6 over the last 3 intervals');
        expect(svg.getAttribute('width')).toBe('120');
        expect(svg.getAttribute('height')).toBe('28');
        expect(svg.getAttribute('viewBox')).toBe('0 0 120 28');
        expect(container.querySelector('title')?.textContent).toBe('6 over the last 3 intervals');
    });

    it('uses a caller label and className', () => {
        render(<Sparkline data={[1]} label="custom" className="spark" />);
        const svg = screen.getByRole('img', { name: 'custom' });
        expect(svg.getAttribute('class')).toBe('spark');
    });

    it('scales from a zero baseline, not from the minimum', () => {
        const { container } = render(<Sparkline data={[5, 10]} width={100} height={22} />);
        // max=10 -> y = 22 - v/10*20 - 1 ; 5 -> 11, 10 -> 1
        const { line, area } = paths(container);
        expect(line).toBe('M0.0,11.0 L100.0,1.0');
        expect(area).toBe('M0.0,11.0 L100.0,1.0 L100,22 L0,22 Z');
    });

    it('draws all-zero data as a flat line on the floor', () => {
        const { container } = render(<Sparkline data={[0, 0, 0]} width={10} height={10} />);
        expect(paths(container).line).toBe('M0.0,9.0 L5.0,9.0 L10.0,9.0');
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('0 over the last 3 intervals');
    });

    it('renders a single point', () => {
        const { container } = render(<Sparkline data={[4]} width={10} height={10} />);
        expect(paths(container).line).toBe('M0.0,1.0');
    });

    it('treats empty data as a single zero point', () => {
        const { container } = render(<Sparkline data={[]} width={10} height={10} />);
        expect(paths(container).line).toBe('M0.0,9.0');
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('0 over the last 1 intervals');
    });

    it('survives missing data', () => {
        const { container } = render(<Sparkline data={undefined as unknown as number[]} />);
        expect(paths(container).line).toBe('M0.0,27.0');
    });
});
