// execute.js
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const pidusage = require('pidusage');
const languages = require('./languages');
const {performance} = require("perf_hooks");
const express = require('express');

let language = 'cpp'; // 'python', 'cpp', 'node', 'ruby', 'java', 'perl', 'php' など
language = "python";
if (!languages[language]) {
    console.error('Unsupported language. Please specify one of the following: python, cpp, node, ruby, java, perl, php');
    process.exit(1);
}
//入力ファイルのパス
const inputFilePath = path.join(__dirname, 'input.txt');
//ファイル内容を読み取る
fs.readFile(inputFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error(`Error reading file: ${err.message}`);
        return;
    }
    //言語の設定を取得
    const langConfig = languages[language];
    //コンパイルが必要かどうか
    if (langConfig.needsCompilation) {
        compileAndRun(langConfig, data);
    } else {
        run(langConfig, data);
    }
});

//コンパイルして実行
function compileAndRun(langConfig, data) {
    //コンパイルする引数
    const compileArgs = langConfig.args(langConfig.scriptPath);
    //コンパイルプロセスを実行
    const compileProcess = spawn(langConfig.compiler, compileArgs);

    compileProcess.stderr.on('data', (data) => {
        console.error(`Compile stderr: ${data}`);
    });

    compileProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Compilation process exited with code ${code}`);
            return;
        }

        console.log('Compilation successful');
        //実行ファイルのパス
        const executablePath = langConfig.scriptPath.replace(/\.(cpp|java)$/, '');
        //実行する引数
        const runArgs = langConfig.command ? langConfig.args(executablePath) : [];
        //実行プロセスを実行
        const runProcess = langConfig.command ? spawn(langConfig.command, runArgs) : spawn(executablePath);

        handleProcessOutput(runProcess, data, langConfig.scriptPath);
    });
}
//インタープリタを実行
function run(langConfig, data) {
    //実行する引数
    const runArgs = langConfig.args(langConfig.scriptPath);
    //実行プロセスを実行
    const runProcess = spawn(langConfig.command, runArgs);

    handleProcessOutput(runProcess, data, langConfig.scriptPath);
}
//共通の処理
function handleProcessOutput(process, data, scriptPath) {
    //ファイル内容を標準入力として渡す
    process.stdin.write(data);
    process.stdin.end();
    //実行時間の計測開始
    const startTime = performance.now();

    process.stdout.on('data', (data) => {
        console.log(`Script output:\n${data}`);
        //標準出力をファイルに書き込む
        fs.writeFile('output.txt', data, (err) => {
            if (err) {
                console.error(`Error writing file: ${err.message}`);
            }
        });
    });
    //実行時エラーを表示
    process.stderr.on('data', (data) => {
        console.error(`Error: ${data}`);
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
    //最大メモリ使用量
    let maxMemoryUsage = 0;
    // メモリ使用量を定期的に取得
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
    //プロセスが終了したときの処理
    process.on('close', async (code) => {
        clearInterval(intervalId);
        //実行時間の計測終了
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        try {
            const fileSize = fs.statSync(scriptPath).size;
            console.log(`Maximum memory usage: ${(maxMemoryUsage / 1024)} kb`);
            console.log(`Execution time: ${executionTime.toFixed(0)} ms`);
            console.log(`File size: ${(fileSize)} bytes`);
        } catch (err) {
            console.error(`Error getting stats: ${err.message}`);
        }

        if (code !== 0) {
            console.error(`Process exited with code ${code}`);
        } else {
            console.log('Process executed successfully');
        }
    });
}
