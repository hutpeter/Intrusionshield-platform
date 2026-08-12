import sql from "mssql";

export interface SqlParameter {
    name: string;

    type:
        | sql.ISqlTypeFactory
        | sql.ISqlTypeFactoryWithLength
        | sql.ISqlTypeFactoryWithScale
        | sql.ISqlTypeFactoryWithPrecisionScale;

    value: unknown;
}