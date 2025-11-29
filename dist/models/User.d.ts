import { User as UserType } from '../types';
declare class User {
    static create(name: string, email: string): Promise<UserType>;
    static findById(id: number | string): Promise<UserType | null>;
    static findByEmail(email: string): Promise<UserType | null>;
    static findByName(name: string): Promise<any | null>;
}
export default User;
//# sourceMappingURL=User.d.ts.map