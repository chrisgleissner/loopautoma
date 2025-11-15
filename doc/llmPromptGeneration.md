# LLM Prompt Generation — Dynamic AI-Powered Automation

The LLM Prompt Generation action enables loopautoma to analyze screen content and dynamically generate appropriate prompts with risk-based guardrails.

## Overview

Instead of hard-coding prompts like "continue", the LLM action:
1. Captures specified screen regions
2. Sends screenshots to GPT-4 Vision
3. Receives a risk-assessed prompt
4. Populates a variable for subsequent actions
5. Aborts if risk exceeds threshold

## Quick Start

### 1. Set up OpenAI API Key

```bash
export OPENAI_API_KEY="sk-your-api-key-here"
```

Optional environment variables:
```bash
export OPENAI_API_ENDPOINT="https://api.openai.com/v1/chat/completions"  # default
export OPENAI_MODEL="gpt-4-vision-preview"  # default
```

### 2. Create a Profile with LLM Action

Example profile that uses LLM to generate context-aware prompts:

```json
{
  "id": "llm-agent-assist",
  "name": "LLM-Powered Agent Assistant",
  "regions": [
    {
      "id": "chat-out",
      "rect": { "x": 80, "y": 120, "width": 1200, "height": 600 },
      "name": "Agent Output Area"
    },
    {
      "id": "progress",
      "rect": { "x": 80, "y": 740, "width": 1200, "height": 200 },
      "name": "Progress Indicator"
    }
  ],
  "trigger": {
    "type": "IntervalTrigger",
    "check_interval_sec": 60
  },
  "condition": {
    "type": "RegionCondition",
    "stable_ms": 8000,
    "downscale": 4
  },
  "actions": [
    {
      "type": "LLMPromptGeneration",
      "region_ids": ["chat-out", "progress"],
      "risk_threshold": 0.5,
      "system_prompt": "You are analyzing an AI agent's output. The agent appears to have stopped or is waiting for input. Based on what you see in the screenshots, generate a safe, concise prompt (max 200 chars) that will help the agent continue its work. Return ONLY JSON: {\"prompt\": \"your text\", \"risk\": 0.0-1.0}",
      "variable_name": "prompt"
    },
    {
      "type": "MoveCursor",
      "x": 960,
      "y": 980
    },
    {
      "type": "Click",
      "button": "Left"
    },
    {
      "type": "Type",
      "text": "$prompt"
    },
    {
      "type": "Key",
      "key": "Enter"
    }
  ],
  "guardrails": {
    "max_runtime_ms": 10800000,
    "max_activations_per_hour": 120,
    "cooldown_ms": 5000
  }
}
```

## Risk Assessment Guide

The LLM evaluates risk based on the generated prompt's potential impact:

### Low Risk (0.0–0.33)
**Safe operations inside the workspace**
- Reading/analyzing code
- Creating/modifying files inside project
- Running tests
- Code formatting
- Documentation updates

Examples:
- "continue with the implementation"
- "run the tests"
- "format the code"

### Medium Risk (0.34–0.66)
**File system operations, version control**
- Git operations (commit, push, tag)
- Deleting/moving files inside workspace
- Installing project dependencies (npm install, pip install)
- Building/compiling code

Examples:
- "commit these changes"
- "push to remote"
- "delete the temporary files"

### High Risk (0.67–1.0)
**System-level operations, external actions**
- Operations outside workspace
- Elevated privileges (sudo)
- System-wide software installation
- Network operations (data transfer, API calls)
- Modifying system configuration

Examples:
- "install package globally with sudo"
- "delete files in /etc"
- "push to production"

## Configuration Options

### region_ids
**Type**: `string[]`  
**Required**: Yes  
**Description**: IDs of regions to capture and send to LLM

```json
"region_ids": ["chat-out", "progress", "status"]
```

### risk_threshold
**Type**: `number` (0.0–1.0)  
**Required**: Yes  
**Default**: 0.5  
**Description**: Maximum acceptable risk level

```json
"risk_threshold": 0.5  // Reject medium-high and high risk prompts
```

### system_prompt
**Type**: `string`  
**Required**: No  
**Description**: Custom instructions for the LLM

```json
"system_prompt": "Generate a safe prompt to help the coding assistant continue. Focus on code quality and testing."
```

### variable_name
**Type**: `string`  
**Required**: No  
**Default**: `"prompt"`  
**Description**: Name of variable to store generated prompt

```json
"variable_name": "next_action"  // Use $next_action in subsequent Type actions
```

## Variable Expansion

Variables set by LLMPromptGeneration can be referenced in Type actions:

```json
{
  "type": "LLMPromptGeneration",
  "region_ids": ["r1"],
  "risk_threshold": 0.5,
  "variable_name": "my_prompt"
},
{
  "type": "Type",
  "text": "The LLM says: $my_prompt"
}
```

Multiple variables can be used in the same text:
```json
{
  "type": "Type",
  "text": "$greeting $prompt $suffix"
}
```

## Error Handling

### Risk Threshold Exceeded
When LLM returns risk > threshold:
- ⚠️ Audible alarm plays (stderr warning)
- Action sequence aborts
- Error event emitted: `"Risk threshold exceeded: 0.8 > 0.5"`
- Variable is NOT set

### API Failures
When OpenAI API is unavailable:
- Falls back to mock client (returns "continue" with risk 0.1)
- Warning logged to console
- Execution continues with fallback

