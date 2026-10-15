export interface IRepository<TEntity, TId> {

    getById(
        id: TId
    ): Promise<TEntity | null>;

    add(
        entity: TEntity
    ): Promise<void>;

    update(
        entity: TEntity
    ): Promise<void>;

    delete(
        id: TId
    ): Promise<void>;

}