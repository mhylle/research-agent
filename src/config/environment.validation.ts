import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  // LLM Provider Selection
  @IsString()
  @IsOptional()
  LLM_PROVIDER?: string; // 'ollama' | 'azure-mistral'

  // Ollama Configuration
  @IsString()
  OLLAMA_BASE_URL: string;

  @IsString()
  OLLAMA_MODEL: string;

  // Azure Mistral Configuration (optional - required when LLM_PROVIDER=azure-mistral)
  @IsString()
  @IsOptional()
  AZURE_OPENAI_ENDPOINT?: string;

  @IsString()
  @IsOptional()
  AZURE_OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  AZURE_MISTRAL_MODEL?: string;

  @IsString()
  TAVILY_API_KEY: string;

  @IsNumber()
  WEB_FETCH_TIMEOUT: number;

  @IsNumber()
  WEB_FETCH_MAX_SIZE: number;

  @IsString()
  LOG_LEVEL: string;

  @IsString()
  LOG_DIR: string;

  @IsString()
  DB_HOST: string;

  @IsNumber()
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
