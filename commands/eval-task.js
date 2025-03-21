import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'mkdirp';
import * as config from '../config.js';
import runTask from './run-task.js';
import { log, logErr } from '../lib/log4j.js';
import { getTaskDescription, recordTaskExecution, saveEvaluationAnalysis } from '../lib/task-utils.js';
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

        // Get all JSON files in the evals directory
        const evalFiles = fs.readdirSync(evalsDir)
            .filter(file => file.endsWith('.json'));
        
        const tasksWithValidation = [];
        
        // Check each file for validated executions
        for (const evalFile of evalFiles) {
            try {
                const evalData = JSON.parse(fs.readFileSync(path.join(evalsDir, evalFile), 'utf8'));
                
                // Check if there's at least one validated execution
                const hasValidatedExecution = evalData.executions && 
                    evalData.executions.some(exec => exec.validated && exec.validated.task_description);
                
                if (hasValidatedExecution) {
                    // Extract task name from filename (remove .json extension)
                    const taskName = evalFile.replace(/\.json$/, '');
                    tasksWithValidation.push(taskName);
                }
            } catch (error) {
                console.warn(`Error parsing ${evalFile}: ${error.message}`);
                // Continue with other files
            }
        }
        
        return tasksWithValidation;
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
 * Ensures the CSV file exists with headers
 * @param {string} csvFilePath - Path to the CSV file
 */
function ensureCsvFileWithHeaders(csvFilePath) {
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
    
    if (!fs.existsSync(csvFilePath)) {
        fs.writeFileSync(csvFilePath, headers + '\n');
    }
}

/**
 * Adds a row to the CSV file with evaluation data
 * @param {string} csvFilePath - Path to the CSV file
 * @param {Object} execution - Execution data
 * @param {Object} jsonAnalysis - JSON analysis from the judge
 */
function addEvaluationRowToCsv(csvFilePath, execution, jsonAnalysis) {
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
        const dateTimeStr = now.toISOString();
        
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
        console.warn(`\nEvaluation data added to CSV file: ${csvFilePath}`);
    } catch (error) {
        console.error(`Error adding evaluation to CSV: ${error.message}`);
    }
}

/**
 * Ensures temporary directory exists
 * @returns {string} - Path to the temporary directory
 */
function ensureTmpDir() {
    if (!fs.existsSync(tmpDir)) {
        mkdirpSync(tmpDir);
    }
    return tmpDir;
}

/**
 * Gets a temporary file path for redirecting output
 * @returns {string} - Path to a temporary file
 */
function getTempFilePath() {
    return path.join(ensureTmpDir(), `temp-output-${uuidv4()}.txt`);
}

/**
 * Evaluates a single task by comparing validated and unvalidated outputs
 * @param {string} taskName - Name of the task to evaluate
 * @param {Object} options - Evaluation options
 * @returns {Array|null} - Array of evaluated executions or null on error
 */
