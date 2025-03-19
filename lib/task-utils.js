import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'mkdirp';

/**
 * Generates a task evaluation record and saves it to a JSON file
 * @param {string} taskName - Name of the task
 * @param {string} taskDescription - Description of the task
 * @param {Array} parameters - Parameters used for the task execution
 * @param {any} output - Output of the task execution
 * @param {string|null} error - Error message if any
 * @returns {object} - The evaluation record data
 */
export function getTaskEvalPayload(taskName, taskDescription, parameters, output, error) {
    // Create the recordData structure
    const recordData = {
        task_name: taskName,
        task_description: taskDescription,
        parameters,
        execution_time: new Date().toISOString(),
        output,
        error: error && error.length > 0 ? error : null
    };

    return recordData;
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
 * @param {object} recordData - Data to record
 */
export function recordTaskExecution(recordFilePath, recordData) {
    try {
        // Create directory if it doesn't exist
        const recordDir = path.dirname(recordFilePath);
        if (!fs.existsSync(recordDir)) {
            mkdirpSync(recordDir);
        }

        // Write the record data to the file
        fs.writeFileSync(recordFilePath, JSON.stringify(recordData, null, 2));
        console.warn(`\nTask execution record saved to ${recordFilePath}`);
    } catch (error) {
        console.error(`\nError recording task execution: ${error.message}`);
    }
}