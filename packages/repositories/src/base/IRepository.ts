/**
 * Defines the generic repository contract used by the platform.
 *
 * Repositories provide persistence operations for domain entities
 * without exposing the underlying database technology to the
 * application or domain layers.
 *
 * @typeParam TEntity The entity type managed by the repository.
 * @typeParam TId The type of the entity identifier.
 */
export interface IRepository<TEntity, TId> {
    /**
     * Finds an entity by its identifier.
     *
     * @param id Entity identifier.
     * @returns The entity if found, otherwise null.
     */
    findById(id: TId): Promise<TEntity | null>;

    /**
     * Returns all entities managed by the repository.
     *
     * @returns An array of entities.
     */
    findAll(): Promise<TEntity[]>;

    /**
     * Creates a new entity.
     *
     * @param entity Entity to persist.
     * @returns The persisted entity.
     */
    create(entity: TEntity): Promise<TEntity>;

    /**
     * Updates an existing entity.
     *
     * @param id Entity identifier.
     * @param entity Updated entity data.
     * @returns The updated entity.
     */
    update(
        id: TId,
        entity: TEntity
    ): Promise<TEntity>;

    /**
     * Deletes an entity by its identifier.
     *
     * @param id Entity identifier.
     * @returns True when an entity was deleted, otherwise false.
     */
    delete(id: TId): Promise<boolean>;

    /**
     * Determines whether an entity exists.
     *
     * @param id Entity identifier.
     * @returns True when the entity exists.
     */
    exists(id: TId): Promise<boolean>;
}