async function evaluateTask(taskName, options = {}) {
    const verbose = options.verbose || false;
    
    // Get all executions to evaluate
    const executionsToEvaluate = getExecutionsToEvaluate(taskName);
    if (!executionsToEvaluate) {
        return null;
    }

    console.log(`Found ${executionsToEvaluate.length} executions to evaluate for task "${taskName}"`);

    try {
        const evalsFilePath = path.join(evalsDir, `${taskName}.json`);
        const csvFilePath = path.join(evalsDir, `${taskName}.csv`);

        // Ensure evals directory exists
        if (!fs.existsSync(evalsDir)) {
            mkdirpSync(evalsDir);
        }
        
        // Ensure CSV file exists with headers
        ensureCsvFileWithHeaders(csvFilePath);

        const taskDescription = getTaskDescription(path.join(tasksDir, `${taskName}.txt`));

        // Evaluate each execution
        for (const execution of executionsToEvaluate) {
            console.log(`\nEvaluating execution with parameters: ${execution.parameters.join(', ')}`);
            
            let result;
            // In verbose mode, don't use temporary files at all so output goes directly to console
            if (verbose) {
                result = await runTask(taskName, execution.parameters, {});
            } else {
                // Create temporary output files
                const tempOutputFile = getTempFilePath();
                const tempErrorFile = getTempFilePath();
                
                // Redirect output and errors to temporary files to avoid console clutter
                result = await runTask(taskName, execution.parameters, {
                    output: tempOutputFile,
                    error: tempErrorFile
                });
                
                // Clean up temporary files
                try {
                    if (fs.existsSync(tempOutputFile)) {
                        fs.unlinkSync(tempOutputFile);
                    }
                    if (fs.existsSync(tempErrorFile)) {
                        fs.unlinkSync(tempErrorFile);
                    }
                } catch (error) {
                    // Non-critical error, just log and continue
                    console.warn(`Warning: Could not clean up temporary files: ${error.message}`);
                }
            }
            
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
            const updatedEvalData = JSON.parse(fs.readFileSync(evalsFilePath, 'utf8'));
            const updatedExecution = updatedEvalData.executions.find(exec => 
                JSON.stringify(exec.parameters) === JSON.stringify(execution.parameters)
            );

            // Compare validated and unvalidated executions using TaskJudgeAgent
            if (updatedExecution && updatedExecution.validated && updatedExecution.unvalidated) {
                const evaluation = await judgeEvals(updatedExecution);
                if (evaluation) {
                    if (verbose) {
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
                        if (verbose) {
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
                        console.log(`\nVERDICT: ${json.verdict}`);
                        
                        // Show explanation only in verbose mode
                        if (verbose) {
                            console.log(`\nEXPLANATION: ${json.explanation}`);
                        }
                        
                        // Save the jsonAnalysis to the evaluation file
                        saveEvaluationAnalysis(evalsFilePath, execution.parameters, json);
                        
                        // Add evaluation data to CSV
                        addEvaluationRowToCsv(csvFilePath, updatedExecution, json);
                    }

                    console.log('\n' + '='.repeat(80));
                }
            } else {
                console.error(`Error: Unable to find updated execution data with both validated and unvalidated parts for parameters: ${execution.parameters.join(', ')}`);
            }
        }

        return executionsToEvaluate;
    } catch (error) {
        logErr('eval-task', taskName, { task_name: taskName }, error);
        console.error(`Error evaluating task "${taskName}": ${error.message}`);
        return null;
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
    
    // Require either a task name or --all flag
    if (!taskName && !processAllTasks) {
        console.error('Error: You must provide either a task name or the --all flag.');
        console.error('Usage:');
        console.error('  eval-task <taskName>   - Evaluate a specific task');
        console.error('  eval-task --all        - Evaluate all tasks with validation data');
        process.exit(1);
    }
    
    if (processAllTasks) {
        // Process all tasks that have validation data
        const allTasks = getAllTasksWithValidationData();
        
        if (allTasks.length === 0) {
            console.error('No tasks found with validation data. Run tasks with --save-eval first.');
            process.exit(1);
        }
        
        console.log(`Found ${allTasks.length} tasks with validation data: ${allTasks.join(', ')}`);
        
        // Determine the optimal number of concurrent tasks based on available CPU cores
        // Get the number of available CPU cores
        const cpuCount = os.cpus().length;
        
        // Calculate the optimal concurrency:
        // - Minimum of 2 tasks to ensure some parallelism
        // - Maximum of cpuCount-1 to leave one core for the system
        // - If system has only 1 core, still use 1
        const MAX_CONCURRENT_TASKS = Math.max(2, Math.min(cpuCount - 1, 8));
        
        console.log(`Running with ${MAX_CONCURRENT_TASKS} concurrent tasks based on ${cpuCount} CPU cores`);
        
        // Process tasks in parallel with a concurrency limit
        const evaluatedTasks = [];
        const failedTasks = [];
        
        // Create a function to process tasks in batches
        async function processBatch(taskBatch) {
            const promises = taskBatch.map(async (task) => {
                try {
                    console.log(`\n${'='.repeat(40)}\nProcessing task: ${task}\n${'='.repeat(40)}\n`);
                    const result = await evaluateTask(task, options);
                    if (result) {
                        return { task, success: true };
                    } else {
                        return { task, success: false };
                    }
                } catch (error) {
                    console.error(`Error processing task ${task}: ${error.message}`);
                    return { task, success: false, error: error.message };
                }
            });
            
            return Promise.all(promises);
        }
        
        // Process tasks in batches to control concurrency
        for (let i = 0; i < allTasks.length; i += MAX_CONCURRENT_TASKS) {
            const taskBatch = allTasks.slice(i, i + MAX_CONCURRENT_TASKS);
            const results = await processBatch(taskBatch);
            
            // Collect results
            for (const result of results) {
                if (result.success) {
                    evaluatedTasks.push(result.task);
                } else {
                    failedTasks.push(result.task);
                }
            }
        }
        
        console.log(`\nEvaluation complete for ${evaluatedTasks.length} of ${allTasks.length} tasks.`);
        if (failedTasks.length > 0) {
            console.log(`Failed tasks: ${failedTasks.join(', ')}`);
        }
        
        return evaluatedTasks;
    } else {
        // Process a single task
        const result = await evaluateTask(taskName, options);
        if (!result) {
            process.exit(1);
        }
        
        return [taskName];
    }
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
