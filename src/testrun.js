'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const pidusage = require('pidusage');
const languages = require('./languages');
const { performance } = require('perf_hooks');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

app.use('/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('Connected');
    socket.on('run', (data) => {
        const { language } = data;

        if (!languages[language]) {
            console.error('Unsupported language. Please specify one of the following: python, cpp, node, ruby, java, perl, php');
            socket.emit('error', 'Unsupported language');
            return;
        }

        // 入力をファイルに書き込む
        const inputFilePath = path.join(__dirname, 'input.txt');
        const inputData = "入力データ"; // 事前に設定された入力データ
        fs.writeFile(inputFilePath, inputData, (err) => {
            if (err) {
                console.error(`Error writing file: ${err.message}`);
                socket.emit('error', 'Error writing input file');
                return;
            }

            const langConfig = languages[language];
            if (langConfig.needsCompilation) {
                compileAndRun(langConfig, inputFilePath, socket);
            } else {
                run(langConfig, inputFilePath, socket);
            }
        });
    });
});

function compileAndRun(langConfig, inputFilePath, socket) {
    const compileArgs = langConfig.args(langConfig.scriptPath);
    const compileProcess = spawn(langConfig.compiler, compileArgs);

    compileProcess.stderr.on('data', (data) => {
        console.error(`Compile stderr: ${data}`);
        socket.emit('error', data.toString());
    });

    compileProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Compilation process exited with code ${code}`);
            socket.emit('error', `Compilation process exited with code ${code}`);
            return;
        }

        console.log('Compilation successful');
        const executablePath = langConfig.scriptPath.replace(/\.(cpp|java|c|rs|kt|cs|go)$/, '');
        const runArgs = langConfig.command ? langConfig.args(executablePath) : [];
        const runProcess = langConfig.command ? spawn(langConfig.command, runArgs) : spawn(executablePath);

        handleProcessOutput(runProcess, inputFilePath, langConfig.scriptPath, socket);
    });
}

function run(langConfig, inputFilePath, socket) {
    const runArgs = langConfig.args(langConfig.scriptPath);
    const runProcess = spawn(langConfig.command, runArgs);

    handleProcessOutput(runProcess, inputFilePath, langConfig.scriptPath, socket);
}

function handleProcessOutput(process, inputFilePath, scriptPath, socket) {
    const startTime = performance.now();

    process.stdin.write(fs.readFileSync(inputFilePath));
    process.stdin.end();

    let outputData = '';
    let errorData = '';

    process.stdout.on('data', (data) => {
        console.log(`Script output:\n${data}`);
        outputData += data.toString();
    });

    process.stderr.on('data', (data) => {
        console.error(`Error: ${data}`);
        errorData += data.toString();
    });

    const getMemoryUsage = (pid) => {
        return new Promise((resolve, reject) => {
            pidusage(pid, (err, stats) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(stats.memory);
                }
            });
        });
    };

    let maxMemoryUsage = 0;
    const intervalId = setInterval(async () => {
        try {
            const memoryUsage = await getMemoryUsage(process.pid);
            if (memoryUsage > maxMemoryUsage) {
                maxMemoryUsage = memoryUsage;
            }
        } catch (err) {
            console.error(`Error getting memory usage (You can ignore this error message): ${err.message}`);
            clearInterval(intervalId);
        }
    }, 50);

    process.on('close', async (code) => {
        clearInterval(intervalId);
        const endTime = performance.now();
        const executionTime = endTime - startTime;

        try {
            const fileSize = fs.statSync(scriptPath).size;
            const result = {
                output: outputData,
                error: errorData,
                maxMemoryUsage: `${(maxMemoryUsage / 1024).toFixed(2)} KB`,
                executionTime: `${executionTime.toFixed(0)} ms`,
                fileSize: `${fileSize} bytes`
            };

            socket.emit('result', result);
        } catch (err) {
            console.error(`Error getting stats: ${err.message}`);
            socket.emit('error', 'Error getting file stats');
        }

        if (code !== 0) {
            console.error(`Process exited with code ${code}`);
        } else {
            console.log('Process executed successfully');
        }
    });
}

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
