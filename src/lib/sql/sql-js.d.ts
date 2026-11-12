/*
 * The part of sql.js (SQLite compiled to WebAssembly, https://sql.js.org) the site uses; the package ships no types.
 * Phase F.1a: the SQL playground runs it in a Web Worker in the browser and in Node for the tests.
 */
declare module 'sql.js' {
  export type SqlValue = number | string | Uint8Array | null;
  export interface Statement {
    getColumnNames(): string[];
    step(): boolean;
    get(): SqlValue[];
    getSQL(): string;
    /** F.1d: values for the statement's `?` placeholders, in order. */
    bind(values: SqlValue[]): boolean;
    free(): boolean;
  }
  export interface Database {
    run(sql: string): Database;
    /** Runs every statement (F.1d: the crash check's ROLLBACK). */
    exec(sql: string): unknown[];
    iterateStatements(sql: string): IterableIterator<Statement>;
    getRowsModified(): number;
    close(): void;
  }
  export interface SqlJsStatic { Database: new () => Database }
  export interface InitOptions { locateFile?: (file: string) => string }
  export default function initSqlJs(options?: InitOptions): Promise<SqlJsStatic>;
}
