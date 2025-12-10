import { IsString, IsOptional } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  title?: string;
}
