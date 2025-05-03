import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'mkdirp';

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
 * @param {Object} options - Additional options (e.g. silent mode)
 */
export function recordTaskExecution(recordFilePath, taskName, parameters, taskDescription, output, error, isValidated = true, options = {}) {
    try {
        // Create directory if it doesn't exist
        const recordDir = path.dirname(recordFilePath);
        if (!fs.existsSync(recordDir)) {
            mkdirpSync(recordDir);
        }

        let executionData = {};
        
        // Read existing file if it exists
        if (fs.existsSync(recordFilePath)) {
            try {
                executionData = JSON.parse(fs.readFileSync(recordFilePath, 'utf8'));
            } catch (parseError) {
                console.warn(`Could not parse ${recordFilePath}: ${parseError.message}`);
                // Continue with empty object
            }
        }

        // Set task name and parameters
        executionData.task_name = taskName;
        executionData.parameters = parameters;
        
        // Create execution details payload
        const executionDetails = {
            task_description: taskDescription,
            time: new Date().toISOString(),
            output,
            error: error && error.length > 0 ? error : null
        };

        // Update validated or unvalidated based on flag
        if (isValidated) {
            executionData.validated = executionDetails;
        } else {
            executionData.unvalidated = executionDetails;
        }

        // Write the updated data back to the file
        fs.writeFileSync(recordFilePath, JSON.stringify(executionData, null, 2));
        
        if (!options.silent) {
            console.warn(`\nTask execution output saved to ${recordFilePath}`);
        }
    } catch (error) {
        console.error(`\nError recording task execution: ${error.message}`);
    }
}

/**
 * Saves the evaluation analysis to the evals JSON file
 * @param {string} evalsFilePath - Path to the evals JSON file
 * @param {Array} parameters - Parameters used for the task
 * @param {Object} jsonAnalysis - The JSON analysis to save
 * @param {Object} options - Additional options (e.g. silent mode)
 */
export function saveEvaluationAnalysis(evalsFilePath, parameters, jsonAnalysis, options = {}) {
    try {
        // Read the existing execution data
        if (!fs.existsSync(evalsFilePath)) {
            console.error(`Evaluation file ${evalsFilePath} does not exist`);
            return;
        }

        let executionData = {};
        try {
            executionData = JSON.parse(fs.readFileSync(evalsFilePath, 'utf8'));
        } catch (parseError) {
            console.error(`Could not parse ${evalsFilePath}: ${parseError.message}`);
            return;
        }

        // Add the jsonAnalysis directly to the execution data
        executionData.evaluation = jsonAnalysis;
        
        // Write the updated data back to the file
        fs.writeFileSync(evalsFilePath, JSON.stringify(executionData, null, 2));
        
        if (!options.silent) {
            console.warn(`\nEvaluation analysis saved to ${evalsFilePath}`);
        }
    } catch (error) {
        console.error(`Error saving evaluation analysis: ${error.message}`);
    }
}


/**
 * Generates a unique filename for an execution based on task name and parameters
 * @param {string} taskName - Name of the task
 * @param {Array} parameters - Parameters used for the execution
 * @returns {string} - A unique filename for the execution
 */
export function getExecutionFileName(taskName, parameters) {
    // Create a hash of parameters to ensure unique filename
    const paramHash = parameters.map(p => String(p).replace(/[^a-z0-9]/gi, '_')).join('_');
    return `${taskName}__${paramHash}.json`;
}
