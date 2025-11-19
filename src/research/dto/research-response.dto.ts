export class SourceDto {
  url: string;
  title: string;
  relevance?: string;
}

export class StageMetadataDto {
  stage: number;
  executionTime: number;
}

export class ResearchMetadataDto {
  totalExecutionTime: number;
  stages: StageMetadataDto[];
}

export class ResearchResponseDto {
  logId: string;
  answer: string;
  sources: SourceDto[];
  metadata: ResearchMetadataDto;
}