### Missing Regions
If specified region_id not found:
- Action fails immediately
- Error event: `"Region 'invalid-id' not found"`
- Sequence aborts

## Testing Without API Key

Set `LOOPAUTOMA_BACKEND=fake` to use mock LLM:

```bash
export LOOPAUTOMA_BACKEND=fake
```

Mock client always returns:
```json
{
  "prompt": "continue",
  "risk": 0.1
}
```

## Best Practices

### 1. Start with High Thresholds
Begin with `risk_threshold: 0.3` to only accept low-risk prompts. Gradually increase if needed.

### 2. Use Specific System Prompts
Guide the LLM with context about what the agent is doing:

```json
"system_prompt": "You are monitoring a code review bot. Generate a prompt that will help it continue reviewing the next file. Keep responses under 100 characters."
```

### 3. Capture Relevant Regions
Only capture regions that help the LLM understand context:
- Agent output/chat area
- Progress indicators
- Status messages
- Error displays

Avoid capturing:
- Entire screen (too much noise)
- Sensitive information
- Irrelevant UI elements

### 4. Monitor Risk Patterns
Watch EventLog for risk assessments. If legitimate prompts are frequently rejected, adjust threshold.

### 5. Use Guardrails
Always configure guardrails when using LLM actions:

```json
"guardrails": {
  "max_runtime_ms": 3600000,      // 1 hour
  "max_activations_per_hour": 60, // Max 60 LLM calls/hour
  "cooldown_ms": 30000            // 30s between activations
}
```

## Troubleshooting

### "OPENAI_API_KEY environment variable not set"
**Solution**: Export your OpenAI API key before starting the app:
```bash
export OPENAI_API_KEY="sk-..."
loopautoma
```

### All prompts rejected as high risk
**Cause**: LLM being overly cautious or threshold too low  
**Solution**: 
1. Check EventLog to see actual risk values
2. Adjust `risk_threshold` to appropriate level
3. Refine `system_prompt` to guide LLM better

### Prompts don't expand ($prompt shows literally)
**Cause**: Variable name mismatch or LLM action failed  
**Solution**:
1. Verify `variable_name` matches reference: `$prompt` vs `$my_prompt`
2. Check EventLog for errors in LLMPromptGeneration action
3. Ensure LLM action succeeds before Type action runs

### API rate limits or costs
**Cause**: Too many LLM calls  
**Solution**:
1. Increase `check_interval_sec` in trigger (e.g., 120)
2. Increase `stable_ms` in condition (e.g., 15000)
3. Set `max_activations_per_hour` in guardrails
4. Consider caching (future feature)

## Examples

### Example 1: Code Review Assistant
Monitors a code review tool and generates context-specific prompts:

```json
{
  "id": "code-review-llm",
  "name": "Intelligent Code Review",
  "regions": [
    {"id": "diff", "rect": {"x": 100, "y": 150, "width": 1400, "height": 700}, "name": "Diff View"},
    {"id": "comments", "rect": {"x": 100, "y": 900, "width": 1400, "height": 200}, "name": "Review Comments"}
  ],
  "trigger": {"type": "IntervalTrigger", "check_interval_sec": 90},
  "condition": {"type": "RegionCondition", "stable_ms": 10000, "downscale": 4},
  "actions": [
    {
      "type": "LLMPromptGeneration",
      "region_ids": ["diff", "comments"],
      "risk_threshold": 0.4,
      "system_prompt": "Analyze the code diff and suggest a safe next action for the reviewer. Return JSON with prompt and risk.",
      "variable_name": "review_action"
    },
    {"type": "Type", "text": "$review_action"},
    {"type": "Key", "key": "Enter"}
  ],
  "guardrails": {"cooldown_ms": 15000, "max_activations_per_hour": 40}
}
```

### Example 2: Documentation Generator
Watches editor and suggests documentation prompts:

```json
{
  "actions": [
    {
      "type": "LLMPromptGeneration",
      "region_ids": ["code-editor"],
      "risk_threshold": 0.2,
      "system_prompt": "Looking at the code, suggest a documentation comment. Return JSON.",
      "variable_name": "doc_comment"
    },
    {"type": "Type", "text": "// $doc_comment"},
    {"type": "Key", "key": "Enter"}
  ]
}
```

### Example 3: Test Runner
Analyzes test output and decides next action:

```json
{
  "actions": [
    {
      "type": "LLMPromptGeneration",
      "region_ids": ["test-output"],
      "risk_threshold": 0.5,
      "system_prompt": "Based on test results, suggest next action: run tests again, fix code, or continue. Return JSON.",
      "variable_name": "test_action"
    },
    {"type": "Type", "text": "$test_action"},
    {"type": "Key", "key": "Enter"}
  ]
}
```

## Security Considerations

1. **API Key Protection**: Never commit OPENAI_API_KEY to version control
2. **Risk Thresholds**: Start conservative (0.3) and only increase with monitoring
3. **Screen Content**: Be aware LLM sees captured regions - avoid sensitive data
4. **Prompt Validation**: LLM responses are validated for length (≤200 chars) and format
5. **Abort Mechanism**: Risk violations immediately stop execution with alarm

## Future Enhancements

- Response caching based on region hashes
- Multiple LLM provider support (Anthropic, local models)
- Streaming responses for real-time feedback
- Custom risk classifiers
- Prompt template library
