/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §10): the chart helm create writes — a reduced scaffold of Helm
 * v3.16's: Chart.yaml, values.yaml, .helmignore, charts/, and templates/_helpers.tpl (NAME.name, NAME.fullname,
 * NAME.chart, NAME.labels, NAME.selectorLabels as Helm writes them), deployment.yaml, service.yaml and NOTES.txt. Left
 * out (documented): ingress.yaml, hpa.yaml, serviceaccount.yaml, tests/, probes, volumes and securityContext.
 */

export function scaffold(name: string): Record<string, string> {
  const n = name, lines = (...l: string[]) => `${l.join('\n')}\n`;
  return {
    'Chart.yaml': lines('apiVersion: v2', `name: ${n}`, 'description: A Helm chart for Kubernetes', '',
      '# application: a chart that can be installed; library: utilities for other charts (it cannot be installed).', 'type: application', '',
      '# The chart\'s version: change it whenever the chart or its templates change (Semantic Versioning).', 'version: 0.1.0', '',
      '# The version of the application the chart deploys (keep it quoted).', 'appVersion: "1.16.0"'),
    'values.yaml': lines(`# Default values for ${n}.`, '# This is a YAML-formatted file.', '# Declare variables to be passed into your templates.', '', 'replicaCount: 1', '',
      'image:', '  repository: nginx', '  pullPolicy: IfNotPresent', '  # Overrides the image tag whose default is the chart appVersion.', '  tag: ""', '',
      'nameOverride: ""', 'fullnameOverride: ""', '', 'podAnnotations: {}', 'podLabels: {}', '', 'service:', '  type: ClusterIP', '  port: 80', '', 'resources: {}', '',
      'nodeSelector: {}', '', 'tolerations: []', '', 'affinity: {}'),
    '.helmignore': lines('# Patterns to ignore when building packages.', '.DS_Store', '.git/', '*.swp', '*.bak', '*.tmp', '*~'),
    'templates/_helpers.tpl': lines('{{/*', 'Expand the name of the chart.', '*/}}', `{{- define "${n}.name" -}}`, '{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}', '{{- end }}', '',
      '{{/*', 'Create a default fully qualified app name (at most 63 characters: some Kubernetes name fields are limited to this).', 'If the release name contains the chart name it is used as the full name.', '*/}}',
      `{{- define "${n}.fullname" -}}`, '{{- if .Values.fullnameOverride }}', '{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}', '{{- else }}', '{{- $name := default .Chart.Name .Values.nameOverride }}',
      '{{- if contains $name .Release.Name }}', '{{- .Release.Name | trunc 63 | trimSuffix "-" }}', '{{- else }}', '{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}', '{{- end }}', '{{- end }}', '{{- end }}', '',
      '{{/*', 'Create chart name and version as used by the chart label.', '*/}}', `{{- define "${n}.chart" -}}`, '{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}', '{{- end }}', '',
      '{{/*', 'Common labels', '*/}}', `{{- define "${n}.labels" -}}`, `helm.sh/chart: {{ include "${n}.chart" . }}`, `{{ include "${n}.selectorLabels" . }}`, '{{- if .Chart.AppVersion }}',
      'app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}', '{{- end }}', 'app.kubernetes.io/managed-by: {{ .Release.Service }}', '{{- end }}', '',
      '{{/*', 'Selector labels', '*/}}', `{{- define "${n}.selectorLabels" -}}`, `app.kubernetes.io/name: {{ include "${n}.name" . }}`, 'app.kubernetes.io/instance: {{ .Release.Name }}', '{{- end }}'),
    'templates/deployment.yaml': lines('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: {{ include "${n}.fullname" . }}`, '  labels:', `    {{- include "${n}.labels" . | nindent 4 }}`, 'spec:',
      '  replicas: {{ .Values.replicaCount }}', '  selector:', '    matchLabels:', `      {{- include "${n}.selectorLabels" . | nindent 6 }}`, '  template:', '    metadata:',
      '      {{- with .Values.podAnnotations }}', '      annotations:', '        {{- toYaml . | nindent 8 }}', '      {{- end }}', '      labels:', `        {{- include "${n}.labels" . | nindent 8 }}`,
      '        {{- with .Values.podLabels }}', '        {{- toYaml . | nindent 8 }}', '        {{- end }}', '    spec:', '      containers:', '        - name: {{ .Chart.Name }}',
      '          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"', '          imagePullPolicy: {{ .Values.image.pullPolicy }}', '          ports:',
      '            - name: http', '              containerPort: {{ .Values.service.port }}', '              protocol: TCP', '          resources:', '            {{- toYaml .Values.resources | nindent 12 }}',
      '      {{- with .Values.nodeSelector }}', '      nodeSelector:', '        {{- toYaml . | nindent 8 }}', '      {{- end }}', '      {{- with .Values.affinity }}', '      affinity:', '        {{- toYaml . | nindent 8 }}', '      {{- end }}',
      '      {{- with .Values.tolerations }}', '      tolerations:', '        {{- toYaml . | nindent 8 }}', '      {{- end }}'),
    'templates/service.yaml': lines('apiVersion: v1', 'kind: Service', 'metadata:', `  name: {{ include "${n}.fullname" . }}`, '  labels:', `    {{- include "${n}.labels" . | nindent 4 }}`, 'spec:',
      '  type: {{ .Values.service.type }}', '  ports:', '    - port: {{ .Values.service.port }}', '      targetPort: http', '      protocol: TCP', '      name: http', '  selector:', `    {{- include "${n}.selectorLabels" . | nindent 4 }}`),
    'templates/NOTES.txt': lines('1. Get the application URL by running these commands:', '{{- if contains "NodePort" .Values.service.type }}',
      `  export NODE_PORT=$(kubectl get --namespace {{ .Release.Namespace }} -o jsonpath="{.spec.ports[0].nodePort}" services {{ include "${n}.fullname" . }})`,
      '  export NODE_IP=$(kubectl get nodes --namespace {{ .Release.Namespace }} -o jsonpath="{.items[0].status.addresses[0].address}")', '  echo http://$NODE_IP:$NODE_PORT',
      '{{- else if contains "ClusterIP" .Values.service.type }}',
      `  export POD_NAME=$(kubectl get pods --namespace {{ .Release.Namespace }} -l "app.kubernetes.io/name={{ include "${n}.name" . }},app.kubernetes.io/instance={{ .Release.Name }}" -o jsonpath="{.items[0].metadata.name}")`,
      '  export CONTAINER_PORT=$(kubectl get pod --namespace {{ .Release.Namespace }} $POD_NAME -o jsonpath="{.spec.containers[0].ports[0].containerPort}")',
      '  echo "Visit http://127.0.0.1:8080 to use your application"', '  kubectl --namespace {{ .Release.Namespace }} port-forward $POD_NAME 8080:$CONTAINER_PORT', '{{- end }}'),
  };
}
