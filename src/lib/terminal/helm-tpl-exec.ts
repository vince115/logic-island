import { argText, cmdText, location, nodesText, templateText, type Arg, type Cmd, type Node, type Pipe, type Tree } from './helm-tpl-node';
import { dynType, GoInt, GoStruct, goPrint, isMap, truth, type V } from './helm-value';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §2): executing a parsed Go template, after text/template/exec.go.
 * Values carry their static type (interface {} for what a map or list holds, else their own), because Go's messages
 * depend on it: a field of a nil interface is "nil pointer evaluating interface {}.tag", a nil piped into a string
 * parameter is "invalid value; expected string", a float64 given to an int one is "wrong type for value; expected int;
 * got float64". Missing map keys give the zero value (Helm's missingkey=zero), and a pipeline's interface result is dug
 * out ("lovely!"), so a nil prints as <no value>. Errors are ExecError with Go's text.
 */

/** A value as the executor holds it: v, its static type t; bad is the invalid reflect.Value (a nil a pipeline dug out). */
export interface TV { v: V; t: string; bad?: true }
export const INVALID: TV = { v: null, t: '', bad: true };
export type Param = 'string' | 'int' | 'bool' | 'interface {}' | 'reflect.Value' | 'map[string]interface {}' | '[]interface {}';
export interface Env { include(name: string, data: TV): string; tpl(text: string, data: TV): string; lint: boolean; template: string }
export interface FuncSpec { params: Param[]; variadic?: Param; ret: string; call(args: TV[], env: Env): V | TV }
/** A function's own error; warn marks required's and fail's (Helm reports them as "execution error at (…): …"). */
export class FuncError extends Error { constructor(message: string, readonly warn?: string) { super(message); } }
export class ExecError extends Error { constructor(message: string, readonly warn?: string, readonly at?: string) { super(message); } }
export interface Engine { set: Map<string, Tree>; funcs: Readonly<Record<string, FuncSpec>>; budget: { left: number }; env(name: string): Env }
class Jump { constructor(readonly kind: 'break' | 'continue') {} }
const tv = (v: V, t = 'interface {}'): TV => ({ v, t });
const tvTruth = (x: TV) => !x.bad && truth(x.v);
const canBeNil = (t: string) => t === 'interface {}' || t.startsWith('map[') || t.startsWith('[]');

