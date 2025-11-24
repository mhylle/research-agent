// src/orchestration/tools/recovery-tools.ts
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

export const recoveryTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'retry_step',
      description: 'Retry the failed step with optional modified configuration',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to retry',
          },
          modifiedConfig: {
            type: 'object',
            description: 'Optional modified parameters for retry',
          },
          reason: {
            type: 'string',
            description: 'Why retry is appropriate',
          },
        },
        required: ['stepId', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skip_step',
      description: 'Skip the failed step and continue execution',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to skip',
          },
          reason: {
            type: 'string',
            description: 'Why skipping is acceptable',
          },
        },
        required: ['stepId', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_step',
      description: 'Replace failed step with an alternative approach',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to replace',
          },
          alternativeToolName: {
            type: 'string',
            description: 'Alternative tool to use',
          },
          alternativeConfig: {
            type: 'object',
            description: 'Configuration for alternative tool',
          },
          reason: {
            type: 'string',
            description: 'Why this alternative is appropriate',
          },
        },
        required: [
          'stepId',
          'alternativeToolName',
          'alternativeConfig',
          'reason',
        ],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'abort_plan',
      description: 'Abort the entire plan - unrecoverable failure',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Why recovery is not possible',
          },
        },
        required: ['reason'],
      },
    },
  },
];
