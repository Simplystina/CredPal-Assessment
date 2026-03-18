import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT as string, 10) || 587,
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
}));
