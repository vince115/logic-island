import { expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { courses } from '../src/content/courses';
const outputs:Record<string,string>={array:'6\n9',stack:'9',queue:'8','binary-search':'4','bubble-sort':'2 3 4 6 7 8',bfs:'0 1 2 3 4'};
const javaAvailable=spawnSync('javac',['-version']).status===0;
for(const course of courses){
 it(`${course.title} Python 範例輸出`,()=>expect(execFileSync('python3',['-c',course.codeExamples.Python.code],{encoding:'utf8'}).trim()).toBe(outputs[course.slug]));
 it(`${course.title} C++17 範例輸出`,()=>{const dir=mkdtempSync(join(tmpdir(),'logiclab-cpp-'));writeFileSync(join(dir,'main.cpp'),course.codeExamples['C++'].code);execFileSync('g++',['-std=c++17',join(dir,'main.cpp'),'-o',join(dir,'main')]);expect(execFileSync(join(dir,'main'),{encoding:'utf8'}).trim()).toBe(outputs[course.slug]);},20000);
 it.skipIf(!javaAvailable)(`${course.title} Java 範例輸出`,()=>{const dir=mkdtempSync(join(tmpdir(),'logiclab-java-'));writeFileSync(join(dir,'Main.java'),course.codeExamples.Java.code);execFileSync('javac',[join(dir,'Main.java')]);expect(execFileSync('java',['-cp',dir,'Main'],{encoding:'utf8'}).trim()).toBe(outputs[course.slug]);},20000);
}
