/*
 * Copyright Sensors & Signals LLC https://www.snstac.com/
 */

import React, { useCallback, useState } from 'react';
import {
    Card,
    CardBody,
    CardExpandableContent,
    CardHeader,
    CardTitle,
} from '@patternfly/react-core/dist/esm/components/Card/index.js';
import cockpit from 'cockpit';
import type { ToastMessage } from './serviceCard';

const _ = cockpit.gettext;

type TlsUploadCardProps = {
    /** Canonical TLS directory, e.g. "/etc/aiscot/tls"; readable by the service system user. */
    tlsDir: string;
    /** System user (group) that must be able to read the installed files. */
    keyUser: string;
    /** Prefix for data-testid / element ids / CSS class, e.g. "aiscot". */
    testIdPrefix: string;
    /** Trailing intro sentence rendered after "Upload PEM bundles to <tlsDir>.". */
    intro?: React.ReactNode;
    onToast: (t: ToastMessage) => void;
    onInstalledPaths: (paths: { cert?: string; key?: string; ca?: string }) => void;
};

export function TlsUploadCard({
    tlsDir,
    keyUser,
    testIdPrefix,
    intro,
    onToast,
    onInstalledPaths,
}: TlsUploadCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [busy, setBusy] = useState(false);

    const onInstall = useCallback(
        async (ev: React.FormEvent<HTMLFormElement>) => {
            async function ensureTlsDir(): Promise<void> {
                await cockpit.spawn(['mkdir', '-p', tlsDir], { superuser: 'try', err: 'message' });
                await cockpit.spawn(['chown', `root:${keyUser}`, tlsDir], {
                    superuser: 'try',
                    err: 'message',
                });
                await cockpit.spawn(['chmod', '0750', tlsDir], { superuser: 'try', err: 'message' });
            }

            async function writeTlsFile(relativeName: string, body: string, mode: string): Promise<void> {
                const path = `${tlsDir}/${relativeName}`;
                await cockpit.file(path, { superuser: 'try' }).replace(body);
                await cockpit.spawn(['chown', `root:${keyUser}`, path], {
                    superuser: 'try',
                    err: 'message',
                });
                await cockpit.spawn(['chmod', mode, path], { superuser: 'try', err: 'message' });
            }

            function readFileAsText(file: File): Promise<string> {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result ?? ''));
                    reader.onerror = () => reject(reader.error);
                    reader.readAsText(file);
                });
            }

            ev.preventDefault();
            const form = ev.currentTarget;
            const certInput = form.elements.namedItem('tls-cert') as HTMLInputElement;
            const keyInput = form.elements.namedItem('tls-key') as HTMLInputElement;
            const caInput = form.elements.namedItem('tls-ca') as HTMLInputElement;

            const certFile = certInput?.files?.[0];
            const keyFile = keyInput?.files?.[0];
            const caFile = caInput?.files?.[0];

            if (!certFile && !keyFile && !caFile) {
                onToast({ variant: 'warning', title: _('Choose at least one file to upload.') });
                return;
            }

            setBusy(true);
            try {
                await ensureTlsDir();

                if (certFile) {
                    const text = await readFileAsText(certFile);
                    await writeTlsFile('client.crt', text, '0640');
                }
                if (keyFile) {
                    const text = await readFileAsText(keyFile);
                    await writeTlsFile('client.key', text, '0640');
                }
                if (caFile) {
                    const text = await readFileAsText(caFile);
                    await writeTlsFile('ca.crt', text, '0640');
                }

                const paths: { cert?: string; key?: string; ca?: string } = {};
                if (certFile) paths.cert = `${tlsDir}/client.crt`;
                if (keyFile) paths.key = `${tlsDir}/client.key`;
                if (caFile) paths.ca = `${tlsDir}/ca.crt`;
                onInstalledPaths(paths);
                onToast({
                    variant: 'success',
                    title: _('TLS files installed under {0}.').replace('{0}', tlsDir),
                });
                form.reset();
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                onToast({
                    variant: 'danger',
                    title: _('TLS install failed: {0}').replace('{0}', msg),
                });
            } finally {
                setBusy(false);
            }
        },
        [tlsDir, keyUser, onToast, onInstalledPaths]
    );

    return (
        <Card
            isExpanded={expanded}
            className={`${testIdPrefix}-expandable-card`}
            data-testid={`${testIdPrefix}-tls-card`}
        >
            <CardHeader
                className="ct-card-expandable-header"
                onExpand={() => setExpanded(!expanded)}
                toggleButtonProps={{
                    id: `${testIdPrefix}-tls-expand`,
                    'aria-label': expanded ? _('Collapse TLS upload') : _('Expand TLS upload'),
                }}
            >
                <CardTitle>{_('TLS certificates')}</CardTitle>
            </CardHeader>
            <CardExpandableContent>
                <CardBody>
                    <p>
                        {_('Upload PEM bundles to')} <code>{tlsDir}</code>
                        {'. '}
                        {intro ?? _('Paths are applied to PyTAK TLS settings below.')}
                    </p>
                    <form onSubmit={onInstall}>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ display: 'block', marginBottom: 4 }}>
                                {_('Client certificate (.crt / .pem)')}
                            </label>
                            <input name="tls-cert" type="file" accept=".crt,.pem,.cer,text/plain" />
                        </div>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ display: 'block', marginBottom: 4 }}>{_('Client key')}</label>
                            <input name="tls-key" type="file" accept=".key,.pem,text/plain" />
                        </div>
                        <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ display: 'block', marginBottom: 4 }}>{_('CA bundle (optional)')}</label>
                            <input name="tls-ca" type="file" accept=".crt,.pem,.cer,text/plain" />
                        </div>
                        <button
                            type="submit"
                            className="pf-c-button pf-m-primary"
                            disabled={busy}
                        >
                            {busy ? _('Installing…') : _('Install TLS files')}
                        </button>
                    </form>
                </CardBody>
            </CardExpandableContent>
        </Card>
    );
}
