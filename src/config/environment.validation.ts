import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  validateSync,
  ValidateIf,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

enum LLMProvider {
  Ollama = 'ollama',
  AzureOpenAI = 'azure-openai',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  @IsEnum(LLMProvider)
  @IsOptional()
  LLM_PROVIDER: LLMProvider = LLMProvider.Ollama;

  // Ollama config - required when LLM_PROVIDER is 'ollama'
  @ValidateIf((o) => o.LLM_PROVIDER === LLMProvider.Ollama || !o.LLM_PROVIDER)
  @IsString()
  OLLAMA_BASE_URL: string;

  @ValidateIf((o) => o.LLM_PROVIDER === LLMProvider.Ollama || !o.LLM_PROVIDER)
  @IsString()
  OLLAMA_MODEL: string;

  // Azure OpenAI config - required when LLM_PROVIDER is 'azure-openai'
  @ValidateIf((o) => o.LLM_PROVIDER === LLMProvider.AzureOpenAI)
  @IsString()
  AZURE_OPENAI_ENDPOINT: string;

  @ValidateIf((o) => o.LLM_PROVIDER === LLMProvider.AzureOpenAI)
  @IsString()
  AZURE_OPENAI_API_KEY: string;

  @ValidateIf((o) => o.LLM_PROVIDER === LLMProvider.AzureOpenAI)
  @IsString()
  AZURE_OPENAI_MODEL: string;

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
