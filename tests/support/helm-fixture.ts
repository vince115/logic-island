import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import { HELM_PROFILE } from '@/lib/terminal/shell';
import { session } from './environments-fixture';
import { storageLab } from './storage-fixture';

/*
 * A synthetic machine for engine stage E39 (docs/curriculum/KUB0_E39_HELM.md), only for tests: kub-39, the E38 machine
 * (storage-fixture.ts) on the helm profile. ~/web is the chart web 0.1.0 (appVersion 1.27: nginx:1.27, 2 replicas, a
 * Service and a ConfigMap, NOTES.txt); ~/prod.yaml sets 3 replicas and the tag 1.28. The repository
 * https://charts.example.test serves web 0.1.0 (published when the cluster was created) and web 0.2.0 (appVersion 1.28,
 * no ConfigMap; published at 10:01, a minute after the machine's start).
 */
const y = (...lines: string[]) => `${lines.join('\n')}\n`;
export const chartYaml = (version: string, app: string, more: string[] = []) => y('apiVersion: v2', 'name: web', 'description: A demo web chart', 'type: application', `version: ${version}`, `appVersion: "${app}"`, ...more);
export const VALUES = y('replicaCount: 2', 'image:', '  repository: nginx', '  tag: ""', 'service:', '  type: ClusterIP', '  port: 80', 'greeting: hello');
export const HELPERS = y('{{/* The full name: release-chart unless the release name has the chart name. */}}', '{{- define "web.fullname" -}}', '{{- if contains .Chart.Name .Release.Name }}',
  '{{- .Release.Name | trunc 63 | trimSuffix "-" }}', '{{- else }}', '{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}', '{{- end }}', '{{- end }}',
  '{{- define "web.labels" -}}', 'app.kubernetes.io/name: {{ .Chart.Name }}', 'app.kubernetes.io/instance: {{ .Release.Name }}', '{{- end }}');
export const DEPLOY = y('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: {{ include "web.fullname" . }}', '  labels:', '    {{- include "web.labels" . | nindent 4 }}', 'spec:',
  '  replicas: {{ .Values.replicaCount }}', '  selector:', '    matchLabels:', '      {{- include "web.labels" . | nindent 6 }}', '  template:', '    metadata:', '      labels:',
  '        {{- include "web.labels" . | nindent 8 }}', '    spec:', '      containers:', '        - name: web', '          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"',
  '          ports:', '            - containerPort: 80');
export const SERVICE = y('apiVersion: v1', 'kind: Service', 'metadata:', '  name: {{ include "web.fullname" . }}', 'spec:', '  type: {{ .Values.service.type }}', '  selector:',
  '    {{- include "web.labels" . | nindent 4 }}', '  ports:', '    - port: {{ .Values.service.port }}', '      targetPort: 80');
export const CONFIGMAP = y('apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: {{ include "web.fullname" . }}-config', 'data:', '  greeting: {{ .Values.greeting | quote }}');
export const NOTES = y('Visit {{ include "web.fullname" . }} on port {{ .Values.service.port }}.');
export const WEB_010: Record<string, string> = { 'Chart.yaml': chartYaml('0.1.0', '1.27'), 'values.yaml': VALUES, 'templates/_helpers.tpl': HELPERS, 'templates/deployment.yaml': DEPLOY,
  'templates/service.yaml': SERVICE, 'templates/configmap.yaml': CONFIGMAP, 'templates/NOTES.txt': NOTES };
export const WEB_020: Record<string, string> = { ...Object.fromEntries(Object.entries(WEB_010).filter(([p]) => p !== 'templates/configmap.yaml')), 'Chart.yaml': chartYaml('0.2.0', '1.28') };
const f = (path: string, content: string): TerminalFile => ({ path, kind: 'file', mode: 0o644, owner: 'learner', content });
const d = (path: string): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner: 'learner' });
/** A chart folder under ~ (its files). */
export const chartFolder = (name: string, files: Record<string, string>): TerminalFile[] => [d(`/home/learner/${name}`), d(`/home/learner/${name}/templates`),
  ...Object.entries(files).map(([p, c]) => f(`/home/learner/${name}/${p}`, c))];
export const helmLab: TerminalMachine = {
  ...storageLab, id: 'kub-39', title: 'kub-39（Helm）', host: 'kub-39', profile: 'helm',
  files: [...storageLab.files ?? [], ...chartFolder('web', WEB_010), f('/home/learner/prod.yaml', y('replicaCount: 3', 'image:', '  tag: "1.28"'))],
  kube: { ...storageLab.kube, helm: { charts: [{ files: WEB_010 }, { files: WEB_020, published: '2026-11-24 10:01:00' }] } },
};
export const withHelm = (m: TerminalMachine, helm: NonNullable<TerminalMachine['kube']>['helm'], files: TerminalFile[] = []): TerminalMachine => ({ ...m, files: [...m.files ?? [], ...files], kube: { ...m.kube, helm } });
export const hm = (...commands: string[]) => session(helmLab, HELM_PROFILE, ...commands);
export const hmOn = (m: TerminalMachine, ...commands: string[]) => session(m, HELM_PROFILE, ...commands);
