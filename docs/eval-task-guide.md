# Eval-Task Command Guide

## Overview
The `eval-task` command is a tool for evaluating task executions by comparing new outputs with previously validated outputs. It helps ensure the consistency and quality of task executions over time.

## Basic Usage

```bash
# Evaluate a specific task
faqtiv eval-task <taskName>

# Evaluate all tasks with validation data
faqtiv eval-task --all
```

### Options
- `--all`: Evaluate all tasks that have validation data
- `--verbose`: Show detailed output from task execution
- `--concurrency <number>`: Number of concurrent executions to run (default: 10)

## Prerequisites

Before using the eval-task command, you need to:

1. Have previously run the task with the `--save-eval` flag to create validation data
2. Have validated the task outputs to establish a baseline

## Task Evaluation Process

The evaluation process works as follows:

1. **Find Validation Data**: The command looks for previously validated task executions in the `evals` directory
2. **Run New Execution**: Executes the task again with the same parameters
3. **Compare Outputs**: Uses TaskJudgeAgent to compare the new output with the validated output
4. **Generate Report**: Creates a detailed evaluation report

## Example Usage

1. First, run a task and save its evaluation:
```bash
faqtiv run-task my-task --save-eval
```

2. Validate the output (this is typically done manually)

3. Run the evaluation:
```bash
# Evaluate a specific task
faqtiv eval-task my-task

# Evaluate with verbose output
faqtiv eval-task my-task --verbose

# Evaluate all tasks with validation data
faqtiv eval-task --all
```

## Evaluation Files

Evaluation files in the `evals` directory contain:
- Task name and parameters
- Validated output
- Task description
- Execution metadata

### Example Evaluation File

Here's an example of a validated task evaluation file (`my-task__param1_param2.json`):

```json
{
  "task_name": "my-task",
  "parameters": ["param1", "param2"],
  "validated": {
    "task_description": "This task processes input parameters and returns a formatted result.",
    "time": "2024-03-20T10:30:00Z",
    "output": {
      "description": "Processed data with status and details",
      "results": {
        "result": "Processed data",
        "status": "success"
      }
    },
    "error": null
  },
  "unvalidated": {
    "task_description": "This task processes input parameters and returns a formatted result.",
    "time": "2024-03-21T15:45:00Z",
    "output": {
      "description": "Processed data with status and details",
      "results": {
        "result": "Processed data",
        "status": "success"
      }
    },
    "error": null
  },
  "evaluation": {
    "summary": {
      "validated_task": "The task processes input parameters and returns a formatted result with status and details.",
      "evaluated_task": "The task processes input parameters and returns a formatted result with status and details."
    },
    "analysis": {
      "similarities": "Both tasks process the input parameters and return the same structure of results with identical processing status.",
      "differences": "The only differences are in the timestamps, which is expected as they are from different executions."
    },
    "semantic_correctness": "The new implementation is semantically correct as it produces the same output structure and processing results.",
    "scores": {
      "correctness": 5,
      "completeness": 5,
      "robustness": 5
    },
    "overall_score": 15,
    "verdict": "PASS",
    "explanation": "The evaluated task output is semantically identical to the validated output, with only expected timestamp differences."
  }
}
```

Key components of the evaluation file:

1. **Task Information**:
   - `task_name`: Name of the task (e.g., "my-task")
   - `parameters`: Array of parameters used in the execution (e.g., ["param1", "param2"])

2. **Validated Data**:
   - `task_description`: Detailed description of the task's purpose and functionality
   - `time`: Timestamp of the validated execution
   - `output`: Contains the task's output
   - `error`: Any error that occurred during execution (null if successful)

3. **Unvalidated Data**:
   - Contains the same structure as validated data
   - Represents the new execution being evaluated
   - Includes a different timestamp

