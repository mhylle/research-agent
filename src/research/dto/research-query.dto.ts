import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';

export enum SearchDepth {
  QUICK = 'quick',
  COMPREHENSIVE = 'comprehensive',
}

export class ResearchQueryDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  maxSources?: number = 5;

  @IsOptional()
  @IsEnum(SearchDepth)
  searchDepth?: SearchDepth = SearchDepth.COMPREHENSIVE;
}
