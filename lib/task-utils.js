import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'mkdirp';

/**
 * Generates a task evaluation record with details about the execution
 * @param {string} taskDescription - Description of the task
 * @param {any} output - Output of the task execution
 * @param {string|null} error - Error message if any
 * @returns {object} Object containing:
 *   - task_description {string} Description of the task
 *   - time {string} ISO timestamp of execution
 *   - output {any} Output from the task execution
 *   - error {string|null} Error message if any occurred, null otherwise
 */
function getTaskDetailsPayload(taskDescription, output, error) {
    return{
        task_description: taskDescription,
        time: new Date().toISOString(),
        output,
        error: error && error.length > 0 ? error : null
    };
}


/**
 * Returns an empty task details object with default values
 * @returns {object} Empty task details with the following properties:
 *   - task_description {string} Empty string for task description
 *   - time {string} Empty string for timestamp
 *   - output {null} Null value for output
 *   - error {null} Null value for error
 */
function getTaskEmptyDetails() {
    return {
        task_description: '',
        time: '',
        output: null,
        error: null
    };
}

/**
 * Reads the task description from the task file
 * @param {string} taskFile - Path to the task file
 * @returns {string} - The task description
 */
export function getTaskDescription(taskFile) {
    try {
        return fs.readFileSync(taskFile, 'utf8');
    } catch (error) {
        console.error(`Error reading task description: ${error.message}`);
        return '';
    }
}

/**
 * Reads and parses task data from a JSON file
 * @param {string} evalsFilePath - Path to the evals file
 * @returns {Object|null} The parsed task data object if successful, null otherwise. Object contains:
 *   - task_name {string} Name of the task
 *   - executions {Array} Array of task executions, each containing:
 *     - parameters {Array} Parameters used for the execution
 *     - validated {Object|undefined} Validated execution details if available
 *     - unvalidated {Object|undefined} Unvalidated execution details if available
 */
export function getTaskData(evalsFilePath) {
    try {
        // Create directory if it doesn't exist
        const recordDir = path.dirname(evalsFilePath);
        if (!fs.existsSync(recordDir)) {
            mkdirpSync(recordDir);
        }

        let taskData = null;
        
        // Try to read existing data if the file exists
        if (fs.existsSync(evalsFilePath)) {
            try {
                taskData = JSON.parse(fs.readFileSync(evalsFilePath, 'utf8'));
            } catch (parseError) {
                console.warn(`Could not parse ${evalsFilePath}: ${parseError.message}`);
            }
        }

        return taskData;
    } catch (error) {
        console.error(`Error reading task data: ${error.message}`);
        return null;
    }
}

/**
 * Records task execution details to a JSON file
 * @param {string} recordFilePath - Path to the record file
 * @param {string} taskName - Name of the task
 * @param {Array} parameters - Parameters used for the task
 * @param {string} taskDescription - Description of the task
 * @param {any} output - Output of the task
 * @param {string|null} error - Error message if any
 * @param {boolean} isValidated - Whether this execution is validated
 */
export function recordTaskExecution(recordFilePath, taskName, parameters, taskDescription, output, error, isValidated = true) {
    try {
        // Create directory if it doesn't exist
        const recordDir = path.dirname(recordFilePath);
        if (!fs.existsSync(recordDir)) {
            mkdirpSync(recordDir);
        }

        let existingData = { task_name: taskName, executions: [] };
        
        const taskData = getTaskData(recordFilePath);
        if (taskData) {
            existingData = taskData;
        }

        // Check if we already have an execution with the same parameters
        const existingExecution = findExecutionByParameters(existingData.executions, parameters);
        const executionDetails = getTaskDetailsPayload(taskDescription, output, error);

        if (existingExecution) {
            // Update the existing execution
            if (isValidated) {
                existingExecution.validated = executionDetails;
            } else {
                existingExecution.unvalidated = executionDetails;
            }
        } else {
            const executionData = {
                parameters,
            };

            // Create a new execution entry
            executionData[isValidated ? 'validated' : 'unvalidated'] = executionDetails;
            if (!isValidated) {
                executionData.validated = getTaskEmptyDetails();
            } else {
                executionData.unvalidated = getTaskEmptyDetails();
            }
            existingData.executions.push(executionData);
        }

        // Write the updated data back to the file
        fs.writeFileSync(recordFilePath, JSON.stringify(existingData, null, 2));
        console.warn(`\nTask execution output saved to ${recordFilePath}`);
    } catch (error) {
        console.error(`\nError recording task execution: ${error.message}`);
    }
}

/**
 * Saves the evaluation analysis to the evals JSON file
 * @param {string} evalsFilePath - Path to the evals JSON file
 * @param {Array} parameters - Parameters used for the task
 * @param {Object} jsonAnalysis - The JSON analysis to save
 */
export function saveEvaluationAnalysis(evalsFilePath, parameters, jsonAnalysis) {
    try {
        // Read the existing evals data
        const evalsData = getTaskData(evalsFilePath);

        if (!evalsData) {
            console.error(`Evaluation file ${evalsFilePath} does not exist`);
            return;
        }

        // Find the execution with matching parameters
        const execution = findExecutionByParameters(evalsData.executions, parameters);

        if (!execution) {
            console.error(`Could not find execution with parameters: ${parameters.join(', ')}`);
            return;
        }

        // Add the jsonAnalysis to the execution data
        execution.evaluation = jsonAnalysis;
        
        // Write the updated data back to the file
        fs.writeFileSync(evalsFilePath, JSON.stringify(evalsData, null, 2));
        console.warn(`\nEvaluation analysis saved to ${evalsFilePath}`);
    } catch (error) {
        console.error(`Error saving evaluation analysis: ${error.message}`);
    }
}

/**
 * Finds an execution by parameters in the task data
 * @param {Array} executions - Array of task executions
 * @param {Array} parameters - Parameters to search for
 * @returns {Object|null} The execution object if found, null otherwise
 */
function findExecutionByParameters(executions, parameters) {
    return executions.find(exec => 
        JSON.stringify(exec.parameters) === JSON.stringify(parameters)
    );
}
