import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { COMPILE_TIMEOUT_MS, runProcess } from './support/run-program';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LAB_LANGUAGES, courses } from '../src/content/courses';
const outputs:Record<string,string>={array:'6\n9',stack:'9',queue:'8','binary-search':'4','bubble-sort':'2 3 4 6 7 8',bfs:'0 1 2 3 4'};
const javaAvailable=spawnSync('javac',['-version']).status===0;
for(const course of courses){
 it(`${course.title} Python 範例輸出`,()=>expect(runProcess('python3',['-c',course.codeExamples.Python.code]).stdout.trim()).toBe(outputs[course.slug]));
 it(`${course.title} C++17 範例輸出`,()=>{const dir=mkdtempSync(join(tmpdir(),'logiclab-cpp-'));writeFileSync(join(dir,'main.cpp'),course.codeExamples['C++'].code);runProcess('g++',['-std=c++17',join(dir,'main.cpp'),'-o',join(dir,'main')],'',COMPILE_TIMEOUT_MS);expect(runProcess(join(dir,'main'),[]).stdout.trim()).toBe(outputs[course.slug]);},20000);
 // 2026-11-02: the labs' JavaScript runs on Node.js, the same runtime as these tests.
 it(`${course.title} JavaScript 範例輸出`,()=>expect(runProcess(process.execPath,['-e',course.codeExamples.JavaScript.code]).stdout.trim()).toBe(outputs[course.slug]));
 // Every animation step highlights at least one line, in every language the lab shows.
 it(`${course.title} 各語言都有每個步驟的標記行`,()=>{for(const lang of LAB_LANGUAGES)for(const [key,lines] of Object.entries(course.codeExamples[lang].highlights))expect(lines.length,`${lang} ${key}`).toBeGreaterThan(0);});
 it.skipIf(!javaAvailable)(`${course.title} Java 範例輸出`,()=>{const dir=mkdtempSync(join(tmpdir(),'logiclab-java-'));writeFileSync(join(dir,'Main.java'),course.codeExamples.Java.code);runProcess('javac',[join(dir,'Main.java')],'',COMPILE_TIMEOUT_MS);expect(runProcess('java',['-cp',dir,'Main']).stdout.trim()).toBe(outputs[course.slug]);},20000);
}
