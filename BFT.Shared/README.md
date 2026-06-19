# BFT.Shared

.NET 8 class library shared between **BFT.Api** and **BFT.Desktop**.

## Contents

| Namespace | What it contains |
|---|---|
| `BFT.Shared.Dispatch` | Driver assignment logic |
| `BFT.Shared.WeightCheckpoints` | Federal bridge law weight validation |
| `BFT.Shared.Triage` | Health triage priority rules |

## Usage

**Project reference (recommended for now):**
```xml
<ProjectReference Include="..\BFT.Shared\BFT.Shared.csproj" />
```

Switch to an internal NuGet feed when `BFT.Desktop` needs to pin a specific version independently of `BFT.Api`.

## Constraints

- No infrastructure dependencies (no EF Core, no HTTP, no Azure SDK)
- No BFT.Api or BFT.Desktop project references
- Pure domain logic only — both consumers call in, never the other way
