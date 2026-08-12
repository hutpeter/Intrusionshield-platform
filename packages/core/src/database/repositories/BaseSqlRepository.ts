import type { DatabaseManager } from "../DatabaseManager.js";
import type { SqlParameter } from "../SqlParameter.js";
import type { SqlResult } from "../SqlResult.js";
import type { IRepository } from "./IRepository.js";

/**
 * Base class for repositories that persist entities through the
 * platform database abstraction.
 *
 * This class deliberately does not generate SQL automatically.
 * Concrete repositories are responsible for defining entity-specific
 * SQL statements while this class provides common database operations.
 *
 * @typeParam TEntity The entity type managed by the repository.
 * @typeParam TId The type of the entity identifier.
 */
export abstract class BaseSqlRepository<TEntity, TId>
    implements IRepository<TEntity, TId>
{
    /**
     * Creates a repository backed by the supplied database manager.
     *
     * @param database Database manager used to execute database operations.
     */
    protected constructor(
        protected readonly database: DatabaseManager
    ) {}

    /**
     * Finds an entity by its identifier.
     *
     * Concrete repositories must provide the SQL required to retrieve
     * the entity.
     *
     * @param id Entity identifier.
     */
    public abstract findById(
        id: TId
    ): Promise<TEntity | null>;

    /**
     * Returns all entities managed by the repository.
     *
     * Concrete repositories must provide the SQL required to retrieve
     * the entities.
     */
    public abstract findAll(): Promise<TEntity[]>;

    /**
     * Creates a new entity.
     *
     * Concrete repositories must define the appropriate INSERT operation.
     *
     * @param entity Entity to persist.
     */
    public abstract create(
        entity: TEntity
    ): Promise<TEntity>;

    /**
     * Updates an existing entity.
     *
     * Concrete repositories must define the appropriate UPDATE operation.
     *
     * @param id Entity identifier.
     * @param entity Updated entity data.
     */
    public abstract update(
        id: TId,
        entity: TEntity
    ): Promise<TEntity>;

    /**
     * Deletes an entity by its identifier.
     *
     * Concrete repositories must define the appropriate DELETE operation.
     *
     * @param id Entity identifier.
     */
    public abstract delete(
        id: TId
    ): Promise<boolean>;

    /**
     * Determines whether an entity exists.
     *
     * Concrete repositories can override this when a more efficient
     * entity-specific implementation is available.
     *
     * @param id Entity identifier.
     */
    public async exists(
        id: TId
    ): Promise<boolean> {
        return (await this.findById(id)) !== null;
    }

    /**
     * Executes a parameterized query through the database manager.
     *
     * This helper is intended for concrete repositories.
     *
     * @param sql SQL statement to execute.
     * @param parameters Optional query parameters.
     */
    protected async query<T>(
        sql: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult<T>> {
        return this.database.query<T>(
            sql,
            parameters
        );
    }

    /**
     * Executes a parameterized command through the database manager.
     *
     * This helper is intended for concrete repositories.
     *
     * @param sql SQL statement to execute.
     * @param parameters Optional query parameters.
     * @returns Number of rows affected.
     */
    protected async execute(
        sql: string,
        parameters: SqlParameter[] = []
    ): Promise<number> {
        return this.database.execute(
            sql,
            parameters
        );
    }
}