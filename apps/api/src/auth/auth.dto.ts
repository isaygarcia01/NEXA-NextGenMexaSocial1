import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'valentina@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'valentina.m' })
  @Matches(/^[a-zA-Z0-9._]{3,30}$/)
  username!: string;

  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Valentina M.' })
  @IsString()
  @Length(1, 80)
  displayName!: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class TokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}

export class UpdatePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}

export class RefreshDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(32)
  refreshToken?: string;
}

export class EmailDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class RevokeSessionDto {
  @ApiProperty()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  sessionId!: string;
}
