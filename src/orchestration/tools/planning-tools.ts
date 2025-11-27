// @ts-nocheck
// src/orchestration/tools/planning-tools.ts
import { ToolDefinition } from '../../tools/interfaces/tool-definition.interface';

export const planningTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_plan',
      description: 'Initialize a new execution plan for a research query',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The user research query',
          },
          name: {
            type: 'string',
            description: 'Short name for this plan',
          },
        },
        required: ['query', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_phase',
      description: 'Add a new phase to the plan',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Phase name (e.g., search, fetch, synthesize)',
          },
          description: {
            type: 'string',
            description: 'What this phase accomplishes',
          },
          replanCheckpoint: {
            type: 'boolean',
            description: 'Re-evaluate plan after this phase completes?',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_step',
      description: 'Add an execution step to a phase with specific configuration parameters',
      parameters: {
        type: 'object',
        properties: {
          phaseId: {
            type: 'string',
            description: 'Target phase ID',
          },
          type: {
            type: 'string',
            enum: ['tool_call', 'llm_call'] as any,
            description: 'Type of step',
          },
          toolName: {
            type: 'string',
            description:
              'Tool to execute (e.g., tavily_search, web_fetch, synthesize)',
          },
          config: {
            type: 'object',
            description: 'REQUIRED tool-specific parameters. For tavily_search: {query: "search terms", max_results: 5}. For web_fetch: {url: "https://..."}. For synthesize: {prompt: "synthesis instructions"}',
          },
          dependsOn: {
            type: 'array',
            items: { type: 'string' } as any,
            description: 'Step IDs that must complete before this step',
          },
        },
        required: ['phaseId', 'type', 'toolName', 'config'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modify_step',
      description: 'Modify an existing step configuration (during re-planning)',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to modify',
          },
          changes: {
            type: 'object',
            description: 'Fields to update',
          },
        },
        required: ['stepId', 'changes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_step',
      description: 'Remove a pending step from the plan',
      parameters: {
        type: 'object',
        properties: {
          stepId: {
            type: 'string',
            description: 'Step ID to remove',
          },
          reason: {
            type: 'string',
            description: 'Why this step is no longer needed',
          },
        },
        required: ['stepId', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skip_phase',
      description: 'Mark an entire phase as skipped',
      parameters: {
        type: 'object',
        properties: {
          phaseId: {
            type: 'string',
            description: 'Phase ID to skip',
          },
          reason: {
            type: 'string',
            description: 'Why this phase should be skipped',
          },
        },
        required: ['phaseId', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_phase_after',
      description:
        'Insert a new phase after an existing one (during re-planning)',
      parameters: {
        type: 'object',
        properties: {
          afterPhaseId: {
            type: 'string',
            description: 'Phase ID to insert after',
          },
          name: {
            type: 'string',
            description: 'New phase name',
          },
          description: {
            type: 'string',
            description: 'What this phase accomplishes',
          },
          replanCheckpoint: {
            type: 'boolean',
            description: 'Re-evaluate plan after this phase?',
          },
        },
        required: ['afterPhaseId', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_plan_status',
      description: 'Get current plan state for re-planning decisions',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_phase_results',
      description: 'Get detailed results from a completed phase',
      parameters: {
        type: 'object',
        properties: {
          phaseId: {
            type: 'string',
            description: 'Phase ID to get results for',
          },
        },
        required: ['phaseId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize_plan',
      description: 'Mark planning as complete and ready for execution',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];
