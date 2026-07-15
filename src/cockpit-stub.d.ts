/*
 * Minimal ambient type stub for the 'cockpit' module, used ONLY for this
 * package's standalone typecheck/lint/test runs.
 *
 * Consumers do NOT use this file: cockpit plugins resolve 'cockpit' to the
 * real implementation and typings in their pkg/lib directory (via esbuild
 * nodePaths and a tsconfig "paths" mapping). This stub only declares the
 * subset of the API that the shared modules touch.
 */

declare module 'cockpit' {
    type SuperuserMode = 'require' | 'try' | null | undefined;

    interface SpawnOptions {
        superuser?: SuperuserMode;
        err?: 'out' | 'ignore' | 'message' | 'pty';
    }

    interface FileHandle {
        replace(new_content: string | null): Promise<unknown>;
    }

    interface DBusClient {
        call(
            path: string,
            iface: string,
            method: string,
            args?: unknown[],
            options?: object
        ): Promise<unknown[]>;
    }

    function gettext(message: string): string;
    function gettext(context: string, message?: string): string;
    function spawn(args: string[], options?: SpawnOptions): Promise<string>;
    function file(path: string, options?: { superuser?: SuperuserMode }): FileHandle;
    function dbus(name: string | null, options?: { superuser?: SuperuserMode }): DBusClient;
}
