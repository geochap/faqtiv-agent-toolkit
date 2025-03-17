import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'mkdirp';
import * as config from '../config.js';
import runTask from './run-task.js';
import { log, logErr } from '../lib/log4j.js';
import { getTaskDescription, getTaskEvalPayload, recordTaskExecution } from '../lib/task-utils.js';

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
        console.log(`Evaluation comparison saved to ${comparisonFilePath}`);
        return comparisonFilePath;
    } catch (error) {
        console.error(`Error saving evaluation comparison: ${error.message}`);
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

        return result;
    } catch (error) {
        logErr('eval-task', taskName, { task_name: taskName }, error);
        console.error('Error evaluating task:', error);
        process.exit(1);
    }
}