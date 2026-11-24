/** WGS84 geographic coordinates in decimal degrees. */
export interface GeoPoint {
    readonly latitude: number;
    readonly longitude: number;
}

/**
 * Validate a point before it reaches provider-specific spatial SQL.
 * Latitude and longitude must be finite WGS84 decimal-degree coordinates.
 */
export function validateGeoPoint(point: GeoPoint): GeoPoint {
    if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
        throw new RangeError("WGS84 latitude must be a finite number between -90 and 90.");
    }
    if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
        throw new RangeError("WGS84 longitude must be a finite number between -180 and 180.");
    }
    return { latitude: point.latitude, longitude: point.longitude };
}

/** Reject invalid, negative or non-finite radius values before issuing spatial SQL. */
export function validateDistanceMetres(metres: number): number {
    if (!Number.isFinite(metres) || metres < 0) {
        throw new RangeError("Distance in metres must be finite and non-negative.");
    }
    return metres;
}
