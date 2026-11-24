import { describe, expect, it } from 'vitest';
import { loadChart, type Chart } from '@/lib/terminal/helm-chart';
import { renderChart, renderTemplates } from '@/lib/terminal/helm-render';
import { coalesce, mergeMaps, parseSet, parseValues } from '@/lib/terminal/helm-values';
import { GoInt, goFloat, goSprintf, type VMap } from '@/lib/terminal/helm-value';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §2–§5): the Go text/template engine for Helm (trimming, pipelines,
 * variables and their scope, if/with/range, define/include/template, the functions), Go's and Helm's error texts, the
 * float64 values of YAML, and values precedence (values.yaml < -f < --set, --set's syntax and types).
 */
const CHART = 'apiVersion: v2\nname: web\nversion: 0.1.0\nappVersion: "1.16.0"\n';
const OPTS = { name: 'web', namespace: 'default', revision: 1, install: true, kubeVersion: 'v1.32.3', apiVersions: ['v1', 'apps/v1'] };
function chart(templates: Record<string, string>, values = ''): Chart {
  const c = loadChart({ 'Chart.yaml': CHART, 'values.yaml': values, 'files/hello.txt': 'hello file', ...Object.fromEntries(Object.entries(templates).map(([k, v]) => [`templates/${k}`, v])) });
  if ('error' in c) throw new Error(c.error);
  return c;
}
/** templates/x.yaml rendered (or the error), with more templates and user values. */
function x(text: string, values = '', more: Record<string, string> = {}, user: VMap = {}): string {
  const c = chart({ 'x.yaml': text, ...more }, values), r = renderTemplates(c, coalesce(c.values, user), OPTS);
  return 'error' in r ? `ERROR ${r.error}` : r.out['web/templates/x.yaml'];
}

describe('the template language', () => {
  it('trims whitespace with {{- and -}}, drops comments, keeps text', () => {
    expect(x('a  {{- "b" -}}  c')).toBe('abc');
    expect(x('a\n{{- /* a comment */}}\nb {{/* x */}}c')).toBe('a\nb c');
    expect(x('{{- if true }}\n  yes\n{{- end }}\n')).toBe('\n  yes\n');
    expect(x('{{-3}} {{ - 3 }}')).toMatch(/^ERROR|^-3/);
  });
  it('evaluates pipelines, variables and their scope', () => {
    expect(x('{{ $x := "hi" }}{{ $x | upper }} {{ .Values.name | default "web" | quote }}')).toBe('HI "web"');
    expect(x('{{ $x := 1 }}{{ if true }}{{ $x = 2 }}{{ $y := 3 }}{{ end }}{{ $x }}')).toBe('2');
    expect(x('{{ if true }}{{ $y := 3 }}{{ end }}{{ $y }}')).toBe('ERROR parse error at (web/templates/x.yaml:1): undefined variable "$y"');
    expect(x('{{ with .Values.image }}{{ .repository }}:{{ .tag }} {{ $.Release.Name }}{{ end }}', 'image:\n  repository: nginx\n  tag: "1.27"\n')).toBe('nginx:1.27 web');
    expect(x('{{ with .Values.none }}x{{ else }}none{{ end }}')).toBe('none');
  });
  it('branches with if, else if and else', () => {
    const t = '{{ if eq .Values.mode "a" }}A{{ else if eq .Values.mode "b" }}B{{ else }}C{{ end }}';
    expect(['a', 'b', 'z'].map(m => x(t, `mode: ${m}\n`))).toEqual(['A', 'B', 'C']);
    expect(x('{{ if and .Values.a (not .Values.b) }}y{{ end }}{{ or .Values.b "z" }}', 'a: true\nb: false\n')).toBe('yz');
  });
  it('ranges over lists ($i, $v) and maps in sorted key order, with break, continue and else', () => {
    expect(x('{{ range $i, $v := .Values.l }}{{ $i }}:{{ $v }} {{ end }}', 'l: [a, b, c]\n')).toBe('0:a 1:b 2:c ');
    expect(x('{{ range $k, $v := .Values.m }}{{ $k }}={{ $v }};{{ end }}', 'm:\n  b: 2\n  a: 1\n  c: x\n')).toBe('a=1;b=2;c=x;');
    expect(x('{{ range .Values.l }}{{ if eq . "b" }}{{ continue }}{{ end }}{{ if eq . "d" }}{{ break }}{{ end }}{{ . }}{{ end }}', 'l: [a, b, c, d, e]\n')).toBe('ac');
    expect(x('{{ range .Values.none }}x{{ else }}empty{{ end }}')).toBe('empty');
    expect(x('{{ range .Values.n }}{{ end }}', 'n: 5\n')).toBe('ERROR template: web/templates/x.yaml:1:9: executing "web/templates/x.yaml" at <{{range .Values.n}}{{end}}>: range can\'t iterate over 5');
  });
  it('defines and includes templates (include with nindent, template, a later file does not override the first)', () => {
    const helpers = '{{- define "web.labels" -}}\napp: {{ .Chart.Name }}\nrelease: {{ .Release.Name }}\n{{- end }}\n{{ define "web.name" }}{{ .Chart.Name | trunc 63 | trimSuffix "-" }}{{ end }}';
    expect(x('metadata:\n  labels:\n    {{- include "web.labels" . | nindent 4 }}\n  name: {{ template "web.name" . }}', '', { '_helpers.tpl': helpers }))
      .toBe('metadata:\n  labels:\n    app: web\n    release: web\n  name: web');
    expect(x('{{ include "web.name" . }}', '', { '_helpers.tpl': helpers, 'z.tpl': '{{ define "web.name" }}other{{ end }}' })).toBe('web');
    expect(x('{{ include "nope" . }}')).toBe('ERROR template: web/templates/x.yaml:1:3: executing "web/templates/x.yaml" at <include "nope" .>: error calling include: template: no template "nope" associated with template "gotpl"');
    expect(x('{{ template "nope" . }}')).toBe('ERROR template: web/templates/x.yaml:1:3: executing "web/templates/x.yaml" at <{{template "nope" .}}>: template "nope" not defined');
    expect(x('{{ define "a" }}1{{ end }}{{ define "a" }}2{{ end }}')).toBe('ERROR parse error at (web/templates/x.yaml:1): multiple definition of template "a"');
  });
  it('renders toYaml, quote, default and the sprig subset', () => {
    expect(x('resources:\n  {{- toYaml .Values.r | nindent 2 }}\nl: {{ toYaml .Values.l | indent 2 | trim }}', 'r:\n  limits:\n    cpu: 500m\n    memory: 128Mi\nl: [1, "x"]\n'))
      .toBe('resources:\n  limits:\n    cpu: 500m\n    memory: 128Mi\nl: - 1\n  - x');
    expect(x('{{ quote .Values.none }}|{{ quote "a" 2 }}|{{ default 3 .Values.zero }}|{{ toString 2.5 }}', 'zero: 0\n')).toBe('|"a" "2"|3|2.5');
    expect(x('{{ "Hello" | lower | replace "l" "L" }} {{ "abc" | b64enc }} {{ "abc" | sha256sum | trunc 8 }} {{ trimPrefix "v" "v1.2" }} {{ contains "ell" "hello" }}')).toBe('heLLo YWJj ba7816bf 1.2 true');
    expect(x('{{ $d := dict "a" 1 "b" (list 1 2) }}{{ hasKey $d "a" }} {{ $d.b }} {{ len $d.b }} {{ index $d.b 1 }} {{ ternary "y" "n" (empty $d.c) }} {{ toJson $d }}')).toBe('true [1 2] 2 2 y {"a":1,"b":[1,2]}');
    expect(x('{{ printf "%s-%d-%v-%q" "a" 3 .Values.n "x" }} {{ print 1 2 "a" }} {{ join "," (list "a" "b") }} {{ int "42" }}', 'n: 1.5\n')).toBe('a-3-1.5-"x" 1 2a a,b 42');
  });
  it('gives the chart, release, capabilities, template and files', () => {
    expect(x('{{ .Chart.Name }}-{{ .Chart.Version }}-{{ .Chart.AppVersion }} {{ .Release.Namespace }} {{ .Release.Revision }} {{ .Release.IsInstall }} {{ .Release.Service }} {{ .Capabilities.KubeVersion }} {{ .Capabilities.KubeVersion.Minor }} {{ .Capabilities.APIVersions.Has "apps/v1" }} {{ .Template.Name }} {{ .Files.Get "files/hello.txt" }}'))
      .toBe('web-0.1.0-1.16.0 default 1 true Helm v1.32.3 32 true web/templates/x.yaml hello file');
    expect(x('{{ .Chart.Nope }}')).toBe('ERROR template: web/templates/x.yaml:1:9: executing "web/templates/x.yaml" at <.Chart.Nope>: can\'t evaluate field Nope in type interface {}');
  });
  it('prints YAML numbers as float64 and --set integers as int64', () => {
    expect(x('{{ .Values.n }} {{ .Values.big }} {{ .Values.f }} {{ .Values.tag }} {{ printf "%d" .Values.n }}', 'n: 3\nbig: 1000000\nf: 0.00001\ntag: 1.20\n')).toBe('3 1e+06 1e-05 1.2 %!d(float64=3)');
    expect(x('{{ printf "%d" .Values.n }}', 'n: 3\n', {}, { n: new GoInt(5, 'int64') })).toBe('5');
    expect(goFloat(4294967296)).toBe('4.294967296e+09');
    expect(goSprintf('%s %d %v', [1.5, 'x'])).toBe('%!s(float64=1.5) %!d(string=x) %!v(MISSING)');
  });
  it('prints missing values as nothing, and Go\'s errors for nil and wrong types', () => {
    expect(x('[{{ .Values.missing }}] [{{ .Values.a.b }}]', 'a: {}\n')).toBe('[] []');
    expect(x('image: {{ .Values.image.tag }}')).toBe('ERROR template: web/templates/x.yaml:1:17: executing "web/templates/x.yaml" at <.Values.image.tag>: nil pointer evaluating interface {}.tag');
    expect(x('{{ .Values.missing | upper }}')).toBe('ERROR template: web/templates/x.yaml:1:21: executing "web/templates/x.yaml" at <upper>: invalid value; expected string');
    expect(x('{{ upper .Values.missing }}')).toBe('ERROR template: web/templates/x.yaml:1:16: executing "web/templates/x.yaml" at <.Values.missing>: wrong type for value; expected string; got interface {}');
    expect(x('{{ nindent .Values.n "x" }}', 'n: 2\n')).toBe('ERROR template: web/templates/x.yaml:1:18: executing "web/templates/x.yaml" at <.Values.n>: wrong type for value; expected int; got float64');
    expect(x('{{ if eq .Values.n 1 }}{{ end }}', 'n: 1\n')).toBe('ERROR template: web/templates/x.yaml:1:6: executing "web/templates/x.yaml" at <eq .Values.n 1>: error calling eq: incompatible types for comparison');
    expect(x('{{ .Values.s.x }}', 's: str\n')).toBe('ERROR template: web/templates/x.yaml:1:10: executing "web/templates/x.yaml" at <.Values.s.x>: can\'t evaluate field x in type interface {}');
    expect(x('{{ upper 5 }}')).toBe('ERROR template: web/templates/x.yaml:1:9: executing "web/templates/x.yaml" at <5>: expected string; found 5');
    expect(x('{{ default }}')).toBe('ERROR template: web/templates/x.yaml:1:3: executing "web/templates/x.yaml" at <default>: wrong number of args for default: want at least 1 got 0');
  });
  it('reports required and fail at the outermost location', () => {
    expect(x('image: {{ required "image.tag is required" .Values.image.tag }}', 'image: {}\n')).toBe('ERROR execution error at (web/templates/x.yaml:1:10): image.tag is required');
    expect(x('a\n  {{ include "t" . }}', '', { '_h.tpl': '{{ define "t" }}{{ fail "no way" }}{{ end }}' })).toBe('ERROR execution error at (web/templates/x.yaml:2:5): no way');
  });
  it('reports parse errors as Helm does', () => {
    expect(x('{{ foo }}')).toBe('ERROR parse error at (web/templates/x.yaml:1): function "foo" not defined');
    expect(x('a\n{{ if .Values.x }}\nb')).toBe('ERROR parse error at (web/templates/x.yaml:3): unexpected EOF');
    expect(x('{{ end }}')).toBe('ERROR parse error at (web/templates/x.yaml:1): unexpected {{end}}');
    expect(x('{{ .Values.x }')).toBe('ERROR parse error at (web/templates/x.yaml:1): unexpected "}" in operand');
    expect(x('x\n{{ .Values.x')).toBe('ERROR parse error at (web/templates/x.yaml:2): unclosed action');
    expect(x('{{ "a }}')).toBe('ERROR parse error at (web/templates/x.yaml:1): unterminated quoted string');
  });
  it('renders tpl strings from values', () => {
    expect(x('{{ tpl .Values.greeting . }}', 'greeting: "hi {{ .Release.Name }}"\n')).toBe('hi web');
  });
  it('splits, sorts and names the manifests in install order, notes apart', () => {
    const c = chart({ 'deploy.yaml': 'kind: Deployment\nmetadata:\n  name: a\n', 'svc.yaml': '---\nkind: Service\nmetadata:\n  name: b\n---\nkind: ConfigMap\nmetadata:\n  name: c\n---\n\n',
      'NOTES.txt': '  Hello {{ .Release.Name }}  \n' });
    const r = renderChart(c, c.values, OPTS);
    if ('error' in r) throw new Error(r.error);
    expect(r.manifests.map(m => `${m.source} ${String(m.doc.kind)}`)).toEqual(['web/templates/svc.yaml ConfigMap', 'web/templates/svc.yaml Service', 'web/templates/deploy.yaml Deployment']);
    expect(r.notes).toBe('  Hello web  \n');
    expect(r.text.split('\n').slice(0, 5)).toEqual(['---', '# Source: web/templates/svc.yaml', 'kind: ConfigMap', 'metadata:', '  name: c']);
    const bad = renderChart(chart({ 'x.yaml': 'a: b\n c: d\n' }), {}, OPTS);
    expect(bad).toEqual({ error: 'YAML parse error on web/templates/x.yaml: error converting YAML to JSON: yaml: line 2: mapping values are not allowed in this context' });
  });
});

describe('values precedence', () => {
  it('parses --set: dotted paths, list indexes, lists, escapes and types', () => {
    expect(parseSet('image.tag=1.2.0,replicas=3,debug=true,ratio=1.5,zip=007,none=null', {})).toEqual({ image: { tag: '1.2.0' }, replicas: new GoInt(3, 'int64'), debug: true, ratio: '1.5', zip: '007', none: null });
    expect(parseSet('hosts[1]=b,hosts[0]=a,list={x,y},env[0].name=A,dots=a\\.b,commas=a\\,b', {})).toEqual({ hosts: ['a', 'b'], list: ['x', 'y'], env: [{ name: 'A' }], dots: 'a.b', commas: 'a,b' });
    expect(parseSet('replicas=3', {}, true)).toEqual({ replicas: '3' });
    expect(parseSet('a.b', {})).toEqual({ error: 'key "b" has no value' });
    expect(parseSet('a', {})).toEqual({ error: 'key "a" has no value' });
  });
  it('merges -f files in order and coalesces with the chart\'s values (the user wins, null deletes)', () => {
    const defaults = parseValues('image:\n  repository: nginx\n  tag: "1.0"\nreplicas: 1\nlabels:\n  a: x\n', 'values.yaml') as VMap;
    const f1 = parseValues('image:\n  tag: "2.0"\nlabels: null\n', 'a.yaml') as VMap, f2 = parseValues('image:\n  tag: "3.0"\n', 'b.yaml') as VMap;
    const user = parseSet('replicas=2', mergeMaps(f1, f2)) as VMap;
    expect(coalesce(defaults, user)).toEqual({ image: { repository: 'nginx', tag: '3.0' }, replicas: new GoInt(2, 'int64') });
    expect(parseValues('- a\n', 'x.yaml')).toEqual({ error: 'x.yaml: error unmarshaling JSON: json: cannot unmarshal array into Go value of type map[string]interface {}' });
    expect(parseValues('a: [\n', 'x.yaml')).toMatchObject({ error: expect.stringMatching(/^x\.yaml: error converting YAML to JSON: yaml: line 1: /) });
  });
});
