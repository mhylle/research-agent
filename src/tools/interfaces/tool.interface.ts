import { ToolDefinition } from './tool-definition.interface';

export interface ITool {
  readonly definition: ToolDefinition;
  readonly requiresApiKey?: boolean;
  execute(args: Record<string, any>): Promise<any>;
}
