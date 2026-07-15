/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 */

// Type Definitions
export type EnvVarDefinition = {
    type: 'boolean' | 'string' | 'number' | 'enum' | 'path' | 'url';
    description: string;
    defaultValue: string;
    validation?: RegExp;
    options?: string[];
    range?: [number, number];
    requiresQuoting?: boolean;
    required?: boolean;
};

export type EnvVarData = {
    value: string;
    quoted: boolean;
    quoteStyle: 'none' | 'double' | 'single';
    originalLine?: string;
    lineNumber?: number;
    commented: boolean;
    suggested?: boolean;
    required?: boolean;
};
