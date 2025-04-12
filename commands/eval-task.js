import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'mkdirp';
import * as config from '../config.js';
import runTask from './run-task.js';
import { log, logErr } from '../lib/log4j.js';
import { getTaskDescription, recordTaskExecution, saveEvaluationAnalysis, getExecutionFileName } from '../lib/task-utils.js';
import TaskJudgeAgent from '../ai/task-judge-agent.js';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

const tasksDir = config.project.tasksDir;
const evalsDir = config.project.evalsDir;
const tmpDir = config.project.tmpDir;

/**
 * Gets all task names that have validation data
 * @returns {Array} - Array of task names with validation data
 */
function getAllTasksWithValidationData() {
    try {
        if (!fs.existsSync(evalsDir)) {
            return [];
        }

        // Create a Set to store unique task names
        const tasksWithValidation = new Set();
        
        // Get all JSON files in the evals directory
        const evalFiles = fs.readdirSync(evalsDir)
            .filter(file => file.endsWith('.json'));
        
        // Check each file for validated executions
        for (const evalFile of evalFiles) {
            try {
                const evalData = JSON.parse(fs.readFileSync(path.join(evalsDir, evalFile), 'utf8'));
                
                // Check if this is a validated execution
                if (evalData.validated && evalData.validated.task_description) {
                    // Extract task name from the execution file
                    const taskName = evalData.task_name || evalFile.split('__')[0];
                    tasksWithValidation.add(taskName);
                }
            } catch (error) {
                console.warn(`Error parsing ${evalFile}: ${error.message}`);
                // Continue with other files
            }
        }
        
        return Array.from(tasksWithValidation);
    } catch (error) {
        console.error(`Error getting tasks with validation data: ${error.message}`);
        return [];
    }
}

/**
 * Gets all executions that have validated data
 * @param {string} taskName - Name of the task
 * @returns {Array|null} - Array of executions with validated data, or null if not found
 */