4. **Evaluation Results**:
   - `summary`: Brief descriptions of both validated and evaluated tasks
   - `analysis`: Detailed comparison of similarities and differences
   - `semantic_correctness`: Assessment of semantic equivalence
   - `scores`: Numerical scores for different aspects:
     - `correctness`: Accuracy of the implementation
     - `completeness`: Coverage of requirements
     - `robustness`: Reliability of the implementation
   - `overall_score`: Total score across all metrics
   - `verdict`: Final evaluation result (PASS/FAIL)
   - `explanation`: Detailed explanation of the evaluation result

## CSV Report Format

The eval-task command generates a CSV report with the following structure:

```csv
DateTime,ValidatedTaskDescription,UnvalidatedTaskDescription,Parameters,CorrectnessScore,CompletenessScore,RobustnessScore,Verdict
2024-03-21T15:45:00Z,"This task processes input parameters and returns a formatted result.","This task processes input parameters and returns a formatted result.","param1,param2",5,5,5,"PASS"
```

### CSV Columns Explanation

1. **DateTime**: Timestamp of the evaluation
2. **ValidatedTaskDescription**: Description of the validated task
3. **UnvalidatedTaskDescription**: Description of the unvalidated task
4. **Parameters**: Task parameters used in the evaluation
5. **CorrectnessScore**: Score for accuracy of implementation (1-5)
6. **CompletenessScore**: Score for coverage of requirements (1-5)
7. **RobustnessScore**: Score for reliability of implementation (1-5)
8. **Verdict**: Final evaluation result (PASS/FAIL)

The CSV report provides a concise summary of the evaluation results, making it easy to:
- Track evaluation history
- Compare multiple task executions
- Identify patterns in task performance
- Generate statistics and reports

## Advanced Usage

### Batch Processing
```bash
# Evaluate multiple tasks with specific concurrency
faqtiv eval-task --all --concurrency 5
```

### Verbose Debugging
```bash
# Get detailed output for a specific task
faqtiv eval-task my-task --verbose
```

## Directory Structure

The eval-task command relies on the following directory structure:

```
your-project/
├── tasks/           # Task definitions
│   └── my-task.txt
├── evals/           # Evaluation data
│   ├── my-task__param1_param2.json
│   ├── my-task__param3_param4.json
│   └── my-task.csv
```

### Directory Contents

1. **tasks/**: Contains task definition files
   - Each task has a `.txt` file with its description
   - Example: `my-task.txt` contains the task description

2. **evals/**: Contains evaluation files
   - JSON files: `{taskName}__{param1}_{param2}.json`
     - Contains detailed evaluation data for specific parameter combinations
     - Includes validated and unvalidated executions
     - Example: `my-task__param1_param2.json`
   - CSV files: `{taskName}.csv`
     - Contains summary evaluation results for all parameter combinations
     - Aggregates results from all JSON files for the task
     - Example: `my-task.csv`

### File Naming Convention

Evaluation files follow these naming patterns:

1. **JSON Files**:
```
{taskName}__{parameters}.json
```
Where:
- `taskName`: Name of the task (e.g., "my-task")
- `parameters`: Parameters used in the execution, joined by underscores
  - Example: `param1_param2` for multiple parameters

2. **CSV Files**:
```
{taskName}.csv
```
Where:
- `taskName`: Name of the task (e.g., "my-task")
- Contains aggregated results from all parameter combinations

## Best Practices

1. **Regular Validation**: Regularly validate task outputs to maintain a reliable baseline
2. **Parameter Consistency**: Ensure task parameters remain consistent between runs
3. **Verbose Mode**: Use `--verbose` when debugging or investigating differences
4. **Concurrency**: Adjust concurrency based on your system's capabilities
5. **Task Isolation**: Keep tasks independent to avoid cascading failures

## Troubleshooting

1. **No Validation Data**: If you see "No evaluation found for task", ensure you've run the task with `--save-eval` and validated the output
2. **Concurrency Issues**: If experiencing performance problems, try reducing the concurrency value
3. **Task Failures**: Check task logs for execution errors
4. **Validation Mismatches**: Review the evaluation report to understand differences between runs