/** Executes the named template with data as its dot (and $), writing into out. */
export function execute(e: Engine, tree: Tree, execName: string, data: TV, out: string[]): void {
  const vars: { name: string; v: TV }[] = [{ name: '$', v: data }];
  let ctx: { pos: number; text: () => string } | null = null;
  const at = (pos: number, text: () => string) => { ctx = { pos, text }; };
  const errorf = (msg: string, warn?: string): never => {
    if (!ctx) throw new ExecError(`template: ${execName}: ${msg}`, warn);
    const loc = location(tree, ctx.pos);
    throw new ExecError(`template: ${loc}: executing ${JSON.stringify(execName)} at <${ctx.text()}>: ${msg}`, warn, loc);
  };
  const tick = () => { if (--e.budget.left < 0) throw new ExecError('（模擬環境：範本執行的步驟超過上限）'); };
  const varValue = (name: string) => { for (let i = vars.length - 1; i >= 0; i--) if (vars[i].name === name) return vars[i].v; return errorf(`undefined variable: ${name}`); };
  const setVar = (name: string, v: TV) => { for (let i = vars.length - 1; i >= 0; i--) if (vars[i].name === name) { vars[i].v = v; return; } errorf(`undefined variable: ${name}`); };

  function walk(dot: TV, nodes: readonly Node[]): void {
    for (const n of nodes) {
      tick();
      switch (n.k) {
        case 'text': out.push(n.text); break;
        case 'action': {
          const v = evalPipeline(dot, n.pipe);
          if (!n.pipe.decl.length) out.push(v.bad ? '<no value>' : goPrint(v.v));
          break;
        }
        case 'if': case 'with': {
          const mark = vars.length, v = evalPipeline(dot, n.pipe);
          if (tvTruth(v)) walk(n.k === 'with' ? v : dot, n.list); else if (n.elseList) walk(dot, n.elseList);
          vars.length = mark;
          break;
        }
        case 'range': walkRange(dot, n); break;
        case 'break': case 'continue': throw new Jump(n.k);
        case 'template': {
          at(n.pos, () => templateText(n));
          const t = e.set.get(n.name);
          if (!t) errorf(`template ${JSON.stringify(n.name)} not defined`);
          const d = n.pipe ? evalPipeline(dot, n.pipe) : INVALID;
          execute(e, t!, n.name, d, out);
          break;
        }
      }
    }
  }
  function walkRange(dot: TV, n: Node & { pipe: Pipe; list: Node[]; elseList?: Node[] }) {
    const mark = vars.length, v0 = evalPipeline(dot, n.pipe), v = v0.t === 'interface {}' && v0.v === null ? INVALID : v0, decl = n.pipe.decl;
    const one = (index: TV, elem: TV) => {
      if (decl.length) { if (n.pipe.assign) setVar(decl[0], decl.length > 1 ? index : elem); else vars[vars.length - 1].v = elem; }
      if (decl.length > 1) { if (n.pipe.assign) setVar(decl[1], elem); else vars[vars.length - 2].v = index; }
      const inner = vars.length;
      try { walk(elem, n.list); } catch (j) { if (!(j instanceof Jump) || j.kind !== 'continue') throw j; } finally { vars.length = inner; }
    };
    let any = false;
    try {
      if (!v.bad) {
        const x = v.v;
        if (Array.isArray(x)) x.forEach((el, i) => { any = true; one(tv(new GoInt(i), 'int'), tv(el)); });
        else if (isMap(x)) for (const key of Object.keys(x).sort()) { any = true; one(tv(key, 'string'), tv(x[key])); }
        else { at(n.pos, () => nodesText([n as Node])); errorf(`range can't iterate over ${goPrint(x)}`); }
      }
    } catch (j) { if (!(j instanceof Jump) || j.kind !== 'break') throw j; any = true; }
    if (!any && n.elseList) walk(dot, n.elseList);
    vars.length = mark;
  }
  function evalPipeline(dot: TV, pipe: Pipe): TV {
    let value: TV | undefined;
    for (const cmd of pipe.cmds) {
      value = evalCommand(dot, cmd, value);
      if (value.t === 'interface {}' && !value.bad) value = value.v === null ? INVALID : { v: value.v, t: dynType(value.v) };
    }
    for (const name of pipe.decl) { if (pipe.assign) setVar(name, value!); else vars.push({ name, v: value! }); }
    return value!;
  }
  function notAFunction(args: readonly Arg[], final: TV | undefined) {
    if (args.length > 1 || final !== undefined) errorf(`can't give argument to non-function ${argText(args[0])}`);
  }
  function evalCommand(dot: TV, cmd: Cmd, final: TV | undefined): TV {
    tick();
    const first = cmd.args[0];
    switch (first.k) {
      case 'field': at(first.pos, () => argText(first)); return evalChain(dot, dot, first.idents, cmd.args, final);
      case 'chain': return evalChainNode(dot, first, cmd.args, final);
      case 'ident': at(first.pos, () => first.name); return evalCall(dot, e.funcs[first.name], cmd, first.name, cmd.args, final);
      case 'pipe': notAFunction(cmd.args, final); return evalPipeline(dot, first.pipe);
      case 'var': return evalVariable(dot, first, cmd.args, final);
    }
    at(first.pos, () => argText(first));
    notAFunction(cmd.args, final);
    if (first.k === 'nil') errorf('nil is not a command');
    if (first.k === 'dot') return dot;
    return constant(first);
  }
  function constant(a: Arg): TV {
    if (a.k === 'bool') return tv(a.val, 'bool');
    if (a.k === 'str') return tv(a.text, 'string');
    if (a.k === 'num') return a.isInt ? tv(new GoInt(a.v), 'int') : tv(a.v, 'float64');
    return errorf(`can't handle ${argText(a)}`);
  }
  function evalVariable(dot: TV, a: Arg & { idents: string[] }, args: readonly Arg[], final: TV | undefined): TV {
    at(a.pos, () => argText(a));
    const v = varValue(a.idents[0]);
    if (a.idents.length === 1) { notAFunction(args, final); return v; }
    return evalChain(dot, v, a.idents.slice(1), args, final);
  }
  function evalChainNode(dot: TV, a: Arg & { k: 'chain' }, args: readonly Arg[], final: TV | undefined): TV {
    if (a.node.k === 'nil') { at(a.pos, () => argText(a)); errorf(`indirection through explicit nil in ${argText(a)}`); }
    const recv = evalArg(dot, null, a.node);
    at(a.pos, () => argText(a));
    return evalChain(dot, recv, a.fields, args, final);
  }
  function evalChain(dot: TV, recv0: TV, idents: readonly string[], args: readonly Arg[], final: TV | undefined): TV {
    let recv = recv0;
    idents.forEach((name, i) => { recv = evalField(dot, name, i === idents.length - 1 ? args : [], i === idents.length - 1 ? final : undefined, recv); });
    return recv;
  }
  function evalField(dot: TV, name: string, args: readonly Arg[], final: TV | undefined, recv: TV): TV {
    if (recv.bad) return INVALID;
    const typ = recv.t, x = recv.v, hasArgs = args.length > 1 || final !== undefined;
    if (x === null) return errorf(`nil pointer evaluating ${typ}.${name}`);
    if (x instanceof GoStruct) {
      const m = x.methods[name];
      if (m) return evalCall(dot, { params: Array(m.length).fill('string'), ret: 'interface {}', call: vs => m(vs.map(a => a.v)) }, null, name, args, final);
      if (Object.hasOwn(x.fields, name)) { if (hasArgs) errorf(`${name} has arguments but cannot be invoked as function`); return tv(x.fields[name], dynType(x.fields[name])); }
      return errorf(`can't evaluate field ${name} in type ${typ}`);
    }
    if (isMap(x)) {
      if (hasArgs) errorf(`${name} is not a method but has arguments`);
      return tv(Object.hasOwn(x, name) ? x[name] : null);
    }
    return errorf(`can't evaluate field ${name} in type ${typ}`);
  }
  function evalCall(dot: TV, fn: FuncSpec, cmd: Cmd | null, name: string, args0: readonly Arg[], final: TV | undefined): TV {
    const args = args0.slice(1), numIn = args.length + (final !== undefined ? 1 : 0), fixed = fn.params.length;
    if (fn.variadic) { if (numIn < fixed) errorf(`wrong number of args for ${name}: want at least ${fixed} got ${args.length}`); }
    else if (numIn !== fixed) errorf(`wrong number of args for ${name}: want ${fixed} got ${numIn}`);
    if (name === 'and' || name === 'or') {
      let v: TV | undefined;
      for (const a of args) { v = evalArg(dot, 'reflect.Value', a); if (tvTruth(v) === (name === 'or')) return v; }
      return final ?? v!;
    }
    const argv = args.map((a, i) => evalArg(dot, i < fixed ? fn.params[i] : fn.variadic!, a));
    if (final !== undefined) argv.push(validateType(final, fn.variadic && numIn - 1 >= fixed ? fn.variadic : fn.params[numIn - 1]));
    let r: V | TV;
    try { r = fn.call(argv, e.env(execName)); } catch (err) {
      if (!(err instanceof FuncError)) throw err;
      if (cmd) at(cmd.pos, () => cmdText(cmd));
      return errorf(`error calling ${name}: ${err.message}`, err.warn);
    }
    return fn.ret === 'reflect.Value' ? r as TV : tv(r as V, fn.ret);
  }
  function evalArg(dot: TV, typ: Param | null, n: Arg): TV {
    at(n.pos, () => argText(n));
    switch (n.k) {
      case 'dot': return validateType(dot, typ);
      case 'nil': if (typ && canBeNil(typ)) return tv(null, typ); return errorf(`cannot assign nil to ${typ}`);
      case 'field': return validateType(evalChain(dot, dot, n.idents, [n], undefined), typ);
      case 'var': return validateType(evalVariable(dot, n, [], undefined), typ);
      case 'pipe': return validateType(evalPipeline(dot, n.pipe), typ);
      case 'ident': return validateType(evalCall(dot, e.funcs[n.name], { pos: n.pos, args: [n] }, n.name, [n], undefined), typ);
      case 'chain': return validateType(evalChainNode(dot, n, [], undefined), typ);
    }
    if (typ === 'bool') return n.k === 'bool' ? tv(n.val, 'bool') : errorf(`expected bool; found ${argText(n)}`);
    if (typ === 'int') return n.k === 'num' && n.isInt ? tv(new GoInt(n.v), 'int') : errorf(`expected integer; found ${argText(n)}`);
    if (typ === 'string') return n.k === 'str' ? tv(n.text, 'string') : errorf(`expected string; found ${argText(n)}`);
    if (typ === null || typ === 'interface {}' || typ === 'reflect.Value') return constant(n);
    return errorf(`can't handle ${argText(n)} for arg of type ${typ}`);
  }
  function validateType(value: TV, typ: Param | null): TV {
    if (typ === null || typ === 'reflect.Value' || typ === 'interface {}') return value.bad && typ === 'interface {}' ? tv(null) : value;
    if (value.bad) return canBeNil(typ) ? tv(null, typ) : errorf(`invalid value; expected ${typ}`);
    const dt = value.t === 'interface {}' ? (value.v === null ? 'interface {}' : dynType(value.v)) : value.t;
    return dt === typ ? tv(value.v, typ) : errorf(`wrong type for value; expected ${typ}; got ${dt}`);
  }

  walk(data, tree.root);
}
