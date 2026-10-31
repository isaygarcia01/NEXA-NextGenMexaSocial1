import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: config.get<string>('NODE_ENV') === 'production'
        ? { rejectUnauthorized: true }
        : undefined,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query('SELECT 1');
    await this.runMigrations();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, [...values]);
  }

  async transaction<T>(work: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async runMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('nexa:schema_migrations'))");
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      const directory = join(process.cwd(), 'migrations');
      const files = (await readdir(directory))
        .filter((name) => /^\d+_[\w-]+\.sql$/.test(name))
        .sort();
      for (const name of files) {
        const { rowCount } = await client.query(
          'SELECT 1 FROM schema_migrations WHERE name = $1',
          [name],
        );
        if (rowCount) continue;
        const sql = await readFile(join(directory, name), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
        this.logger.log(`Applied database migration ${name}`);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('nexa:schema_migrations'))");
      client.release();
    }
  }
}
