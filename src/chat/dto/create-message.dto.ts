import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { MessageOptions } from '../interfaces/message-options.interface';

export class CreateMessageDto {
  @IsEnum(['user', 'assistant', 'system'])
  role: 'user' | 'assistant' | 'system';

  @IsString()
  content: string;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  messageOptions?: MessageOptions;
}
