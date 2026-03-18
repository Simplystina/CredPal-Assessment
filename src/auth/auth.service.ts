import {
    Injectable,
    ConflictException,
    UnauthorizedException,
    NotFoundException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { Otp } from './entities/otp.entity';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @InjectRepository(User)
        private readonly userDb: Repository<User>,
        @InjectRepository(Otp)
        private readonly otpDb: Repository<Otp>,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    async register(dto: RegisterDto) {
        const existing = await this.userDb.findOne({
            where: { email: dto.email },
        });
        if (existing) {
            throw new ConflictException('This email address already exists, please login');
        }

        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = this.userDb.create({
            email: dto.email,
            password: hashedPassword,
        });
        await this.userDb.save(user);

        // Generate and send OTP
        const otp = await this.createOtp(user.id);
        await this.sendOtpEmail(user.email, otp);

        return {
            message:
                'Registration successful. Please check your email for the verification OTP.',
            email: user.email,
        };
    }

    async verifyOtp(dto: VerifyOtpDto) {
        const user = await this.userDb.findOne({
            where: { email: dto.email },
        });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (user.isVerified) {
            return { message: 'This account is already verified, please login' };
        }

        const otpRecord = await this.otpDb.findOne({
            where: { userId: user.id, code: dto.otp, used: false },
            order: { createdAt: 'DESC' },
        });

        if (!otpRecord) {
            throw new BadRequestException('Invalid OTP');
        }

        if (new Date() > otpRecord.expiresAt) {
            throw new BadRequestException('OTP has expired. Please request a new one.');
        }

        // Mark the OTP as used to verify the user
        otpRecord.used = true;
        await this.otpDb.save(otpRecord);

        user.isVerified = true;
        await this.userDb.save(user);

        return { message: 'Email verified successfully. You can now login.' };
    }

    async login(dto: LoginDto) {
        const user = await this.userDb.findOne({
            where: { email: dto.email },
        });
        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        if (!user.isVerified) {
            throw new UnauthorizedException(
                'Please verify your email before logging in',
            );
        }

        const payload = { sub: user.id, email: user.email, role: user.role };
        const accessToken = this.jwtService.sign(payload);

        return {
            accessToken,
            tokenType: 'Bearer',
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
            },
        };
    }

    async resendOtp(email: string) {
        const user = await this.userDb.findOne({ where: { email } });
        if (!user) {
            throw new NotFoundException('User not found');
        }
        if (user.isVerified) {
            throw new BadRequestException('Account is already verified');
        }

        // Mark all the previous OTPs as used
        await this.otpDb.update({ userId: user.id, used: false }, { used: true });

        const otp = await this.createOtp(user.id);
        await this.sendOtpEmail(user.email, otp);

        return { message: 'New OTP sent to your email.' };
    }

    private async createOtp(userId: string): Promise<string> {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        const otp = this.otpDb.create({ userId, code, expiresAt });
        await this.otpDb.save(otp);
        return code;
    }

    private async sendOtpEmail(email: string, otp: string): Promise<void> {
        const transporter = nodemailer.createTransport({
            host: this.configService.get<string>('mail.host'),
            port: this.configService.get<number>('mail.port'),
            secure: false,
            auth: {
                user: this.configService.get<string>('mail.user'),
                pass: this.configService.get<string>('mail.pass'),
            },
        });

        try {
            await transporter.sendMail({
                from: `"FX Trading App" <${this.configService.get<string>('mail.user')}>`,
                to: email,
                subject: 'Email Verification - FX Trading App',
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #eb25a2ff;">Verify Your Email</h2>
            <p>Thank you for registering with Dinma's FX Trading App.</p>
            <p>This is your One Time Password (OTP) for your email verification:</p>
            <div style="background: #fff; padding: 20px; text-align: center; border-radius: 12x; margin: 20px 0;">
              <h1 style="font-size: 48px; letter-spacing: 12px; color: #eb25a2ff; margin: 0;">${otp}</h1>
            </div>
            <p style="color: #807c6bff;">This OTP will expire in <strong>5 minutes</strong>.</p>
          </div>
        `,
            });
        } catch (error) {
            this.logger.error(`Failed to send OTP email to ${email}`, error);

        }
    }
}
