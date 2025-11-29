import { Request } from 'express';
import { Connection } from 'mysql2';
export interface User {
    id: number;
    name: string;
    email: string;
    password?: string;
}
export interface Customer {
    id: number;
    name: string;
    [key: string]: any;
}
export interface JwtPayload {
    id: number;
    email: string;
}
export interface AuthRequest extends Request {
    user?: JwtPayload;
}
export interface DatabaseConnection extends Connection {
}
//# sourceMappingURL=index.d.ts.map