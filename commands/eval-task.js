import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'mkdirp';
import * as config from '../config.js';
import runTask from './run-task.js';
import { log, logErr } from '../lib/log4j.js';
import { getTaskDescription, getTaskEvalPayload, recordTaskExecution } from '../lib/task-utils.js';
import TaskJudgeAgent from '../ai/task-judge-agent.js';

const tasksDir = config.project.tasksDir;
const evalsDir = config.project.evalsDir;
/**
 * Reads the previous task execution record from the evals directory
 * @param {string} taskName - Name of the task
 * @returns {object|null} - The previous task execution record or null if not found
 */
function readPreviousEvaluation(taskName) {
    const evalsFilePath = path.join(evalsDir, `${taskName}.json`);

    try {
        if (!fs.existsSync(evalsFilePath)) {
            console.error(`No previous evaluation found for task "${taskName}". Run the task with --save-eval first.`);
            return null;
        }

        const evalData = JSON.parse(fs.readFileSync(evalsFilePath, 'utf8'));
        return evalData;
    } catch (error) {
        console.error(`Error reading previous evaluation: ${error.message}`);
        return null;
    }
}

/**
 * Saves the comparison of previous and current task executions
 * @param {string} taskName - Name of the task
 * @param {object} previousEval - Previous task execution record
 * @param {object} currentEval - Current task execution record
 */
function saveEvalComparison(taskName, previousEval, currentEval) {
    // Ensure evals directory exists
    if (!fs.existsSync(evalsDir)) {
        mkdirpSync(evalsDir);
    }

    // Create a comparison record
    const comparisonData = {
        task_name: taskName,
        parameters: previousEval.parameters,
        previous_execution: {
            task_description: previousEval.task_description,
            time: previousEval.execution_time,
            output: previousEval.output,
            error: previousEval.error
        },
        current_execution: {
            task_description: currentEval.task_description,
            time: currentEval.execution_time,
            output: currentEval.output,
            error: currentEval.error
        }
    };

    const comparisonFilePath = path.join(evalsDir, `${taskName}-comparison.json`);

    try {
        fs.writeFileSync(comparisonFilePath, JSON.stringify(comparisonData, null, 2));
        console.log(`\nEvaluation comparison saved to ${comparisonFilePath}`);
        return comparisonFilePath;
    } catch (error) {
        console.error(`\nError saving evaluation comparison: ${error.message}`);
        return null;
    }
}

/**
 * Re-runs a task using input from a previous run and saves both outputs for comparison
 * @param {string} taskName - Name of the task to evaluate
 */
export default async function (taskName) {
    // Read previous evaluation
    const previousEval = readPreviousEvaluation(taskName);
    if (!previousEval) {
        process.exit(1);
    }

    console.log(`Re-running task "${taskName}" with parameters: ${previousEval.parameters.join(', ')}`);

    try {
        const evalsFilePath = path.join(evalsDir, `${taskName}-rerun.json`);

        // Ensure evals directory exists if evalsFilePath is enabled
        if (!fs.existsSync(evalsDir)) {
            mkdirpSync(evalsDir);
        }

        const taskDescription = getTaskDescription(path.join(tasksDir, `${taskName}.txt`));

        // Run the task with the same parameters as the previous run
        const result = await runTask(taskName, previousEval.parameters, {});
        const currentEval = getTaskEvalPayload(taskName, taskDescription, previousEval.parameters, result, null);

        // Save the current evaluation
        recordTaskExecution(evalsFilePath, currentEval);

        // Save the comparison
        const comparisonFilePath = saveEvalComparison(taskName, previousEval, currentEval);

        if (comparisonFilePath) {
            log('eval-task', taskName, {
                task_name: taskName,
                parameters: previousEval.parameters,
                comparison_file: comparisonFilePath
            });
        }

        // Compare previous and current executions using TaskJudgeAgent
        const evaluation = await judgeEvals(taskName, previousEval, currentEval);
        if (evaluation) {
            console.log('\nEvaluation results:');
            console.log(evaluation.evaluation);
        }

        return evaluation;
    } catch (error) {
        logErr('eval-task', taskName, { task_name: taskName }, error);
        console.error('Error evaluating task:', error);
        process.exit(1);
    }
}

/**
 * Evaluates task outputs using TaskJudgeAgent to compare previous and current executions
 * @param {string} taskName - Name of the task being evaluated
 * @param {Object} previousEval - Previous task evaluation data containing task description and output
 * @param {string} previousEval.task_description - Task description from previous execution
 * @param {Object} previousEval.output - Output from previous execution
 * @param {Object} currentEval - Current task evaluation data containing task description and output
 * @param {string} currentEval.task_description - Task description from current execution  
 * @param {Object} currentEval.output - Output from current execution
 * @returns {Object|null} Evaluation results containing previous and current eval data, judge evaluation text, and token usage logs. Returns null on error.
 */
async function judgeEvals(taskName, previousEval, currentEval) {
    try {        
        const taskJudge = new TaskJudgeAgent(
            'task-judge',
            config.openai
        );

        const evaluation = await taskJudge.evaluateTask(
            previousEval.task_description,
            JSON.stringify(previousEval.output, null, 2),
            currentEval.task_description, 
            JSON.stringify(currentEval.output, null, 2)
        );

        return {
            previous: previousEval,
            current: currentEval,
            evaluation: evaluation,
            token_usage_logs: taskJudge.getTokenUsageLogs()
        };
    } catch (error) {
        console.error('Error saving evaluation comparison:', error);
        return null;
    }
}
