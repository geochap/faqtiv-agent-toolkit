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
        
        // Try to read existing data if the file exists
        if (fs.existsSync(recordFilePath)) {
            try {
                existingData = JSON.parse(fs.readFileSync(recordFilePath, 'utf8'));
            } catch (parseError) {
                console.warn(`Could not parse existing data, creating new file: ${parseError.message}`);
            }
        }

        const executionData = {
            parameters,
        };

        const executionDetails = getTaskDetailsPayload(taskDescription, output, error);

        // Check if we already have an execution with the same parameters
        let existingExecution = existingData.executions.find(exec => 
            JSON.stringify(exec.parameters) === JSON.stringify(parameters)
        );

        if (existingExecution) {
            // Update the existing execution
            if (isValidated) {
                existingExecution.validated = executionDetails;
            } else {
                existingExecution.unvalidated = executionDetails;
            }
        } else {
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
        console.warn(`\nTask execution record saved to ${recordFilePath}`);
    } catch (error) {
        console.error(`\nError recording task execution: ${error.message}`);
    }
}