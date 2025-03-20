import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'mkdirp';
import * as config from '../config.js';
import runTask from './run-task.js';
import { log, logErr } from '../lib/log4j.js';
import { getTaskDescription, recordTaskExecution } from '../lib/task-utils.js';
import TaskJudgeAgent from '../ai/task-judge-agent.js';

const tasksDir = config.project.tasksDir;
const evalsDir = config.project.evalsDir;

/**
 * Gets all executions that have validated data
 * @param {string} taskName - Name of the task
 * @returns {Array|null} - Array of executions with validated data, or null if not found
 */
function getExecutionsToEvaluate(taskName) {
    const evalsFilePath = path.join(evalsDir, `${taskName}.json`);

    try {
        if (!fs.existsSync(evalsFilePath)) {
            console.error(`No evaluation found for task "${taskName}". Run the task with --save-eval first.`);
            return null;
        }

        const evalData = JSON.parse(fs.readFileSync(evalsFilePath, 'utf8'));
        
        // Filter executions that have validated data
        const executionsToEvaluate = evalData.executions.filter(exec => 
            exec.validated && 
            exec.validated.task_description
        );
        
        if (executionsToEvaluate.length === 0) {
            console.error(`No executions found with validated data for task "${taskName}".`);
            return null;
        }
        
        return executionsToEvaluate;
    } catch (error) {
        console.error(`Error reading evaluation data: ${error.message}`);
        return null;
    }
}

/**
 * Evaluates all executions of a task by comparing validated and unvalidated outputs
 * @param {string} taskName - Name of the task to evaluate
 */
export default async function (taskName) {
    // Get all executions to evaluate
    const executionsToEvaluate = getExecutionsToEvaluate(taskName);
    if (!executionsToEvaluate) {
        process.exit(1);
    }

    console.log(`Found ${executionsToEvaluate.length} executions to evaluate for task "${taskName}"\n`);

    try {
        const evalsFilePath = path.join(evalsDir, `${taskName}.json`);

        // Ensure evals directory exists
        if (!fs.existsSync(evalsDir)) {
            mkdirpSync(evalsDir);
        }

        const taskDescription = getTaskDescription(path.join(tasksDir, `${taskName}.txt`));

        // Evaluate each execution
        for (const execution of executionsToEvaluate) {
            console.log(`\nEvaluating execution with parameters: ${execution.parameters.join(', ')}`);
            
            // Run the task with the same parameters as the validated execution
            const result = await runTask(taskName, execution.parameters, {});
            
            // Update the main evaluation file with the unvalidated execution
            recordTaskExecution(
                evalsFilePath,
                taskName,
                execution.parameters,
                taskDescription,
                result,
                null,
                false // Mark as unvalidated
            );

            log('eval-task', taskName, {
                task_name: taskName,
                parameters: execution.parameters
            });

            // Get the updated execution data with both validated and unvalidated parts
            const updatedEvalsFilePath = path.join(evalsDir, `${taskName}.json`);
            const updatedEvalData = JSON.parse(fs.readFileSync(updatedEvalsFilePath, 'utf8'));
            const updatedExecution = updatedEvalData.executions.find(exec => 
                JSON.stringify(exec.parameters) === JSON.stringify(execution.parameters)
            );

            // Compare validated and unvalidated executions using TaskJudgeAgent
            if (updatedExecution && updatedExecution.validated && updatedExecution.unvalidated) {
                const evaluation = await judgeEvals(taskName, updatedExecution);
                if (evaluation) {
                    console.log('\nEvaluation results:\n');
                    console.log(evaluation.evaluation);
                    console.log('\n' + '='.repeat(80) + '\n');
                }
            } else {
                console.error(`Error: Unable to find updated execution data with both validated and unvalidated parts for parameters: ${execution.parameters.join(', ')}`);
            }
        }

        return executionsToEvaluate;
    } catch (error) {
        logErr('eval-task', taskName, { task_name: taskName }, error);
        console.error('Error evaluating task:', error);
        process.exit(1);
    }
}

/**
 * Evaluates task outputs using TaskJudgeAgent to compare validated and unvalidated executions
 * @param {string} taskName - Name of the task being evaluated
 * @param {Object} executionData - Execution data containing validated and unvalidated outputs
 * @returns {Object|null} Evaluation results containing evaluation text and token usage logs. Returns null on error.
 */
async function judgeEvals(taskName, executionData) {
    try {        
        const taskJudge = new TaskJudgeAgent(
            'task-judge',
            config.openai
        );

        const evaluation = await taskJudge.evaluateTask(
            executionData.validated.task_description,
            JSON.stringify(executionData.validated.output, null, 2),
            executionData.unvalidated.task_description, 
            JSON.stringify(executionData.unvalidated.output, null, 2)
        );

        return {
            validated: executionData.validated,
            unvalidated: executionData.unvalidated,
            evaluation: evaluation,
            token_usage_logs: taskJudge.getTokenUsageLogs()
        };
    } catch (error) {
        console.error('Error in evaluation process:', error);
        return null;
    }
}
