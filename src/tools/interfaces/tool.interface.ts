import { ToolDefinition } from './tool-definition.interface';

export interface ITool {
  readonly definition: ToolDefinition;
  execute(args: Record<string, any>): Promise<any>;
}
