# @snstac/cockpit-shared

Shared React/TypeScript source modules for the [Sensors & Signals](https://www.snstac.com/)
family of [Cockpit](https://cockpit-project.org/) plugins
(cockpit-aiscot, cockpit-adsbcot, cockpit-dronecot, cockpit-lincot, cockpit-charontak, …).

## What's shared

| Module | Exports | Purpose |
| --- | --- | --- |
| `src/serviceCard.tsx` | `ServiceManagementCard`, `ToastMessage` | systemd unit status + start/stop/restart/enable/disable card, driven by a `serviceName` prop |
| `src/tlsCard.tsx` | `TlsUploadCard` | Expandable TLS certificate upload card; parameterized by `tlsDir`, `keyUser`, `testIdPrefix`, optional `className` (Card CSS class; defaults to `` `${testIdPrefix}-expandable-card` ``), and optional `intro` text |
| `src/envDefaultFile.ts` | `parseEnvDefault`, `serializeEnvDefault`, `shellQuoteValue`, `defaultFormFromConf`, `mergeFormValues`, `DefaultEnvLine` | Parse/serialize systemd `EnvironmentFile` (`/etc/default/<svc>`) key=value files while preserving comments, blanks, unknown keys, and `export` prefixes. `serializeEnvDefault` takes an optional trailing `addedByComment` (default `# Added by Cockpit`) |
| `src/types.ts` | `EnvVarDefinition`, `EnvVarData` | Configuration parameter type definitions |

Everything is re-exported from `src/index.ts`.

## Consumption model: source shipping

This package ships **TypeScript/TSX source only** — there is no build step and no
`dist/`. Consumers bundle the `.ts`/`.tsx` files directly with esbuild, exactly like
their own `src/` files.

Add the dependency:

```json
"dependencies": {
    "@snstac/cockpit-shared": "github:snstac/cockpit-shared#v1.1.0"
}
```

and import:

```tsx
import {
    ServiceManagementCard,
    TlsUploadCard,
    parseEnvDefault,
    serializeEnvDefault,
    type EnvVarDefinition,
} from '@snstac/cockpit-shared';
```

## The `cockpit` import

These modules `import cockpit from 'cockpit'`. That module is **not** a dependency of
this package — it resolves in the *consumer* from its `pkg/lib` directory:

- at bundle time via the esbuild `nodePaths: ['pkg/lib']` setting in the consumer's
  `build.js`;
- at typecheck time via the consumer's tsconfig `"paths": { "*": ["./pkg/lib/*"] }`
  mapping (which resolves `cockpit` to `pkg/lib/cockpit.d.ts`).

For this package's own standalone `tsc`/`eslint`/`vitest` runs, a minimal ambient stub
(`src/cockpit-stub.d.ts`) declares just the API subset used here. The unit tests cover
only the pure `envDefaultFile` helpers and do not require a real cockpit runtime; the
React cards are exercised by the consuming plugins.

## Development

```sh
npm install        # dev deps (+ peer deps: react, @patternfly/react-core)
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run eslint     # eslint src/
```

## License

Apache-2.0 — Copyright Sensors & Signals LLC.
