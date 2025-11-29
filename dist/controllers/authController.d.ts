import { Response } from 'express';
import { AuthRequest } from '../types';
declare class AuthController {
    static register(req: AuthRequest, res: Response): Promise<void>;
    static login(req: AuthRequest, res: Response): Promise<void>;
    static getProfile(req: AuthRequest, res: Response): Promise<void>;
}
export default AuthController;
//# sourceMappingURL=authController.d.ts.map