---
description: Azure and Power Platform CLI usage — when to use PAC vs REST APIs
activation: always_on
---

# Azure & Power Platform CLI Rules

This project integrates with Azure Functions, Azure AI Search, Azure Table Storage, Power Automate flows, and Copilot Studio. Use the right tool for each task.

## Tool selection matrix

| Task | Tool | Example |
|---|---|---|
| **Custom connector operations** | `pac connector` | Download, update connector OpenAPI spec |
| **Flow definition edits** | Power Automate management API | Patch flow parameters via REST |
| **Copilot Studio topic edits** | Dataverse API (botcomponents) | PATCH topic YAML to Dataverse |
| **Azure Functions deployment** | `func azure functionapp publish` | Deploy Python function app |
| **Azure resources (search, storage)** | Azure CLI (`az`) | Get tokens, list resources |
| **Authentication** | `az account get-access-token` | Get bearer token for REST calls |

## Common patterns

### 1. PAC Connector operations
```bash
# List connectors
pac connector list

# Download connector definition
pac connector download --connector-id <id> --outputDirectory <path>

# Update connector (after editing apiDefinition.json)
pac connector update --connector-id <id> --api-definition-file <path> --api-properties-file <path>
```

### 2. Power Automate flow patching
Use the Power Automate management API (not Dataverse) — Dataverse PATCH fails for flows.

```python
import json, urllib.request, subprocess

# Get token for Power Automate management API
token = subprocess.check_output(
    ['az', 'account', 'get-access-token', '--resource', 'https://service.flow.microsoft.com/', '--query', 'accessToken', '-o', 'tsv'],
    shell=True
).decode().strip()

# Find flow across environments
envs = ['<env-id-1>', '<env-id-2>', 'Default-<env-id-3>']
for env in envs:
    url = f'https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{env}/flows/{flow_id}?api-version=2016-11-01'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        flow_def = json.loads(urllib.request.urlopen(req).read())
        break
    except urllib.error.HTTPError:
        continue

# Edit flow definition
action = flow_def['properties']['definition']['actions']['<action-name>']
action['inputs']['parameters']['body/<param>'] = "@triggerBody()?['field']"

# PATCH back
body = json.dumps(flow_def).encode('utf-8')
req2 = urllib.request.Request(url, data=body, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}, method='PATCH')
urllib.request.urlopen(req2)
```

### 3. Copilot Studio topic YAML patching
Use Dataverse API for bot components (topics, fallback, etc.).

```python
import json, urllib.request, subprocess

token = subprocess.check_output(
    ['az', 'account', 'get-access-token', '--resource', 'https://orgf0cc52e4.crm5.dynamics.com/', '--query', 'accessToken', '-o', 'tsv'],
    shell=True
).decode().strip()

headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json; charset=utf-8', 'If-Match': '*'}

# PATCH topic YAML
data = open('mq.yaml', encoding='utf-8').read()
req = urllib.request.Request(
    f'https://orgf0cc52e4.crm5.dynamics.com/api/data/v9.2/botcomponents(<topic-guid>)',
    json.dumps({'data': data}).encode(),
    headers,
    method='PATCH'
)
urllib.request.urlopen(req)
```

### 4. Azure Functions deployment
```bash
cd api
func azure functionapp publish <app-name> --python
```

### 5. Azure resource queries
```bash
# List function apps to find resource group
az functionapp list --query "[].{name:name,resourceGroup:resourceGroup}"

# Get Application Insights logs
az monitor app-insights query --workspace <id> --analytics-query "union * | where timestamp > ago(1h) | project timestamp, message"
```

## Important gotchas

- **Dataverse PATCH fails for flows** — use Power Automate management API instead
- **Copilot Studio YAML attachment format** — Adaptive Card attachments via YAML SendActivity not supported in this bot type; use inline citations instead
- **Table Storage RowKey illegal characters** — strip `/`, `\`, `#`, `?`, control chars from conversation IDs before using as RowKey
- **Custom connector caching** — after updating OpenAPI spec, use `pac connector update` to propagate changes
- **Power Fx syntax** — Copilot Studio variables use `System.Conversation.Id` (not `System.Activity.Conversation.Id` — that's invalid)
- **Secrets in git** — never commit connection strings, API keys, or tokens. GitHub push protection will block commits with secrets.

## Authentication resource URLs

| Service | Resource URL for token |
|---|---|
| Dataverse (CRM) | `https://orgf0cc52e4.crm5.dynamics.com/` |
| Power Automate management | `https://service.flow.microsoft.com/` |
| Azure management | `https://management.azure.com/` |
