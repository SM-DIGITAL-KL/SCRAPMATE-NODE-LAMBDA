import { CognitoIdentityProviderServiceException as __BaseException } from "./CognitoIdentityProviderServiceException";
export class RefreshTokenReuseException extends __BaseException {
    name = "RefreshTokenReuseException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "RefreshTokenReuseException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, RefreshTokenReuseException.prototype);
    }
}
export const UserVerificationType = {
    PREFERRED: "preferred",
    REQUIRED: "required",
};
export class UnauthorizedException extends __BaseException {
    name = "UnauthorizedException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "UnauthorizedException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, UnauthorizedException.prototype);
    }
}
export class UnsupportedTokenTypeException extends __BaseException {
    name = "UnsupportedTokenTypeException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "UnsupportedTokenTypeException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, UnsupportedTokenTypeException.prototype);
    }
}
export class WebAuthnConfigurationMissingException extends __BaseException {
    name = "WebAuthnConfigurationMissingException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "WebAuthnConfigurationMissingException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, WebAuthnConfigurationMissingException.prototype);
    }
}
export class EnableSoftwareTokenMFAException extends __BaseException {
    name = "EnableSoftwareTokenMFAException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "EnableSoftwareTokenMFAException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, EnableSoftwareTokenMFAException.prototype);
    }
}
export const VerifySoftwareTokenResponseType = {
    ERROR: "ERROR",
    SUCCESS: "SUCCESS",
};
