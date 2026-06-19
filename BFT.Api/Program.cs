using BFT.Api.Data;
using BFT.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Web;

var builder = WebApplication.CreateBuilder(args);

// Auth — Microsoft Entra External ID (CIAM)
builder.Services
    .AddAuthentication()
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("Entra"));

builder.Services.AddAuthorization();

// EF Core — Azure SQL (serverless tier, auto-pause)
builder.Services.AddDbContext<BftDbContext>(opts =>
    opts.UseSqlServer(
        builder.Configuration.GetConnectionString("BftDb"),
        sql => sql.EnableRetryOnFailure(3)));

// Tenant resolution from JWT extension claim
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantService, TenantService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// SignalR — uses Azure SignalR Service in production, in-process locally
var signalRConn = builder.Configuration["Azure:SignalR:ConnectionString"];
var signalRBuilder = builder.Services.AddSignalR();
if (!string.IsNullOrWhiteSpace(signalRConn))
    signalRBuilder.AddAzureSignalR(signalRConn);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy", utc = DateTime.UtcNow }))
   .AllowAnonymous();

app.Run();
