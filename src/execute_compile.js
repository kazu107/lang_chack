// execute.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');
const pidusage = require('pidusage');

// C++コンパイラのパスを指定
const cppCompilerPath = '..\\exec_env\\msys64\\ucrt64\\bin\\g++.exe'; // 例: '/usr/bin/g++' または 'C:\\MinGW\\bin\\g++.exe'

// C++ソースファイルのパスと出力実行ファイルのパス
const cppFilePath = path.join(__dirname, 'script.cpp');
const outputFilePath = path.join(__dirname, 'script');

// 入力ファイルのパス
const inputFilePath = path.join(__dirname, 'input.txt');

// C++プログラムをコンパイル
const compileProcess = spawn(cppCompilerPath, [cppFilePath, '-o', outputFilePath]);

compileProcess.stdout.on('data', (data) => {
    console.log(`Compile stdout: ${data}`);
});

compileProcess.stderr.on('data', (data) => {
    console.error(`Compile stderr: ${data}`);
});

compileProcess.on('close', (code) => {
    if (code !== 0) {
        console.error(`Compilation process exited with code ${code}`);
        return;
    }
    console.log('Compilation successful');
    // 実行する引数
    const args = ['arg1', 'arg2'];

    // 実行ファイルを実行
    const runProcess = spawn(outputFilePath);
    let inputs = fs.readFileSync(inputFilePath, 'utf8');
    const startTime = performance.now();
    runProcess.stdin.write(inputs);
    runProcess.stdin.end();
    let fileSizeInBytes;
    fs.stat(cppFilePath, (err, stats) => {
        if (err) {
            console.error(`Error getting file size: ${err.message}`);
        } else {
            fileSizeInBytes = stats.size;
        }
    });
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
            const memoryUsage = await getMemoryUsage(runProcess.pid);
            if (memoryUsage > maxMemoryUsage) {
                maxMemoryUsage = memoryUsage;
            }
        } catch (err) {
            console.error(`Error getting memory usage: ${err.message}`);
            clearInterval(intervalId);
        }
    }, 50);

    runProcess.stdout.on('data', (data) => {
        console.log(`Script output:\n${data}`);
        fs.writeFile('output.txt', data, (err) => {
            if (err) {
                console.error(`Error writing file: ${err.message}`);
            }
        });
    });

    runProcess.stderr.on('data', (data) => {
        console.error(`Run stderr: ${data}`);
    });

    runProcess.on('close', (code) => {
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
