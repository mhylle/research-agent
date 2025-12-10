import { IsString, IsOptional } from 'class-validator';

export class UpdateConversationDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  summary?: string;
}
