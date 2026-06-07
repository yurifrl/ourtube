{{/* Expand the name of the chart */}}
{{- define "ourtube.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Create a default fully qualified app name */}}
{{- define "ourtube.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Create chart name and version */}}
{{- define "ourtube.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Common labels */}}
{{- define "ourtube.labels" -}}
helm.sh/chart: {{ include "ourtube.chart" . }}
{{ include "ourtube.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* Selector labels */}}
{{- define "ourtube.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ourtube.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
