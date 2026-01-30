import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ 
    example: 'john@example.com or +1234567890', 
    description: 'User email address or phone number' 
  })
  @IsNotEmpty()
  @IsString()
  emailOrPhone: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsNotEmpty()
  @IsString()
  password: string;
}





