declare module 'vscode-cache' {
    import {ExtensionContext} from 'vscode';
    export declare class Cache {
        constructor(context: ExtensionContext, key: string);
        put<T>(key: string, value: T): void;
        get<T>(key: string): T | undefined;
        has(key: string): boolean;
        forget(key: string): void;
    }
    declare const instance: Cache;
    export default instance;
    export = Cache;
}
