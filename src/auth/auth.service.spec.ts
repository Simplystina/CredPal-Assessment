import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { Otp } from './entities/otp.entity';
import * as bcrypt from 'bcrypt';

// Mock nodemailer so tests don't attempt real email sends
jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }),
    })),
}));

const mockUserRepository = () => ({
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
});

const mockOtpRepository = () => ({
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
});

const mockJwtService = () => ({
    sign: jest.fn(() => 'mock.jwt.token'),
});

const mockConfigService = () => ({
    get: jest.fn((key: string) => {
        const config: Record<string, unknown> = {
            'mail.host': 'smtp.gmail.com',
            'mail.port': 587,
            'mail.user': 'test@test.com',
            'mail.pass': 'testpass',
        };
        return config[key];
    }),
});

describe('AuthService', () => {
    let service: AuthService;
    let userRepo: ReturnType<typeof mockUserRepository>;
    let otpRepo: ReturnType<typeof mockOtpRepository>;
    let jwtService: ReturnType<typeof mockJwtService>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: getRepositoryToken(User), useFactory: mockUserRepository },
                { provide: getRepositoryToken(Otp), useFactory: mockOtpRepository },
                { provide: JwtService, useFactory: mockJwtService },
                { provide: ConfigService, useFactory: mockConfigService },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        userRepo = module.get(getRepositoryToken(User));
        otpRepo = module.get(getRepositoryToken(Otp));

        // Patch the service instances to match the new naming for private repos
        (service as any).userDb = userRepo;
        (service as any).otpDb = otpRepo;

        jwtService = module.get(JwtService);
    });

    describe('register', () => {
        it('should register a new user and send OTP', async () => {
            userRepo.findOne.mockResolvedValue(null);
            userRepo.create.mockReturnValue({ id: 'user-id', email: 'test@test.com' });
            userRepo.save.mockResolvedValue({ id: 'user-id', email: 'test@test.com' });
            otpRepo.create.mockReturnValue({ code: '123456' });
            otpRepo.save.mockResolvedValue({});

            const result = await service.register({
                email: 'test@test.com',
                password: 'StrongPass1!',
            });

            expect(result.email).toBe('test@test.com');
            expect(result.message).toContain('verification OTP');
            expect(userRepo.save).toHaveBeenCalledTimes(1);
            expect(otpRepo.save).toHaveBeenCalledTimes(1);
        });

        it('should throw ConflictException if email already exists', async () => {
            userRepo.findOne.mockResolvedValue({ id: 'existing', email: 'test@test.com' });

            await expect(
                service.register({ email: 'test@test.com', password: 'StrongPass1!' }),
            ).rejects.toThrow(ConflictException);
        });
    });

    describe('verifyOtp', () => {
        it('should verify a valid OTP and activate the user', async () => {
            const user = { id: 'user-id', email: 'test@test.com', isVerified: false };
            userRepo.findOne.mockResolvedValue(user);
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            otpRepo.findOne.mockResolvedValue({
                id: 'otp-id',
                userId: 'user-id',
                code: '482916',
                expiresAt,
                used: false,
            });
            otpRepo.save.mockResolvedValue({});
            userRepo.save.mockResolvedValue({ ...user, isVerified: true });

            const result = await service.verifyOtp({ email: 'test@test.com', otp: '482916' });

            expect(result.message).toContain('verified successfully');
            expect(user.isVerified).toBe(true);
        });

        it('should throw BadRequestException for expired OTP', async () => {
            userRepo.findOne.mockResolvedValue({ id: 'user-id', isVerified: false });
            const expiresAt = new Date(Date.now() - 60 * 1000); // already expired
            otpRepo.findOne.mockResolvedValue({
                code: '482916',
                expiresAt,
                used: false,
            });

            await expect(
                service.verifyOtp({ email: 'test@test.com', otp: '482916' }),
            ).rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException for invalid OTP', async () => {
            userRepo.findOne.mockResolvedValue({ id: 'user-id', isVerified: false });
            otpRepo.findOne.mockResolvedValue(null); // no record found

            await expect(
                service.verifyOtp({ email: 'test@test.com', otp: '000000' }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('login', () => {
        it('should return a JWT token for valid credentials', async () => {
            const hashedPassword = await bcrypt.hash('StrongPass1!', 10);
            userRepo.findOne.mockResolvedValue({
                id: 'user-id',
                email: 'test@test.com',
                password: hashedPassword,
                isVerified: true,
                role: 'user',
            });

            const result = await service.login({
                email: 'test@test.com',
                password: 'StrongPass1!',
            });

            expect(result.accessToken).toBe('mock.jwt.token');
            expect(result.user.email).toBe('test@test.com');
        });

        it('should throw UnauthorizedException for wrong password', async () => {
            const hashedPassword = await bcrypt.hash('CorrectPass1!', 10);
            userRepo.findOne.mockResolvedValue({
                id: 'user-id',
                email: 'test@test.com',
                password: hashedPassword,
                isVerified: true,
            });

            await expect(
                service.login({ email: 'test@test.com', password: 'WrongPass1!' }),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException if email not verified', async () => {
            const hashedPassword = await bcrypt.hash('StrongPass1!', 10);
            userRepo.findOne.mockResolvedValue({
                id: 'user-id',
                email: 'test@test.com',
                password: hashedPassword,
                isVerified: false,
            });

            await expect(
                service.login({ email: 'test@test.com', password: 'StrongPass1!' }),
            ).rejects.toThrow(UnauthorizedException);
        });
    });
});
