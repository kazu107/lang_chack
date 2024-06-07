// execute.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const pidusage = require('pidusage');

// Pythonインタープリタのパスを指定
const pythonPath = `..\\exec_env\\Python\\Python311\\python.exe`;

// 実行するPythonスクリプトのパス
const scriptPath = path.join(__dirname, 'script.py');

// 入力ファイルのパス
const inputFilePath = path.join(__dirname, 'input.txt');

// ファイル内容を読み取る
fs.readFile(inputFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error(`Error reading file: ${err.message}`);
        return;
    }

    // Pythonスクリプトを子プロセスとして実行
    const startTime = performance.now();
    const pythonProcess = spawn(pythonPath, [scriptPath]);
    let fileSizeInBytes;
    fs.stat(scriptPath, (err, stats) => {
        if (err) {
            console.error(`Error getting file size: ${err.message}`);
        } else {
            fileSizeInBytes = stats.size;
        }
    });
    // ファイル内容を標準入力として渡す
    pythonProcess.stdin.write(data);
    pythonProcess.stdin.end();
    // メモリ使用量を取得する関数
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

    // メモリ使用量を定期的に取得

    const intervalId = setInterval(async () => {
        try {
            const memoryUsage = await getMemoryUsage(pythonProcess.pid);
            if (memoryUsage > maxMemoryUsage) {
                maxMemoryUsage = memoryUsage;
            }
        } catch (err) {
            console.error(`Error getting memory usage: ${err.message}`);
            clearInterval(intervalId);
        }
    }, 50);
    // Pythonスクリプトの出力を受け取る
    pythonProcess.stdout.on('data', (data) => {
        console.log(`Script output:\n${data}`);
        fs.writeFile('output.txt', data, (err) => {
            if (err) {
                console.error(`Error writing file: ${err.message}`);
            }
        });
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Script stderr: ${data}`);
    });

    pythonProcess.on('close', async (code) => {
        try {
            clearInterval(intervalId);
            const endTime = performance.now();
            const executionTime = endTime - startTime;
            if (code !== 0) {
                console.error(`Python script exited with code ${code}`);
            }else {
                console.log(`Python script executed successfully in ${executionTime} ms`);
                console.log(`Maximum memory usage: ${(maxMemoryUsage / 1024).toFixed(0)} kb`);
                console.log(`File size: ${(fileSizeInBytes)} bytes`);
            }
        } catch (err) {
            console.error(`Error getting memory usage: ${err.message}`);
        }
    });
});