function getExecutionsToEvaluate(taskName) {
    try {
        if (!fs.existsSync(evalsDir)) {
            console.error(`Evaluations directory ${evalsDir} not found.`);
            return null;
        }

        const executionsToEvaluate = [];
        
        // Get all JSON files in the evals directory that match the task name
        const evalFiles = fs.readdirSync(evalsDir)
            .filter(file => file.startsWith(`${taskName}__`) && file.endsWith('.json'));
        
        if (evalFiles.length === 0) {
            console.error(`No evaluation found for task "${taskName}". Run the task with --save-eval first.`);
            return null;
        }
        
        // Check each file for validated data
        for (const evalFile of evalFiles) {
            try {
                const evalData = JSON.parse(fs.readFileSync(path.join(evalsDir, evalFile), 'utf8'));
                
                // Check if this is a validated execution
                if (evalData.validated && evalData.validated.task_description) {
                    executionsToEvaluate.push({
                        taskName,
                        parameters: evalData.parameters || [],
                        validated: evalData.validated,
                        fileName: evalFile
                    });
                }
            } catch (error) {
                console.warn(`Error parsing ${evalFile}: ${error.message}`);
                // Continue with other files
            }
        }
        
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
 * Creates a new CSV file with headers
 * @param {string} csvFilePath - Path to the CSV file
 * @param {Object} options - Additional options (e.g. silent mode)
 */
function createCsvFileWithHeaders(csvFilePath, options = {}) {
    const headers = [
        'DateTime',
        'ValidatedTaskDescription',
        'UnvalidatedTaskDescription',
        'Parameters',
        'CorrectnessScore',
        'CompletenessScore',
        'RobustnessScore',
        'Verdict',
    ].join(',');
    
    // Always write headers, overwriting any existing file
    fs.writeFileSync(csvFilePath, headers + '\n');
    
    if (!options.silent) {
        console.log(`Created new CSV file: ${csvFilePath}`);
    }
}

/**
 * Adds a row to the CSV file with evaluation data
 * @param {string} csvFilePath - Path to the CSV file
 * @param {Object} execution - Execution data
 * @param {Object} jsonAnalysis - JSON analysis from the judge
 * @param {Object} options - Additional options (e.g. silent mode)
 */
function addEvaluationRowToCsv(csvFilePath, execution, jsonAnalysis, options = {}) {
    try {
        // Properly escape fields for CSV format 
        const escapeForCsv = (text) => {
            if (text === null || text === undefined) return '';
            
            // Convert to string, remove newlines, and properly escape by:
            // 1. Enclosing the entire field in double quotes
            // 2. Doubling any internal quotes (CSV standard for escaping quotes)
            const escaped = String(text)
                .replace(/\r?\n/g, ' ')  // Replace newlines with spaces
                .replace(/"/g, '""');    // Double any quotes (CSV escaping standard)
                
            return `"${escaped}"`;  // Enclose in quotes to handle commas properly
        };
        
        // Format parameters as a string
        const formatParams = (params) => {
            if (!params || !Array.isArray(params)) return '';
            return escapeForCsv(params.join(', '));
        };
        
        // Get current datetime in ISO format
        const now = new Date();
        const dateTimeStr = execution.unvalidated.time;

        const row = [
            dateTimeStr,
            escapeForCsv(execution.validated.task_description),
            escapeForCsv(execution.unvalidated.task_description),
            formatParams(execution.parameters),
            jsonAnalysis.scores.correctness,
            jsonAnalysis.scores.completeness, 
            jsonAnalysis.scores.robustness,
            escapeForCsv(jsonAnalysis.verdict)
        ].join(',');
        
        fs.appendFileSync(csvFilePath, row + '\n');
        
        if (!options.silent) {
            console.warn(`\nEvaluation data added to CSV file: ${csvFilePath}`);
        }
    } catch (error) {
        console.error(`Error adding evaluation to CSV: ${error.message}`);
    }
}

/**
 * Main entrypoint for the evaluation process
 * @param {string|object} taskNameOrOptions - Either a specific task name to evaluate or options object
 * @param {object} options - Command options (if taskNameOrOptions is a string)
 * @returns {Promise<Array>} - Array of tasks that were evaluated
 */
export default async function(taskNameOrOptions, options = {}) {
    // Handle case where first parameter is the options object
    if (typeof taskNameOrOptions === 'object') {
        options = taskNameOrOptions;
        taskNameOrOptions = null;
    }
    
    const taskName = taskNameOrOptions;
    const processAllTasks = options.all || false;
    const concurrency = options.concurrency || 10; // Default to 10 concurrent executions
    
    // Require either a task name or --all flag
    if (!taskName && !processAllTasks) {
        console.error('Error: You must provide either a task name or the --all flag.');
        console.error('Usage:');
        console.error('  eval-task <taskName>   - Evaluate a specific task');
        console.error('  eval-task --all        - Evaluate all tasks with validation data');
        process.exit(1);
    }
    
    let allTasks = [];
    
    if (processAllTasks) {
        // Get all tasks that have validation data
        allTasks = getAllTasksWithValidationData();
        
        if (allTasks.length === 0) {
            console.error('No tasks found with validation data. Run tasks with --save-eval first.');
            process.exit(1);
        }
    } else {
        // Single task
        allTasks = [taskName];
    }
    
    // Collect all executions from all tasks
    const allExecutions = [];
    
    for (const currentTask of allTasks) {
        const executions = getExecutionsToEvaluate(currentTask);
        if (executions) {
            allExecutions.push(...executions);
        } else {
            console.error(`No valid executions found for task "${currentTask}"`);
        }
    }
    
    if (allExecutions.length === 0) {
        console.error('No executions found to evaluate.');
        process.exit(1);
    }
    
    console.log(`Found a total of ${allExecutions.length} executions across ${allTasks.length} tasks to evaluate`);

    // Print list of tasks to process
    console.log('\nTasks to process:');
    for (const task of allTasks) {
        const taskExecutions = allExecutions.filter(e => e.taskName === task);
        console.log(`- ${task} (${taskExecutions.length} executions)`);
    }

    // Only mention concurrency if there's more than one execution
    if (allExecutions.length > 1) {
        console.log(`\nRunning with concurrency of ${concurrency} executions in parallel`);
    }
    
    // Process all executions in parallel with concurrency limit
    const successfulExecutions = [];
    const failedExecutions = [];
    
    async function processExecution(execution) {
        const currentTaskName = execution.taskName;
        try {
            console.log(`\nEvaluating task "${currentTaskName}" with parameters: ${execution.parameters.join(', ')}`);
            
            const taskDescription = getTaskDescription(path.join(tasksDir, `${currentTaskName}.txt`));

            let result;
            // Run the task with default options
            if (options.verbose) {
                result = await runTask(currentTaskName, execution.parameters, {});
            } else {
                // Run the task with silent mode to suppress console output
                result = await runTask(currentTaskName, execution.parameters, {
                    silent: !options.verbose
                });
            }

            // Create a unique filename for this execution
            const executionFileName = getExecutionFileName(currentTaskName, execution.parameters);
            const executionFilePath = path.join(evalsDir, executionFileName);
            
            // Record the unvalidated execution to its own file
            recordTaskExecution(
                executionFilePath,
                currentTaskName,
                execution.parameters,
                taskDescription,
                result,
                null, // No error
                false, // Mark as unvalidated
                { silent: !options.verbose } // Pass silent option
            );

            log('eval-task', currentTaskName, {
                task_name: currentTaskName,
                parameters: execution.parameters
            });

            // Get the updated execution data from file
            const updatedExecution = JSON.parse(fs.readFileSync(executionFilePath, 'utf8'));

            // Compare validated and unvalidated executions using TaskJudgeAgent
            if (updatedExecution.validated && updatedExecution.unvalidated) {
                const evaluation = await judgeEvals(updatedExecution);
                if (evaluation) {
                    if (options.verbose) {
                        console.log('\nEvaluation results:\n');

                        // Display the textual analysis if available
                        if (evaluation.judgeResponse.textAnalysis) {
                            console.log(evaluation.judgeResponse.textAnalysis);
                            console.log('\n' + '='.repeat(80) + '\n');
                        } else {
                            console.log(evaluation.judgeResponse);
                        }
                    }

                    // Display the JSON scores and verdict if available
                    if (evaluation.judgeResponse.jsonAnalysis) {
                        const json = evaluation.judgeResponse.jsonAnalysis;

                        // Only display detailed analysis in verbose mode
                        if (options.verbose) {
                            // Display summary information
                            if (json.summary) {
                                console.log('SUMMARY:');
                                console.log(`  Validated Task: ${json.summary.validated_task}`);
                                console.log(`  Evaluated Task: ${json.summary.evaluated_task}`);
                            }

                            // Display analysis information
                            if (json.analysis) {
                                console.log('\nANALYSIS:');
                                console.log(`  Similarities: ${json.analysis.similarities}`);
                                console.log(`  Differences: ${json.analysis.differences}`);
                            }

                            // Display semantic correctness
                            if (json.semantic_correctness) {
                                console.log('\nSEMANTIC CORRECTNESS:');
                                console.log(`  ${json.semantic_correctness}`);
                            }

                            // Display scores
                            console.log('\nSCORES:');
                            console.log(`  Correctness: ${json.scores.correctness}/5`);
                            console.log(`  Completeness: ${json.scores.completeness}/5`);
                            console.log(`  Robustness: ${json.scores.robustness}/5`);
                            console.log(`  Overall: ${json.overall_score}/15`);
                        }

                        // Always display verdict (essential information)
                        console.log(`\nVERDICT for ${currentTaskName} (${execution.parameters.join(', ')}): ${json.verdict}`);
                        
                        // Show explanation only in verbose mode
                        if (options.verbose) {
                            console.log(`\nEXPLANATION: ${json.explanation}`);
                        }
                        
                        // Save the jsonAnalysis to the execution file
                        saveEvaluationAnalysis(
                            executionFilePath, 
                            execution.parameters, 
                            json,
                            { silent: !options.verbose }
                        );
                        
                        // Show separator only in verbose mode
                        if (options.verbose) {
                            console.log('\n' + '='.repeat(80));
                        }
                        return { 
                            success: true, 
                            taskName: currentTaskName, 
                            parameters: execution.parameters,
                            executionFilePath: executionFilePath 
                        };
                    }
                }
            } else {
                console.error(`Error: Unable to find both validated and unvalidated data for task "${currentTaskName}" with parameters: ${execution.parameters.join(', ')}`);
                return { success: false, taskName: currentTaskName, parameters: execution.parameters, error: 'Missing validation data' };
            }
        } catch (error) {
            console.error(`Error processing task "${currentTaskName}" with parameters ${execution.parameters.join(', ')}: ${error.message}`);
            return { success: false, taskName: currentTaskName, parameters: execution.parameters, error: error.message };
        }
    }
    
    // Process executions in batches to control concurrency
    for (let i = 0; i < allExecutions.length; i += concurrency) {
        const executionBatch = allExecutions.slice(i, i + concurrency);
        const promises = executionBatch.map(execution => processExecution(execution));
        const results = await Promise.all(promises);
        
        // Collect results
        for (const result of results) {
            if (result && result.success) {
                successfulExecutions.push(result);
            } else if (result) {
                failedExecutions.push(result);
            }
        }
    }
    
    // Now generate all CSV files by reading from JSON files
    const processedTasks = new Set();
    
    for (const execution of successfulExecutions) {
        const currentTaskName = execution.taskName;
        
        // Process each task only once
        if (processedTasks.has(currentTaskName)) {
            continue;
        }
        
        processedTasks.add(currentTaskName);
        
        // Get all successful executions for this task
        const taskExecutions = successfulExecutions.filter(e => e.taskName === currentTaskName);
        
        if (taskExecutions.length === 0) {
            continue;
        }
        
        const csvFilePath = path.join(evalsDir, `${currentTaskName}.csv`);
        
        // Create a new CSV file with headers
        createCsvFileWithHeaders(csvFilePath, { silent: !options.verbose });
        
        console.log(`\nGenerating CSV file for task "${currentTaskName}" with ${taskExecutions.length} evaluations`);
        
        // Process all execution files for this task
        for (const exec of taskExecutions) {
            try {
                // Read execution data from file
                const executionData = JSON.parse(fs.readFileSync(exec.executionFilePath, 'utf8'));
                
                // Check if execution has evaluation data
                if (executionData.evaluation) {
                    // Add to CSV
                    addEvaluationRowToCsv(csvFilePath, executionData, executionData.evaluation, { silent: !options.verbose });
                }
            } catch (error) {
                console.error(`Error processing execution file ${exec.executionFilePath}: ${error.message}`);
            }
        }
    }
    
    console.log(`\nEvaluation complete for ${successfulExecutions.length} of ${allExecutions.length} executions across ${allTasks.length} tasks.`);
    if (failedExecutions.length > 0) {
        console.log(`Failed executions: ${failedExecutions.map(f => `${f.taskName}(${f.parameters.join(', ')})`).join(' | ')}`);
    }
    
    return allTasks;
}

/**
 * Evaluates task outputs using TaskJudgeAgent to compare validated and unvalidated executions
 * @param {Object} executionData - Execution data containing validated and unvalidated outputs
 * @returns {Object|null} Evaluation results containing evaluation text and token usage logs. Returns null on error.
 */
async function judgeEvals(executionData) {
    try {        
        const taskJudge = new TaskJudgeAgent(
            'task-judge',
            config.openai
        );

        const judgeResponse = await taskJudge.evaluateTask(
            executionData.validated.task_description,
            JSON.stringify(executionData.validated.output, null, 2),
            executionData.unvalidated.task_description, 
            JSON.stringify(executionData.unvalidated.output, null, 2)
        );

        return {
            validated: executionData.validated,
            unvalidated: executionData.unvalidated,
            judgeResponse,
            token_usage_logs: taskJudge.getTokenUsageLogs()
        };
    } catch (error) {
        console.error('Error in evaluation process:', error);
        return null;
    }
}
