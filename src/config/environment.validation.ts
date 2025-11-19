import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsString, validateSync } from 'class-validator';

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

  @IsString()
  OLLAMA_BASE_URL: string;

  @IsString()
  OLLAMA_MODEL: string;

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
