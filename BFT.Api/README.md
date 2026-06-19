# BFT.Api

ASP.NET Core 8 Web API for the BFT Services SaaS platform.

## Phase 1 Setup

### Prerequisites
- .NET 8 SDK
- SQL Server LocalDB (dev) or Azure SQL Database (prod)
- Microsoft Entra External ID tenant

### Local development

```bash
dotnet restore
dotnet ef migrations add InitialCreate
dotnet ef database update
dotnet run
```

Swagger UI: `http://localhost:5000/swagger`
Health check: `http://localhost:5000/health`

### Environment variables (production)

Set these in Azure Container Apps secrets:

```
ConnectionStrings__BftDb
Entra__TenantId
Entra__ClientId
Stripe__SecretKey
Azure__SignalR__ConnectionString
Azure__Blob__ConnectionString
```

### EF Core migrations

```bash
# Add a new migration
dotnet ef migrations add <MigrationName>

# Apply to database
dotnet ef database update
```

Migrations are checked into source control. Never apply ad hoc against production.

### Tenant isolation verification

Phase 1 acceptance test: two test tenants must return zero rows for each other's data.
See `/tests/TenantIsolationTests.cs` (Phase 1 task).
