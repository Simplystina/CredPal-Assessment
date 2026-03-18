import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { User } from '../entities/user.entity';

@Injectable()
export class VerifiedGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<{ user: User }>();
        const user = request.user;
        if (!user?.isVerified) {
            throw new ForbiddenException(
                'Email verification required. Please verify your email to access this feature.',
            );
        }
        return true;
    }
}
