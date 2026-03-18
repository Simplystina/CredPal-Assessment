import { Body, Controller, Post } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class ResendOtpDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({ status: 201, description: 'User is registered successfully' })
    @ApiResponse({ status: 409, description: 'Email already exists' })
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('verify')
    @ApiOperation({ summary: 'Verify OTP and activate account' })
    @ApiResponse({ status: 200, description: 'Email verified successfully' })
    @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
    verifyOtp(@Body() dto: VerifyOtpDto) {
        return this.authService.verifyOtp(dto);
    }

    @Post('login')
    @ApiOperation({ summary: 'Login and receive your access token' })
    @ApiResponse({ status: 200, description: 'Login successful, returns your access token' })
    @ApiResponse({ status: 401, description: 'Invalid credentials or unverified email' })
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Post('resend-otp')
    @ApiOperation({ summary: 'Resend OTP to email' })
    @ApiBody({ type: ResendOtpDto })
    @ApiResponse({ status: 200, description: 'New OTP sent' })
    resendOtp(@Body() dto: ResendOtpDto) {
        return this.authService.resendOtp(dto.email);
    }
}
