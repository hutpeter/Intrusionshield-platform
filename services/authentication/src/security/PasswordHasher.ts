import {
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual
} from "node:crypto";

import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const FORMAT = "scrypt";

export class PasswordHasher {
    public async hash(password: string): Promise<string> {
        if (!password) {
            throw new Error("Password is required.");
        }

        const salt = randomBytes(SALT_BYTES);
        const derivedKey = await scrypt(
            password,
            salt,
            KEY_LENGTH
        ) as Buffer;

        return [
            FORMAT,
            salt.toString("base64url"),
            derivedKey.toString("base64url")
        ].join("$");
    }

    public async verify(
        password: string,
        encodedHash: string
    ): Promise<boolean> {
        const [format, saltText, hashText, ...rest] =
            encodedHash.split("$");

        if (
            format !== FORMAT ||
            !saltText ||
            !hashText ||
            rest.length > 0
        ) {
            return false;
        }

        try {
            const salt = Buffer.from(
                saltText,
                "base64url"
            );

            const expected = Buffer.from(
                hashText,
                "base64url"
            );

            const actual = await scrypt(
                password,
                salt,
                expected.length
            ) as Buffer;

            return (
                actual.length === expected.length &&
                timingSafeEqual(actual, expected)
            );
        } catch {
            return false;
        }
    }
}
